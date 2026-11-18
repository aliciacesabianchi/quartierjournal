#!/usr/bin/env python3
"""Convert the legacy Quartierjournal.sqlite into an idempotent SQL import + a review report.

Usage:
  python3 -I worker/import_sqlite.py path/to/Quartierjournal.sqlite \
      --sql supabase/seed/catalogue_import.sql --report docs/import-report.md

Rules (from the pilot brief):
  * never invent dates, prices, age ranges or registration details
  * weekday patterns stay templates; only rows with an explicit session_date become occurrences
  * keep provenance: every row gets a legacy_ids entry; all URLs kept with their role
  * re-running is safe: deterministic UUIDs + ON CONFLICT DO NOTHING (admin edits are never overwritten)
  * only provider-verified activities are published; everything else imports as draft for review

The SQL is applied with the database owner (Supabase SQL editor or psql), so no service key is needed.
"""
from __future__ import annotations

import argparse
import difflib
import re
import sqlite3
import sys
import unicodedata
import uuid
from collections import defaultdict
from datetime import date
from urllib.parse import urlparse

NS = uuid.UUID("6f1c1f9e-7a43-4c55-9a7e-5b0c2d1e9a01")
SOURCE_DB = "Quartierjournal.sqlite"

# Hosts that list other people's offers. A URL there is a discovery or secondary source, not the organiser.
AGGREGATOR_HOSTS = {"chreis.plus", "mamiio.com", "kikuka.ch", "kulturzueri.ch", "fadenspule.ch"}
# fadenspule.ch is the organiser of Fadenspule itself, but also lists venues -> handled below.

WEEKDAYS = {
    "mon": 1, "monday": 1, "tue": 2, "tuesday": 2, "wed": 3, "wednesday": 3, "thu": 4, "thursday": 4,
    "fri": 5, "friday": 5, "sat": 6, "saturday": 6, "sun": 7, "sunday": 7,
}

CATEGORY = {
    "open play": "play", "indoor play": "play", "play café": "play", "indoor play / café": "play",
    "baby group": "baby", "organised playgroup": "playgroup", "fixed preschool group": "playgroup",
    "music": "music", "musik": "music", "concert": "music",
    "yoga": "movement", "pilates": "movement", "fitness": "movement",
    "caregiver course with baby": "movement",
    "museum visit": "culture", "stories": "culture", "family meetup": "meetup",
}

REGISTRATION = {
    "unknown": "unknown", "contact organiser": "unknown", "reservierung beim studio prüfen": "unknown",
    "drop-in": "not_required", "keine anmeldung": "not_required",
    "required": "required", "enrolment": "required", "anmeldung beim anbieter": "required",
    "anmeldung; 10er-abo vorausbezahlt": "required",
    "advance tickets available; door only if space": "recommended",
    "registration appreciated; drop-in welcome": "recommended",
}

VERIFICATION = {
    "provider verified": "provider_verified", "verified": "provider_verified",
    "organiser verified; check exceptions": "provider_verified",
    "verified_recurring": "provider_verified",
    "source listing; confirm dates": "secondary_source",
    "seed listing; confirm exceptions": "unverified",
}

SELECTED_DATES_RE = re.compile(r"selected|ausgewählt|bestimmten terminen|certain dates|einzelne", re.I)


def uid(*parts: object) -> str:
    return str(uuid.uuid5(NS, ":".join(str(p) for p in parts)))


def q(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def host(url: str | None) -> str | None:
    if not url:
        return None
    h = urlparse(url).hostname or ""
    return h[4:] if h.startswith("www.") else h


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("gemeinschaftszentrum", "gz")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def parse_weekdays(text: str | None) -> list[int]:
    """'Mon', 'Monday', 'Mon–Fri', 'Wed / Fri' -> ISO weekdays. Unparseable -> []."""
    if not text:
        return []
    t = text.strip().lower()
    m = re.fullmatch(r"([a-z]+)\s*[–-]\s*([a-z]+)", t)
    if m and m.group(1) in WEEKDAYS and m.group(2) in WEEKDAYS:
        a, b = WEEKDAYS[m.group(1)], WEEKDAYS[m.group(2)]
        return list(range(a, b + 1)) if a <= b else []
    parts = [p.strip() for p in re.split(r"[/,]| and ", t)]
    if all(p in WEEKDAYS for p in parts):
        return [WEEKDAYS[p] for p in parts]
    return []


def parse_age(text: str | None) -> tuple[float | None, float | None]:
    """Only unambiguous statements with units. Anything vague stays unknown."""
    if not text:
        return None, None
    t = text.lower().replace("½", ".5")
    if re.search(r"approx|ca\.|unknown|unbekannt|unspecified", t):
        return None, None
    if re.fullmatch(r"all ages", t):
        return 0, None
    if re.fullmatch(r"birth to kindergarten", t):
        return 0, None
    m = re.fullmatch(r"from (\d+(?:\.\d+)?) (months?|years?)", t)
    if m:
        n = float(m.group(1)) * (12 if m.group(2).startswith("year") else 1)
        return n, None
    m = re.match(r"(\d+(?:\.\d+)?)\s*(months?|years?)?\s*[–-]\s*(\d+(?:\.\d+)?)\s*(months?|years?)\b", t)
    if m:
        u1 = m.group(2) or m.group(4)
        lo = float(m.group(1)) * (12 if u1.startswith("year") else 1)
        hi = float(m.group(3)) * (12 if m.group(4).startswith("year") else 1)
        return lo, hi
    return None, None


def is_free(price: str | None) -> bool | None:
    if not price:
        return None
    if re.match(r"(free|gratis|kostenlos)\b", price.strip(), re.I):
        return True
    if re.search(r"chf|fr\.|\d", price, re.I):
        return False
    return None  # e.g. "No purchase required" — not the same as a confirmed free entry


def addr_key(s: str | None) -> str:
    """'Leimbachstrasse 200 8041 Zürich' and 'Leimbachstr. 200, 8041 Zürich' -> same key."""
    n = norm(s).replace("strasse", "str")
    n = re.sub(r"\bzurich\b", "", n)
    return re.sub(r"\s+", " ", n).strip()


FEED_TABLES = ("feed_places", "feed_occurrences")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sqlite")
    ap.add_argument("--sql", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--base", help="the previously imported SQLite file: keeps ids stable when activities gain rows")
    args = ap.parse_args()

    db = sqlite3.connect(f"file:{args.sqlite}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    rows = lambda sql: [dict(r) for r in db.execute(sql)]
    has_table = lambda t: db.execute("select 1 from sqlite_master where type='table' and name=?", (t,)).fetchone() is not None
    chunk_n = [0]

    def chunk(force: bool = False):
        """Marks a safe split point (the hosted project's SQL API takes limited sizes). Plain psql ignores it."""
        chunk_n[0] += 1
        if force or chunk_n[0] % 100 == 0:
            out.append("-- @@CHUNK")

    out: list[str] = []
    rep: list[str] = []
    issues: list[str] = []
    emit = out.append

    def legacy(table: str, key: object, target_table: str, target_id: str):
        emit(f"insert into public.legacy_ids (source_db, source_table, source_key, target_table, target_id) values "
             f"({q(SOURCE_DB)}, {q(table)}, {q(str(key))}, {q(target_table)}, {q(target_id)}) on conflict do nothing;")

    sources: dict[str, str] = {}

    def source(url: str | None, **kw) -> str | None:
        if not url:
            return None
        sid = uid("source", url)
        if url not in sources:
            sources[url] = sid
            cols = {"id": sid, "url": url, **kw}
            emit(f"insert into public.sources ({', '.join(cols)}) values ({', '.join(q(v) for v in cols.values())}) "
                 f"on conflict (url) do nothing;")
        return sources[url]

    def link(url: str | None, role: str, **target):
        sid = source(url)
        if not sid:
            return
        (col, tid), = target.items()
        emit(f"insert into public.source_links (source_id, role, {col}) "
             f"select id, {q(role)}, {q(tid)} from public.sources where url = {q(url)} on conflict do nothing;")

    emit("-- Generated by worker/import_sqlite.py from Quartierjournal.sqlite. Do not edit by hand.")
    emit("-- Safe to re-run: existing rows (including admin edits) are left untouched.")
    emit("begin;")

    # ── geography ──
    emit("insert into public.cities (id, name) values ('zurich', 'Zürich') on conflict do nothing;")
    districts = rows("select * from districts order by kreis")
    for d in districts:
        emit(f"insert into public.districts (city_id, number, name) values ('zurich', {d['kreis']}, 'Kreis {d['kreis']}') "
             f"on conflict (city_id, number) do nothing;")
    quarters = rows("select * from quarters")
    q_kreis = {r["quartier"]: r["kreis"] for r in quarters}
    for r in quarters:
        emit(f"insert into public.quartiers (district_id, name) select id, {q(r['quartier'])} from public.districts "
             f"where city_id = 'zurich' and number = {r['kreis']} on conflict (district_id, name) do nothing;")
    counts_check = defaultdict(int)
    for r in quarters:
        counts_check[r["kreis"]] += 1
    for d in districts:
        if d["quartier_count"] != counts_check[d["kreis"]]:
            issues.append(f"Kreis {d['kreis']}: quartier_count says {d['quartier_count']}, {counts_check[d['kreis']]} quartiers listed.")

    # ── organisers (from discovery_directory) ──
    orgs = rows("select * from discovery_directory order by name")
    org_by_host: dict[str, str] = {}
    for o in orgs:
        oid = uid("organiser", o["name"])
        org_by_host[host(o["website"])] = oid
        emit("insert into public.organisers (id, name, website, district_id, discovered_via, notes, status) values "
             f"({q(oid)}, {q(o['name'])}, {q(o['website'])}, "
             f"(select id from public.districts where city_id='zurich' and number = {q(o['kreis'])}), "
             f"{q(o['discovered_via'])}, {q(o['age_scope'])}, 'draft') on conflict do nothing;")
        legacy("discovery_directory", o["name"], "organisers", oid)
        link(o["website"], "organiser", organiser_id=oid)

    # ── activities: group legacy rows into activities ──
    acts = rows("select * from activities order by id")
    group_key = lambda a: (a["venue_id"], a["title"], a["activity_type"], a["age_range"], a["price"],
                           a["registration"], a["audience"], a["provider_url"])
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for a in acts:
        groups[group_key(a)].append(a)

    # Keep ids stable across re-imports: a group that contains a row id of a previously imported group reuses its id.
    old_group_uuid: dict[int, str] = {}
    if args.base:
        bdb = sqlite3.connect(f"file:{args.base}?mode=ro", uri=True); bdb.row_factory = sqlite3.Row
        bgroups: dict[tuple, list[int]] = defaultdict(list)
        for a in bdb.execute("select * from activities order by id"):
            a = dict(a)
            bgroups[group_key(a)].append(a["id"])
        for ids in bgroups.values():
            gid = uid("activity", *ids)
            for i in ids:
                old_group_uuid[i] = gid

    published_venues: set[int] = set()
    act_records = []
    for key, members in groups.items():
        first = members[0]
        verif_vals = {VERIFICATION.get((m["status"] or "").lower(), "unverified") for m in members}
        verification = ("unverified" if "unverified" in verif_vals else
                        "secondary_source" if "secondary_source" in verif_vals else "provider_verified")
        status = "published" if verification == "provider_verified" else "draft"
        if status == "published":
            published_venues.add(first["venue_id"])
        act_records.append((key, members, verification, status))

    # ── venues ──
    venues = rows("select * from venues order by id")
    venue_uuid = {}
    for v in venues:
        vid = uid("venue", v["id"])
        venue_uuid[v["id"]] = vid
        org = org_by_host.get(host(v["provider_url"]))
        status = "published" if v["id"] in published_venues else "draft"
        if v["quartier"] not in q_kreis:
            issues.append(f"Venue {v['id']} {v['name']}: quartier {v['quartier']!r} not in quarters table.")
        qsel = (f"(select qq.id from public.quartiers qq join public.districts d on d.id = qq.district_id "
                f" where d.city_id='zurich' and qq.name = {q(v['quartier'])})")
        emit("insert into public.venues (id, name, kind, quartier_id, address, features, organiser_id, status, verification, data_origin) values "
             f"({q(vid)}, {q(v['name'])}, {q(v['kind'])}, {qsel}, "
             f"{q(v['address'])}, {q(v['features'])}, {q(org)}, {q(status)}, "
             f"{q('provider_verified' if v['id'] in published_venues else 'unverified')}, 'legacy:sqlite') on conflict do nothing;")
        # refresh a corrected quartier, but only on rows nobody has edited since the import
        emit(f"update public.venues set quartier_id = {qsel} where id = {q(vid)} and updated_at = created_at "
             f"and quartier_id is distinct from {qsel};")
        if v["id"] in published_venues:
            # a verified, published activity needs its venue to be public too (an earlier import may have left it as a draft)
            emit(f"update public.venues set status = 'published', verification = 'provider_verified' where id = {q(vid)} and status = 'draft';")
        legacy("venues", v["id"], "venues", vid)
        link(v["provider_url"], "organiser" if host(v["provider_url"]) not in AGGREGATOR_HOSTS else "discovery", venue_id=vid)
        if v["source_url"] != v["provider_url"]:
            link(v["source_url"], "discovery" if host(v["source_url"]) in AGGREGATOR_HOSTS else "evidence", venue_id=vid)

    # ── activities, templates, occurrences ──
    rep_acts = []
    for key, members, verification, status in act_records:
        first = members[0]
        reused = {old_group_uuid[m["id"]] for m in members if m["id"] in old_group_uuid}
        if len(reused) > 1:
            issues.append(f"Activity group {[m['id'] for m in members]} merges previously separate imports {sorted(reused)}; keeping the first.")
        aid = sorted(reused)[0] if reused else uid("activity", *[m["id"] for m in members])
        title = first["title"]
        if first["child_age_min_months"] is not None or first["child_age_max_months"] is not None:
            amin, amax, afrom = first["child_age_min_months"], first["child_age_max_months"], "source_structured"
        else:
            amin, amax = parse_age(first["age_range"])
            afrom = "source_text" if (amin is not None or amax is not None) else None
        reg_text = first["registration"]
        reg = REGISTRATION.get((reg_text or "unknown").strip().lower())
        if reg is None:
            reg = "unknown"
            issues.append(f"Activity {title!r}: registration text {reg_text!r} not mapped; stored as unknown.")
        cat = CATEGORY.get((first["activity_type"] or "").lower())
        if cat is None:
            issues.append(f"Activity {title!r}: activity_type {first['activity_type']!r} has no category.")
        audience = "caregiver_with_childcare" if first["audience"] == "caregiver" else None
        notes = sorted({m["schedule_notes"] for m in members if m["schedule_notes"]})
        if len(notes) > 1:
            issues.append(f"Activity {title!r}: differing schedule notes merged: {notes}")
        last_checked = max((m["last_checked"] for m in members if m["last_checked"]), default=None)
        emit("insert into public.activities (id, venue_id, organiser_id, title, activity_type, category, audience, "
             "childcare_mode, age_text, age_min_months, age_max_months, age_numbers_from, price_text, is_free, "
             "registration, registration_text, schedule_notes, verification, last_checked_on, status) values ("
             + ", ".join(q(x) for x in [
                 aid, venue_uuid.get(first["venue_id"]), org_by_host.get(host(first["provider_url"])), title,
                 first["activity_type"], cat, audience, first["childcare_mode"], first["age_range"], amin, amax, afrom,
                 first["price"], is_free(first["price"]), reg, reg_text, " ".join(notes) or None, verification,
                 last_checked, status])
             + ") on conflict do nothing;")

        n_tpl = n_occ = 0
        for m in members:
            legacy("activities", m["id"], "activities", aid)
            days = parse_weekdays(m["weekday"])
            if m["session_date"]:
                d = date.fromisoformat(m["session_date"])
                if days and d.isoweekday() not in days:
                    issues.append(f"Activity row {m['id']}: session_date {d} is not a {m['weekday']}.")
                oid = uid("occurrence", m["id"])
                emit("insert into public.occurrences (id, activity_id, date, start_time, end_time, status, evidence_url, note) "
                     f"values ({q(oid)}, {q(aid)}, {q(m['session_date'])}, {q(m['start_local'])}, {q(m['end_local'])}, "
                     f"'listed', {q(m['source_url'])}, {q('legacy status: ' + (m['status'] or ''))}) on conflict do nothing;")
                n_occ += 1
            elif days:
                rec = "selected_dates" if SELECTED_DATES_RE.search(m["schedule_notes"] or "") else "weekly"
                for wd in days:
                    tid = uid("template", m["id"], wd)
                    emit("insert into public.schedule_templates (id, activity_id, weekday, recurrence, start_time, end_time) "
                         f"values ({q(tid)}, {q(aid)}, {wd}, {q(rec)}, {q(m['start_local'])}, {q(m['end_local'])}) "
                         "on conflict do nothing;")
                    n_tpl += 1
            else:
                issues.append(f"Activity row {m['id']}: weekday {m['weekday']!r} not parseable and no date; no schedule imported.")
            if m["last_checked"]:
                emit("insert into public.verifications (id, activity_id, checked_on, method, result, note) values "
                     f"({q(uid('verification', m['id']))}, {q(aid)}, {q(m['last_checked'])}, 'import:sqlite', "
                     f"{q(m['status'])}, {q('legacy row ' + str(m['id']))}) on conflict do nothing;")

        for m in members[:1]:
            ph = host(m["provider_url"])
            link(m["provider_url"], "discovery" if ph in AGGREGATOR_HOSTS - {"fadenspule.ch"} else "organiser", activity_id=aid)
            if m["source_url"] and m["source_url"] != m["provider_url"]:
                link(m["source_url"], "discovery" if host(m["source_url"]) in AGGREGATOR_HOSTS else "evidence", activity_id=aid)
            if m["discovery_url"] and m["discovery_url"] not in (m["provider_url"], m["source_url"]):
                link(m["discovery_url"], "discovery", activity_id=aid)
            if m.get("booking_url") and m["booking_url"] not in (m["provider_url"], m["source_url"]):
                link(m["booking_url"], "booking", activity_id=aid)
        if last_checked:
            emit(f"update public.activities set last_checked_on = greatest(last_checked_on, {q(last_checked)}::date) "
                 f"where id = {q(aid)} and updated_at = created_at;")
        rep_acts.append((title, members, verification, status, n_tpl, n_occ, first["age_range"], amin, amax, afrom, reg_text, reg))

    # ── sources, checks, coverage, refresh log, inventory, leads ──
    chunk(True)
    licence_re = re.compile(r"CC BY-SA 4\.0")
    checked_urls: set[str] = set()
    for sc in (rows("select * from source_checks order by run_date, url") if has_table("source_checks") else []):
        url = sc["url"]
        source(url)  # make sure the source exists even if it is not in `sources`
        o = (sc["outcome"] or "").strip().lower()
        outcome = "failed" if o == "failed" else "ok"
        note = f"[{sc['outcome']}] {sc['scope'] or ''}: {sc['details'] or ''}".strip()
        emit("insert into public.source_checks (id, source_id, checked_on, outcome, note, origin) "
             f"values ({q(uid('check2', sc['run_date'], url))}, {q(uid('source', url))}, {q(sc['run_date'])}, {q(outcome)}, {q(note)}, 'import:sqlite') "
             "on conflict do nothing;")
        checked_urls.add(url)
        chunk()
    for sr in rows("select * from sources"):
        source(sr["url"], purpose=sr["purpose"], status_note=sr["status"],
               licence="CC BY-SA 4.0" if licence_re.search(sr["purpose"] or "") else None)
        legacy("sources", sr["url"], "sources", sources[sr["url"]])
        emit(f"update public.sources set status_note = {q(sr['status'])} where url = {q(sr['url'])} and status_note is distinct from {q(sr['status'])};")
        st = sr["status"] or ""
        m = re.search(r"(?:checked|fetched) (\d{4}-\d{2}-\d{2})", st, re.I)
        outcome = "reference" if st.lower() == "reference" else "failed" if "fail" in st.lower() else "ok" if m else None
        if outcome and sr["url"] not in checked_urls:
            emit("insert into public.source_checks (id, source_id, checked_on, outcome, note, origin) "
                 f"values ({q(uid('check', sr['url']))}, {q(uid('source', sr['url']))}, {q(m.group(1) if m else None)}, {q(outcome)}, {q(st)}, 'import:sqlite') on conflict do nothing;")

    if has_table("district_checks"):
        for dc in rows("select * from district_checks order by run_date, kreis"):
            emit("insert into public.coverage_checks (id, run_date, district_number, depth, details) values "
                 f"({q(uid('coverage', dc['run_date'], dc['kreis']))}, {q(dc['run_date'])}, {dc['kreis']}, {q(dc['depth'])}, {q(dc['details'])}) on conflict do nothing;")

    base_refresh: dict[tuple, int] = {}
    if args.base:
        for r in bdb.execute("select rowid, * from refresh_log"):
            base_refresh[(r["run_date"], r["description"])] = r["rowid"]
    for r in rows("select rowid, * from refresh_log order by run_date, rowid"):
        key = (r["run_date"], r["description"])
        rid = uid("refresh", base_refresh[key]) if key in base_refresh else uid("refresh2", r["run_date"], r["description"])
        emit(f"insert into public.refresh_runs (id, run_date, description, origin) values "
             f"({q(rid)}, {q(r['run_date'])}, {q(r['description'])}, 'import:sqlite') on conflict do nothing;")

    for pi in rows("select * from provider_inventory"):
        cid = uid("crawl", pi["url"])
        emit("insert into public.crawl_targets (id, url, scope, action_note, status) values "
             f"({q(cid)}, {q(pi['url'])}, {q(pi['scope'])}, {q(pi['coverage_action'])}, 'proposed') on conflict do nothing;")
    for sr in rows("select * from sources where url like '%.ics' or url like '%.geojson'"):
        emit("insert into public.crawl_targets (id, url, scope, action_note, status, last_note) values "
             f"({q(uid('crawl', sr['url']))}, {q(sr['url'])}, {q(sr['purpose'])}, 'Structured feed: integrate first (stage B)', "
             f"'proposed', {q(sr['status'])}) on conflict do nothing;")

    def lead_state(text: str | None) -> str:
        t = (text or "").lower()
        if t.startswith("resolved"):
            return "accepted"
        if t.startswith("excluded"):
            return "rejected"
        if t.startswith("pending"):
            return "new"
        return "in_review"

    leads_in = [(l["url"], l["title"], l["kreis"], l["checked"], l["status"]) for l in rows("select * from discovery_leads")]
    # reported by the project owner on 2026-11-18: missing from every dataset so far
    leads_in.append(("owner-report:kirchgemeindehaus-zentrum-rigiblick", "Kirchgemeindehaus Zentrum Rigiblick (reported missing)", 6, "2026-11-18",
                     "Review: reported by the project owner as missing. Not in the database or in the Chreis+ feeds (only 'Theater Rigiblick' is). "
                     "Find the organiser's page (probably the reformed parish programme) and check family offers. District 6 assumed from Theater Rigiblick."))
    for url, title, kreis, checked, status in leads_in:
        lid = uid("lead", url)
        real_url = url if url.startswith("http") else None
        emit("insert into public.leads (id, submitted_by, url, name, district_number, origin, status, status_note, checked_on) values "
             f"({q(lid)}, null, {q(real_url)}, {q(title)}, {q(kreis)}, 'import', {q(lead_state(status))}, {q(status)}, {q(checked)}) on conflict do nothing;")
        # refresh imported leads that nobody has triaged yet
        emit(f"update public.leads set status = {q(lead_state(status))}, status_note = {q(status)}, checked_on = {q(checked)} "
             f"where id = {q(lid)} and origin = 'import' and status in ('new', 'in_review') and status_note is distinct from {q(status)};")
        legacy("discovery_leads", url, "leads", lid)

    # ── Chreis+ feeds: places and dated sessions (aggregator data, NOT confirmed with the organisers) ──
    feed_stats: dict[str, object] = {}
    feed_report: list[str] = []
    if has_table("feed_places") and has_table("feed_occurrences"):
        chunk(True)
        place_key: dict[str, str] = {}
        for v in venues:
            if v["address"]:
                place_key.setdefault(addr_key(v["address"]), venue_uuid[v["id"]])
        n_new = n_matched = n_excl = 0
        for pl in rows("select * from feed_places order by source_id"):
            if (pl["status"] or "").startswith("excluded"):
                n_excl += 1
                continue
            if pl["matched_venue_id"]:
                vid = venue_uuid[pl["matched_venue_id"]]
                n_matched += 1
                legacy("feed_places", pl["source_id"], "venues", vid)
                link(pl["provider_source_url"], "evidence", venue_id=vid)
                link(pl["discovery_url"], "discovery", venue_id=vid)
            else:
                vid = uid("feedplace", pl["source_id"])
                n_new += 1
                if pl["quartier"] not in q_kreis:
                    issues.append(f"Feed place {pl['name']!r}: quartier {pl['quartier']!r} unknown; stored without district.")
                emit("insert into public.venues (id, name, quartier_id, address, status, verification, data_origin) values "
                     f"({q(vid)}, {q(pl['name'])}, "
                     f"(select qq.id from public.quartiers qq join public.districts d on d.id = qq.district_id where d.city_id='zurich' and qq.name = {q(pl['quartier'])}), "
                     f"{q(pl['address'])}, 'published', 'secondary_source', 'feed:chreis') on conflict do nothing;")
                legacy("feed_places", pl["source_id"], "venues", vid)
                link(pl["provider_source_url"], "listing", venue_id=vid)
                link(pl["discovery_url"], "discovery", venue_id=vid)
            if pl["address"]:
                place_key.setdefault(addr_key(pl["address"]), vid)
            chunk()
        feed_stats.update(places_new=n_new, places_matched=n_matched, places_excluded=n_excl)

        occ = rows("select * from feed_occurrences order by uid, start_raw")
        last_seen = max((o["last_seen"] for o in occ if o["last_seen"]), default=None)
        fgroups: dict[tuple, list[dict]] = defaultdict(list)
        for o in occ:
            fgroups[(norm(o["title"]), o["provider_url"], addr_key(o["location"]))].append(o)
        verified_titles = {norm(r[0]["title"]): r[0]["title"] for r in [(m, None) for _, ms, v_, st_ in act_records if v_ == "provider_verified" for m in ms[:1]]}
        # Postal code -> Kreis, ONLY where >= 3 known places carry the code and all of them are in the same Kreis.
        plz_of = lambda t: (re.search(r"\b(80\d\d)\b", t or "") or [None, None])[1]
        plz_votes: dict[str, set] = defaultdict(set)
        plz_count: dict[str, int] = defaultdict(int)
        for pl in rows("select address, kreis from feed_places where kreis is not null"):
            z = plz_of(pl["address"])
            if z:
                plz_votes[z].add(pl["kreis"]); plz_count[z] += 1
        for v in venues:
            z = plz_of(v["address"])
            if z and v["quartier"] in q_kreis:
                plz_votes[z].add(q_kreis[v["quartier"]]); plz_count[z] += 1
        plz_kreis = {z: next(iter(k)) for z, k in plz_votes.items() if len(k) == 1 and plz_count[z] >= 3}
        n_plz = 0
        n_pub = n_arch = n_occ = n_with_venue = n_noloc = n_midnight = 0
        venues_to_show: set[str] = set()
        dup_notes: list[str] = []
        for (nt, purl, ak), items in fgroups.items():
            aid = uid("feedactivity", nt, purl, ak)
            first = items[0]
            vid = place_key.get(ak) if ak else None
            n_with_venue += 1 if vid else 0
            n_noloc += 0 if (first["location"] or "").strip() else 1
            sessions = {}
            for o in items:
                raw = o["start_raw"]
                d = f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
                tm = f"{raw[9:11]}:{raw[11:13]}" if len(raw) >= 13 else None
                if tm == "00:00":
                    tm = None  # midnight in a feed usually means "no time given"
                    n_midnight += 1
                sessions[(d, tm)] = o["uid"]
            has_future = any(d >= (last_seen or "9999") for d, _ in sessions)
            status = "published" if has_future else "archived"
            n_pub += status == "published"; n_arch += status == "archived"
            if vid and status == "published":
                venues_to_show.add(vid)
            last_checked = max((o["last_seen"] for o in items if o["last_seen"]), default=None)
            kreis_by_plz = plz_kreis.get(plz_of(first["location"])) if (not vid and first["location"]) else None
            n_plz += 1 if kreis_by_plz else 0
            dsel = f"(select id from public.districts where city_id = 'zurich' and number = {kreis_by_plz})" if kreis_by_plz else "null"
            emit("insert into public.activities (id, venue_id, title, verification, last_checked_on, status, location_text, data_origin, district_id, district_basis) values "
                 f"({q(aid)}, {q(vid)}, {q(first['title'])}, 'secondary_source', {q(last_checked)}, {q(status)}, "
                 f"{q((first['location'] or '').strip() or None) if not vid else 'null'}, 'feed:chreis', {dsel}, {q('postal_code') if kreis_by_plz else 'null'}) on conflict do nothing;")
            for (d, tm), ref in sorted(sessions.items()):
                n_occ += 1
                emit("insert into public.occurrences (id, activity_id, date, start_time, status, evidence_url, source_ref) values "
                     f"({q(uid('feedocc', ref, d, tm))}, {q(aid)}, {q(d)}, {q(tm)}, 'listed', {q(purl)}, {q(ref)}) on conflict do nothing;")
            link(purl, "listing", activity_id=aid)
            link(first["discovery_url"], "discovery", activity_id=aid)
            if nt in verified_titles:
                dup_notes.append(f"Feed entry **{first['title']}** has the same title as the verified activity **{verified_titles[nt]}**: possible duplicate (kept separate).")
            chunk()
        # a published session must show its venue: reveal venues that were only hidden because their own listings are unverified
        for vid in sorted(venues_to_show):
            emit(f"update public.venues set status = 'published', verification = case when verification = 'unverified' then 'secondary_source' else verification end "
                 f"where id = {q(vid)} and status = 'draft';")
        feed_stats.update(by_postal_code=n_plz, plz_rules=len(plz_kreis), groups=len(fgroups), published=n_pub, archived=n_arch, sessions=n_occ, with_venue=n_with_venue, no_location=n_noloc,
                          midnight=n_midnight, last_seen=last_seen, duplicates=dup_notes)

    emit("commit;")

    # ── duplicate / overlap checks (report only, nothing merged) ──
    dups = []
    for i, a in enumerate(venues):
        for b in venues[i + 1:]:
            na, nb = norm(a["name"]), norm(b["name"])
            ratio = difflib.SequenceMatcher(None, na, nb).ratio()
            same_addr = a["address"] and b["address"] and norm(a["address"]).split(" 80")[0] == norm(b["address"]).split(" 80")[0]
            if ratio > 0.8 or (na in nb or nb in na) or same_addr:
                why = "same address" if same_addr else f"similar names ({ratio:.2f})"
                dups.append(f"Venue {a['id']} **{a['name']}** ↔ {b['id']} **{b['name']}**: {why}. Kept separate.")
    for o in orgs:
        for v in venues:
            if norm(o["name"]) == norm(v["name"]):
                dups.append(f"Organiser **{o['name']}** has the same name as venue {v['id']}; linked as organiser of that venue where the URL host matches.")

    # ── report ──
    pub = [r for r in rep_acts if r[3] == "published"]
    rep += [
        "# Import report: Quartierjournal.sqlite (2026-11-18 data) → Supabase",
        "",
        "Generated by `worker/import_sqlite.py` (re-runnable on top of an earlier import: `--base <previous file>` keeps ids stable). Nothing is merged or deleted automatically; this report lists what was done and what needs review.",
        "",
        "## Source contents",
        "",
        "| Legacy table | Rows | Imported as |",
        "|---|---|---|",
    ]
    for t, target in [("districts", "districts (Kreis 1–12)"), ("quarters", "quartiers"), ("venues", "venues"),
                      ("activities", "activities + schedule_templates / occurrences"),
                      ("discovery_directory", "organisers (draft)"), ("discovery_leads", "leads (origin = import)"),
                      ("provider_inventory", "crawl_targets (proposed)"), ("sources", "sources + source_checks"),
                      ("refresh_log", "refresh_runs")]:
        rep.append(f"| `{t}` | {db.execute(f'select count(*) from {t}').fetchone()[0]} | {target} |")
    rep += [
        "",
        f"The {len(acts)} legacy activity rows become **{len(rep_acts)} activities**. Rows were grouped when venue, title, type, age text, price, registration, audience and organiser URL were all identical, e.g. one weekly template per weekday, or one dated occurrence per row.",
        "",
        f"**Published immediately: {len(pub)} activities** (provider-verified in the legacy data) at {len(published_venues)} venues. "
        f"The other {len(rep_acts) - len(pub)} activities are imported as **draft**, so they are visible to admins for review but not to the public.",
        "",
        "## Activities",
        "",
        "| Activity | Legacy rows | Verification | Status | Weekly templates | Dated sessions | Age text → months |",
        "|---|---|---|---|---|---|---|",
    ]
    for title, members, verification, status, n_tpl, n_occ, atext, amin, amax, afrom, reg_text, reg in rep_acts:
        venue = next(v["name"] for v in venues if v["id"] == members[0]["venue_id"])
        age = "unknown" if afrom is None else f"{amin if amin is not None else '?'}–{amax if amax is not None else '?'} ({afrom.replace('source_', '')})"
        rep.append(f"| {title} · {venue} | {', '.join(str(m['id']) for m in members)} | {verification} | {status} | {n_tpl} | {n_occ} | {atext or '—'} → {age} |")
    if feed_stats:
        fs = feed_stats
        rep += [
            "## Chreis+ feeds (aggregator data, not confirmed with the organisers)",
            "",
            f"Staged by the data pipeline from the Chreis+ ICS and GeoJSON feeds (CC BY-SA 4.0, attribution required; the feeds exclude images and original source prose, and so does this import). Last seen: {fs['last_seen']}.",
            "",
            f"- **Places:** {fs['places_new']} imported as venues (marked *found via Chreis+*), {fs['places_matched']} matched to venues that already existed (linked, not duplicated), {fs['places_excluded']} skipped as outside the city perimeter.",
            f"- **Sessions:** {fs['sessions']} dated sessions grouped into **{fs['groups']} activities** (same title, same listing page and same address). {fs['published']} have a date today or later and are published; {fs['archived']} are in the past and are kept as history but not published.",
            f"- **Where:** {fs['with_venue']} activities could be placed at a known venue by their address (this also gives their Kreis). For {fs['by_postal_code']} more, the Kreis was derived from the postal code (rule: at least 3 known places carry that code and all are in one Kreis; {fs['plz_rules']} codes qualify; this is marked as derived on the site). The rest keep the feed's address text and the Kreis stays unknown. {fs['no_location']} have no location at all.",
            f"- **Times:** a start time of exactly 00:00 is treated as \"no time given\" ({fs['midnight']} sessions). There are no end times, ages, prices or registration details in the feed, so they stay unknown.",
            "- **Links:** the feed's event page is stored as a *listing* link, never as the organiser, because the original organiser is unverified. The feed itself is stored as the *discovery* link.",
            "- **Shown as:** verification level *secondary source*, so the site labels them \"found via Chreis+, not yet confirmed with the organiser\". An admin can promote an entry to *provider verified* after checking it.",
            "",
        ]
        if fs["duplicates"]:
            rep += ["Possible duplicates between a feed entry and a verified activity (not merged):", ""] + [f"- {d}" for d in fs["duplicates"]] + [""]
    rep += [
        "",
        "## How details were interpreted",
        "",
        "- **Dates:** only rows with `session_date` became dated sessions. Weekday patterns are \"usually\" templates, never upcoming sessions.",
        "- **Selected dates:** templates are marked `selected_dates` (\"on some Wednesdays, check the organiser\") when the notes say the offer runs on selected or certain dates only.",
        "- **Ages:** numbers are filled only when the source gives units (\"From 4 months\", \"2½–5 years\", \"0–4 years\"), plus \"All ages\" and \"Birth to kindergarten\" (minimum 0, maximum unknown). Vague texts (\"Preschool\", \"Up to 6\" without a unit, \"Approx. …\", \"exact ages unknown\") stay unknown. The original text is always displayed.",
        "- **Price:** `is_free` is only set to true when the text starts with Free or Gratis. \"No purchase required\" stays unknown. The original text is always displayed.",
        "- **Registration:** mapped to required, recommended, not required or unknown. The original wording is kept and shown.",
        "- **URLs:** `provider_url` becomes the organiser link. Aggregator hosts (" + ", ".join(sorted(AGGREGATOR_HOSTS - {'fadenspule.ch'})) + ") are stored as *discovery* links, never as the organiser. `source_url` and `discovery_url` are kept with their own roles.",
        "- **Organisers:** linked only where the organiser URL host matches a website in `discovery_directory`. No organiser names were invented.",
        "- **Licence:** the Chreis+ feeds are CC BY-SA 4.0. Activities discovered via Chreis+ need attribution on display.",
        "",
        "## Possible duplicates and overlaps (review, nothing merged)",
        "",
    ]
    rep += [f"- {d}" for d in dups] or ["- none found"]
    rep += ["", "## Data issues found", ""]
    rep += [f"- {i}" for i in issues] or ["- none"]
    rep += ["", "## Not in the legacy database", "",
            "- **Images:** none. The prototype's photos have unknown licences and are not imported (see `docs/image-register.md`).",
            "- **Providers:** there is no separate provider table. Organiser identity comes from `discovery_directory` and organiser URLs.",
            "- **Quartier per session:** the Chreis+ sessions do not say which quartier feed they came from. Adding it to the next export would let us place many more of them in a Kreis."]

    with open(args.sql, "w") as f:
        f.write("\n".join(out) + "\n")
    with open(args.report, "w") as f:
        f.write("\n".join(rep) + "\n")
    print(f"{len(rep_acts)} activities ({len(pub)} published), {len(venues)} venues, {len(orgs)} organisers, "
          f"{len(sources)} sources, {len(issues)} issues, {len(dups)} duplicate notes", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
