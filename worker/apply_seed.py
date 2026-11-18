#!/usr/bin/env python3
"""Applies supabase/seed/catalogue_import.sql in safe chunks, either to a Postgres URL (testing) or to a hosted
Supabase project through its management API. Chunk boundaries are the `-- @@CHUNK` markers written by import_sqlite.py;
every chunk runs in its own transaction and the import is idempotent, so a failed run can simply be repeated.

  python3 -I worker/apply_seed.py --psql postgresql://postgres@127.0.0.1:54322/qj_e2e
  SUPABASE_ACCESS_TOKEN=... python3 -I worker/apply_seed.py --api <project-ref>
"""
import argparse, json, os, subprocess, sys, urllib.request, urllib.error

ap = argparse.ArgumentParser()
g = ap.add_mutually_exclusive_group(required=True)
g.add_argument("--psql", help="Postgres URL (local testing)")
g.add_argument("--api", metavar="PROJECT_REF", help="hosted Supabase project ref")
ap.add_argument("--file", default="supabase/seed/catalogue_import.sql")
args = ap.parse_args()

text = open(args.file, encoding="utf-8").read()
body = [l for l in text.split("\n") if l.strip() not in ("begin;", "commit;")]
chunks, cur = [], []
for line in body:
    if line.strip() == "-- @@CHUNK":
        if cur: chunks.append("\n".join(cur)); cur = []
    else:
        cur.append(line)
if cur: chunks.append("\n".join(cur))
chunks = [c for c in chunks if c.strip() and not all(x.startswith("--") or not x.strip() for x in c.split("\n"))]
print(f"{len(chunks)} chunks, {sum(len(c) for c in chunks) // 1024} KB")

def run_psql(sql):
    r = subprocess.run(["psql", args.psql, "-v", "ON_ERROR_STOP=1", "-q", "-1"], input=sql, text=True, capture_output=True)
    if r.returncode: raise SystemExit(f"FAILED: {r.stderr[:800]}")

def run_api(sql):
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{args.api}/database/query", method="POST",
        data=json.dumps({"query": "begin;\n" + sql + "\ncommit;"}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=300).read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"FAILED: HTTP {e.code} {e.read().decode()[:800]}")

run = run_psql if args.psql else run_api
for i, c in enumerate(chunks, 1):
    run(c)
    print(f"  chunk {i}/{len(chunks)} ok ({len(c) // 1024} KB)")
print("done")
