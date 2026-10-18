#!/usr/bin/env bash
# Tóm tắt Security Advisor và Performance Advisor của project (giống trang Advisors trên dashboard).
# Cần: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
set -euo pipefail
for kind in security performance; do
  curl -s "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/advisors/$kind" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" |
    python3 -c "
import json, sys, collections
lints = json.load(sys.stdin)['lints']
print('$kind:', len(lints), 'mục')
for (level, name), n in sorted(collections.Counter((l['level'], l['name']) for l in lints).items()):
    print(f'  {level:5} {n:3}  {name}')"
done
