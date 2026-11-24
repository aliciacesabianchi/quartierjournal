#!/usr/bin/env python3
"""Imports the PBZ (Pestalozzi-Bibliothek Zürich) KinderTREFF season programme as provider-confirmed entries.
Source: the PBZ's own published programme (PDF text via `pdftotext -layout`) + the series page https://www.pbz.ch/kindertreff/.
Series imported: "Ryte, ryte Rössli" (9-24 months) and "Geschichtenzeit" (2-3 years). Not yet: Bilderbuchkino / Bücherkiste (from 4 years).
Usage: import_pbz.py programme.txt quartiere.json out.sql [--today YYYY-MM-DD]
Idempotent (deterministic ids, on conflict do nothing). Only future sessions are written."""
import json, re, sys, uuid
from datetime import date
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kreis_geocode import geocode, inside

NS = uuid.UUID('6f1c2c0e-0b1e-4c53-9a47-5d2f2f7a1a77')
PDF_URL = 'https://www.pbz.ch/app/uploads/2026/08/pbz26_KinderTREFF_online.pdf'
PAGE_URL = 'https://www.pbz.ch/kindertreff/'
uid = lambda *p: str(uuid.uuid5(NS, ':'.join(map(str, p))))
def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

BRANCHES = {  # from the programme's "Unsere 14 Standorte" page
 'PBZ Altstadt': 'Zähringerstrasse 17, 8001 Zürich', 'PBZ Affoltern': 'Bodenacker 25, 8046 Zürich', 'PBZ Altstetten': 'Lindenplatz 4, 8048 Zürich',
 'PBZ Aussersihl': 'Zweierstrasse 50, 8004 Zürich', 'PBZ Hardau': 'Norastrasse 20, 8004 Zürich', 'PBZ Höngg': 'Ackersteinstrasse 190, 8049 Zürich',
 'PBZ Leimbach': 'Rebenweg 6, 8041 Zürich', 'PBZ Oerlikon': 'Hofwiesenstrasse 379, 8050 Zürich', 'PBZ Riesbach': 'Seefeldstrasse 93, 8008 Zürich',
 'PBZ Schütze': 'Heinrichstrasse 238, 8005 Zürich', 'PBZ Schwamendingen': 'Winterthurerstrasse 531, 8051 Zürich', 'PBZ Sihlcity': 'Kalanderplatz 5, 8045 Zürich',
 'PBZ Unterstrass': 'Scheuchzerstrasse 184, 8057 Zürich', 'PBZ Witikon': 'Witikonerstrasse 397, 8053 Zürich'}
SERIES_OLD = {  # from 4 years: one activity per series and branch; the book and the storyteller are noted on each date
 'Bilderbuchkino': dict(age_text='ab 4 Jahren', amin=48, amax=None, audience='family', note='Ein multimediales Erlebnis: ein bis zwei Bilderbücher auf der grossen Leinwand. Mit oder ohne Begleitung. Dauer 30–60 Minuten.'),
 'Bücherkiste': dict(age_text='ab 4 Jahren', amin=48, amax=None, audience='family', note='In fremde Welten eintauchen, Bilderbücher entdecken und gemeinsam Abenteuer erleben. Dauer 30–60 Minuten.'),
}
SERIES = {
 'Ryte, ryte Rössli': dict(age_text='9–24 Monate', amin=9, amax=24, note='Kniereime, Verse und Fingerspiele für Babys und ihre Begleitpersonen. Nicht geeignet für Horte, Krippen und Spielgruppen. Dauer 30–60 Minuten.'),
 'Geschichtenzeit': dict(age_text='2–3 Jahre', amin=24, amax=47, note='Die ersten kurzen Geschichten gemeinsam entdecken und spielerisch erleben. Dauer 30–60 Minuten.'),
}
ROW2 = re.compile(r'(PBZ [A-Za-zäöüÄÖÜ]+)\s+(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d\d)\.(\d\d)\.(\d\d)\s+(\d\d:\d\d)')
def parse_old(lines):
    """Bilderbuchkino and Bücherkiste: a block = title line(s), 'mit <person>' line, then one row per branch/date."""
    i0 = next(i for i, l in enumerate(lines) if l.strip() == 'Bilderbuchkino' and i > 200)
    series = 'Bilderbuchkino'; out = []; title = None; person = None
    for idx in range(i0, len(lines)):
        l = lines[idx]; st = l.strip()
        if st == 'Bücherkiste': series = 'Bücherkiste'; continue
        if st.startswith('15') and 'Danke' in lines[idx + 1:idx + 3].__str__(): break
        if st == 'Danke': break
        m = re.search(r'(?:^|\s{2,})mit ([A-ZÄÖÜ][^\n]+)$', l)
        if m and not ROW2.search(l):
            col = l.index('mit ', m.start()); person = m.group(1).strip(); parts = []
            for back in range(idx - 1, max(idx - 5, 0), -1):
                pl = lines[back]
                if not pl.strip(): 
                    if parts: break
                    continue
                if re.match(r'^\s*von ', pl): continue
                if ROW2.search(pl) or re.match(r'^\s*\d+\s+(Bücherkiste|Bilderbuchkino)', pl): break
                segs = [(sm.start(), sm.group(0).strip()) for sm in re.finditer(r'\S+(?: {1,2}\S+)*', pl)]
                seg = [t for c, t in segs if c >= col - 2]
                if not seg: continue
                parts.insert(0, seg[-1] if len(seg) > 1 else seg[0])
            title = ' '.join(parts).strip('«» ').replace('  ', ' ')
            continue
        r = ROW2.search(l)
        if r and title:
            d = date(2000 + int(r.group(5)), int(r.group(4)), int(r.group(3)))
            out.append((series, r.group(1), d, r.group(6), f'«{title}» mit {person}'))
    return out

ROW = re.compile(r'(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d\d)\.(\d\d)\.(\d\d)\s+(\d\d:\d\d)')

def parse(lines):
    start = next(i for i, l in enumerate(lines) if i > 60 and l.strip() == 'Ryte, ryte Rössli')
    series = branch = None; out = []
    for l in lines[start:]:
        s = l.strip()
        if s in SERIES: series = s; branch = None; continue
        if s in ('Bilderbuchkino', 'Bücherkiste') and series == 'Geschichtenzeit': break
        m = re.fullmatch(r'PBZ [A-Za-zäöüÄÖÜ]+', s)
        if m and s in BRANCHES: branch = s; continue
        m = ROW.search(l)
        if m and series and branch:
            d = date(2000 + int(m.group(4)), int(m.group(3)), int(m.group(2)))
            out.append((series, branch, d, m.group(5)))
    return out

if __name__ == '__main__':
    lines = open(sys.argv[1], encoding='utf8').read().splitlines()
    quartiere = json.load(open(sys.argv[2]))['features']
    today = date.fromisoformat(sys.argv[sys.argv.index('--today') + 1]) if '--today' in sys.argv else date.today()
    rows = parse(lines)
    old = parse_old(lines)
    print(f'older series: {len(old)} sessions', file=sys.stderr)
    per = {}
    for s, b, d, t in rows: per.setdefault((s, b), []).append((d, t))
    print(f'parsed {len(rows)} sessions in {len(per)} series×branch groups; future: {sum(1 for r in rows if r[2] >= today)}', file=sys.stderr)
    E = []; emit = E.append
    org = uid('org', 'pbz')
    emit('-- Generated by worker/import_pbz.py from the PBZ KinderTREFF programme (Herbst 2026 – Frühling 2027). Safe to re-run.')
    emit(f"insert into public.organisers (id, name, website, discovered_via, status) values ({q(org)}, 'Pestalozzi-Bibliothek Zürich (PBZ)', 'https://www.pbz.ch', 'provider programme', 'published') on conflict do nothing;")
    for url in (PAGE_URL, PDF_URL):
        emit(f"insert into public.sources (id, url) values ({q(uid('source', url))}, {q(url)}) on conflict (url) do nothing;")
    venue_ids = {}
    for b, addr in BRANCHES.items():
        g = geocode(addr)
        qn = None
        if g:
            for f in quartiere:
                geom = f['geometry']; polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
                if any(inside((g[0], g[1]), p[0]) for p in polys): qn = f['properties']['qname']; break
        vid = uid('venue', b); venue_ids[b] = vid
        qsel = f"(select q.id from public.quartiers q join public.districts d on d.id = q.district_id where d.city_id = 'zurich' and q.name = {q(qn)})" if qn else 'null'
        emit(f"insert into public.venues (id, name, kind, quartier_id, address, organiser_id, status, verification, data_origin) values ({q(vid)}, {q(b)}, 'Bibliothek', {qsel}, {q(addr)}, {q(org)}, 'published', 'provider_verified', 'provider:pbz') on conflict do nothing;")
        print(f'{b}: {addr} -> {qn}', file=sys.stderr)
    LEGACY_RISBACH_ROESSLI = 'ac0421af-93d0-545a-8a96-34344df15b9d'   # our earlier researched entry: sessions are added to it instead of a duplicate
    n_act = n_occ = 0
    for (series, branch), sess in sorted(per.items()):
        fut = [x for x in sess if x[0] >= today]
        if not fut: continue
        sd = SERIES[series]
        if (series, branch) == ('Ryte, ryte Rössli', 'PBZ Riesbach'): aid = LEGACY_RISBACH_ROESSLI
        else:
            aid = uid('activity', series, branch); n_act += 1
            emit("insert into public.activities (id, venue_id, organiser_id, title, activity_type, category, audience, age_text, age_min_months, age_max_months, age_numbers_from, "
                 "price_text, is_free, registration, registration_text, schedule_notes, verification, last_checked_on, status, data_origin) values ("
                 + ', '.join(q(x) for x in [aid, venue_ids[branch], org, f'{series} – {branch}', 'Library story time', 'culture', 'child_with_caregiver', sd['age_text'], sd['amin'], sd['amax'], 'source_text',
                   'Kostenlos (Kollekte)', True, 'not_required', 'Anmeldung nur für Gruppen (Horte, Krippen, Spielgruppen)', sd['note'], 'provider_verified', today.isoformat(), 'published', 'provider:pbz'])
                 + ') on conflict do nothing;')
            emit(f"insert into public.verifications (id, activity_id, checked_on, method, result, note) values ({q(uid('verification', aid))}, {q(aid)}, {q(today.isoformat())}, 'provider programme', 'dates and ages read from the PBZ KinderTREFF programme', {q(PDF_URL)}) on conflict do nothing;")
            for url, role in ((PAGE_URL, 'organiser'), (PDF_URL, 'evidence')):
                emit(f"insert into public.source_links (source_id, role, activity_id) select id, {q(role)}, {q(aid)} from public.sources where url = {q(url)} on conflict do nothing;")
        for d, t in fut:
            n_occ += 1
            emit(f"insert into public.occurrences (id, activity_id, date, start_time, status, evidence_url) values ({q(uid('occ', series, branch, d))}, {q(aid)}, {q(d.isoformat())}, {q(t)}, 'listed', {q(PDF_URL)}) on conflict do nothing;")
    per2 = {}
    for sr, b, d, t, note in old: per2.setdefault((sr, b), []).append((d, t, note))
    for (series, branch), sess in sorted(per2.items()):
        fut = [x for x in sess if x[0] >= today]
        if not fut: continue
        sd = SERIES_OLD[series]; aid = uid('activity', series, branch); n_act += 1
        emit("insert into public.activities (id, venue_id, organiser_id, title, activity_type, category, audience, age_text, age_min_months, age_max_months, age_numbers_from, "
             "price_text, is_free, registration, registration_text, schedule_notes, verification, last_checked_on, status, data_origin) values ("
             + ', '.join(q(x) for x in [aid, venue_ids[branch], org, f'{series} – {branch}', 'Library story event', 'culture', sd['audience'], sd['age_text'], sd['amin'], sd['amax'], 'source_text',
               'Kostenlos (Kollekte)', True, 'not_required', 'Anmeldung nur für Gruppen (Horte, Krippen, Spielgruppen)', sd['note'], 'provider_verified', today.isoformat(), 'published', 'provider:pbz'])
             + ') on conflict do nothing;')
        emit(f"insert into public.verifications (id, activity_id, checked_on, method, result, note) values ({q(uid('verification', aid))}, {q(aid)}, {q(today.isoformat())}, 'provider programme', 'dates and ages read from the PBZ KinderTREFF programme', {q(PDF_URL)}) on conflict do nothing;")
        for url, role in ((PAGE_URL, 'organiser'), (PDF_URL, 'evidence')):
            emit(f"insert into public.source_links (source_id, role, activity_id) select id, {q(role)}, {q(aid)} from public.sources where url = {q(url)} on conflict do nothing;")
        for d, t, note in fut:
            n_occ += 1
            emit(f"insert into public.occurrences (id, activity_id, date, start_time, status, evidence_url, note) values ({q(uid('occ', series, branch, d))}, {q(aid)}, {q(d.isoformat())}, {q(t)}, 'listed', {q(PDF_URL)}, {q(note)}) on conflict do nothing;")
    open(sys.argv[3], 'w', encoding='utf8').write('\n'.join(E) + '\n')
    print(f'activities {n_act}, occurrences {n_occ}', file=sys.stderr)
