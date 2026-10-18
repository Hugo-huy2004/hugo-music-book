#!/usr/bin/env bash
# Đẩy migration lên project qua Management API (khi không kết nối trực tiếp được tới Postgres).
# Thông thường dùng: supabase db push
# Cần: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF. Bỏ qua migration đã có (so theo tên).
set -euo pipefail
cd "$(dirname "$0")/../supabase/migrations"
api="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database"
done_list=$(curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$api/migrations" | python3 -c "import json,sys; print(' '.join(m['name'] for m in json.load(sys.stdin)))" 2>/dev/null || true)
for f in *.sql; do
  ver=${f%%_*}; name=${f%.sql}; name=${name#*_}
  if [[ " $done_list " == *" $name "* ]]; then echo "skip $f"; continue; fi
  body=$(python3 -c "import json,sys; print(json.dumps({'query': open(sys.argv[1]).read(), 'name': sys.argv[2]}))" "$f" "$name")
  code=$(curl -s -o /tmp/mig.out -w "%{http_code}" -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "content-type: application/json" "$api/migrations" -d "$body")
  echo "$f -> $code $(head -c 400 /tmp/mig.out)"
  [ "$code" -lt 300 ] || exit 1
done
