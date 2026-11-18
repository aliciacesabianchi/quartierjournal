#!/usr/bin/env bash
# Read-mostly audit of the hosted Supabase project for the pilot. Writes nothing that stays: the isolation test is rolled back.
#   SUPABASE_ACCESS_TOKEN=<token> SUPABASE_PROJECT_REF=<ref> EXPECT_SITE_URL=https://name.pages.dev scripts/audit-supabase.sh
# The token needs read access (database + auth config). Delete it in Supabase afterwards.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}" "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"
API="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF"
H=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json")
export SUPABASE_PROJECT_REF EXPECT_SITE_URL="${EXPECT_SITE_URL:-}"

get()  { curl -sS "${H[@]}" "$API/$1"; }
sql()  { python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' | curl -sS -X POST "${H[@]}" "$API/database/query" --data-binary @-; }

python3 - "$(get database/migrations)" "$(get config/auth)" "$(get advisors/security)" <<'PY'
import json, os, sys
mig_raw, auth_raw, adv_raw = sys.argv[1:4]
res = []
def chk(level, name, detail=''): res.append((level, name, detail))
try: mig = json.loads(mig_raw)
except Exception: mig = None
if not isinstance(mig, list):
    print('FAIL cannot read the project (token invalid or wrong project ref):', mig_raw[:200]); sys.exit(2)
names = [m.get('name') for m in mig]
for want in ('core_schema', 'rls_and_functions'):
    chk('PASS' if want in names else 'FAIL', f'migration applied: {want}')
extra = [n for n in names if n not in ('core_schema', 'rls_and_functions')]
if extra: chk('INFO', 'additional migrations recorded', ', '.join(map(str, extra)))
a = json.loads(auth_raw)
site = a.get('site_url') or ''
exp = os.environ.get('EXPECT_SITE_URL', '').rstrip('/')
chk('FAIL' if (not site or 'localhost' in site) else 'PASS', 'Auth site URL is the real website (not localhost)', site)
if exp: chk('PASS' if site.rstrip('/') == exp else 'FAIL', 'Auth site URL equals the expected address', f'{site} vs {exp}')
allow = a.get('uri_allow_list') or ''
chk('PASS' if (exp and exp in allow) or (not exp and allow) else 'WARN', 'Redirect allow-list contains the website', allow)
chk('PASS' if not a.get('mailer_autoconfirm') else 'FAIL', 'Email confirmation is required (autoconfirm off)')
chk('PASS' if not a.get('disable_signup') else 'FAIL', 'Signups are enabled')
chk('PASS' if (a.get('password_min_length') or 0) >= 8 else 'FAIL', 'Minimum password length is at least 8', str(a.get('password_min_length')))
chk('PASS' if a.get('smtp_host') else 'FAIL', 'Custom SMTP (own email sender) configured', f"{a.get('smtp_host')}:{a.get('smtp_port')} as {a.get('smtp_admin_email')}")
chk('INFO', 'Emails per hour allowed', str(a.get('rate_limit_email_sent')))
chk('INFO', 'Google login provider enabled in Supabase', str(a.get('external_google_enabled')))
try:
    adv = json.loads(adv_raw); lints = adv.get('lints', adv) if isinstance(adv, dict) else adv
    bad = [l for l in lints if l.get('level') in ('ERROR', 'WARN')]
    chk('PASS' if not bad else 'WARN', 'Supabase security advisor: no errors/warnings', '; '.join(f"{l.get('name')}({l.get('level')})" for l in bad)[:400])
except Exception as e:
    chk('INFO', 'Supabase security advisor not readable', str(e)[:120])
for lvl, name, det in res: print(f'{lvl:5} {name}' + (f'  [{det}]' if det else ''))
sys.exit(1 if any(l == 'FAIL' for l, _, _ in res) else 0)
PY
status=$?

echo "--- database ---"
sql < supabase/tests/hosted_checks.sql | python3 -c '
import sys, json
raw = sys.stdin.read()
d = json.loads(raw)
if isinstance(d, dict): print("FAIL", d.get("message","")[:300]); sys.exit(1)
r = d[0]["r"]; bad = False
def chk(ok, name, det=""):
    global bad; bad |= not ok; print(("PASS " if ok else "FAIL ") + name + (f"  [{det}]" if det else ""))
chk(r["tables"] == 25, "25 tables in public", r["tables"])
chk(not r["no_rls"], "row-level security on and forced for every table", r["no_rls"])
chk(r["anon_writes"] == 0, "anonymous visitors cannot write anywhere", r["anon_writes"])
chk(r["published"] == 10 or r["published"] > 0, "published activities exist", r["published"])
chk(r["pub_not_verified"] == 0, "only provider-verified activities are published", r["pub_not_verified"])
chk(r["admins"] >= 1, "at least one admin exists", r["admins"])
print("INFO users=%s confirmed=%s profiles=%s user_leads=%s drafts=%s" % (r["users"], r["confirmed"], r["profiles"], r["leads"], r["drafts"]))
sys.exit(1 if bad else 0)'
db=${PIPESTATUS[1]}

echo "--- two-account isolation test (rolled back) ---"
sql < supabase/tests/hosted_isolation_test.sql | python3 -c '
import sys, json, re
d = json.loads(sys.stdin.read()); m = re.search(r"RESULT:(\[.*\])", d.get("message", ""), re.S)
if not m: print("FAIL test did not run:", d.get("message", "")[:400]); sys.exit(1)
r = json.loads(m.group(1))
for x in r: print(("PASS " if x["ok"] else "FAIL ") + x["t"])
print(sum(x["ok"] for x in r), "/", len(r)); sys.exit(0 if all(x["ok"] for x in r) else 1)'
iso=${PIPESTATUS[1]}
echo; [ $status -eq 0 ] && [ $db -eq 0 ] && [ $iso -eq 0 ] && echo "AUDIT OK" || { echo "AUDIT HAS FAILURES"; exit 1; }
