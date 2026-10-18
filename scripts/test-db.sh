#!/usr/bin/env bash
# Chạy test pgTAP trên project cloud qua Management API (khi không có Docker cho `supabase test db`).
# Mọi thứ nằm trong một transaction và rollback ở cuối: không để lại dữ liệu test.
# Cần: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
set -euo pipefail
cd "$(dirname "$0")/.."
for f in supabase/tests/*.sql; do
  echo "$f .."
  body=$(python3 - "$f" <<'PY'
import json, re, sys
s = open(sys.argv[1]).read()
s = s.replace('begin;', 'begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path = public, extensions;\n'
              'create temp table tap(n serial, line text); grant all on tap to public; grant all on sequence tap_n_seq to public;', 1)
s = re.sub(r'^select (plan|throws_ok|is|ok|lives_ok|isnt|results_eq|is_empty)\(', r'insert into tap(line) select \1(', s, flags=re.M)
s = re.sub(r'^select \* from finish\(\);', 'insert into tap(line) select * from finish();\nreset role;\nselect line from tap order by n;', s, flags=re.M)
print(json.dumps({'query': s.replace('rollback;', '') + '\nrollback;'}))
PY
)
  curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "content-type: application/json" -d "$body" \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print('\n'.join(x['line'] for x in r)); sys.exit(any(x['line'].startswith('not ok') for x in r))"
done
