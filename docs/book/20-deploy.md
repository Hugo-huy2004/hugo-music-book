## Chương 20. Deploy: đưa từng phần lên đúng chỗ

### Chương này làm gì

Bốn phần, bốn nơi chạy, một quy trình tự động: database và Edge Function lên Supabase, worker lên Fly.io, web lên Cloudflare Pages, app iOS và Android qua EAS. Mỗi lần merge vào nhánh `main`, GitHub Actions tự làm hết.

### Để làm gì

Deploy bằng tay dễ quên một bước: đẩy code app mà quên chạy migration là app gọi vào bảng chưa tồn tại. Một quy trình tự động chạy đúng thứ tự mỗi lần.

### Phân tích kỹ thuật

| Phần | Lựa chọn | Chọn |
|---|---|---|
| Database, Auth, Storage, Realtime, Edge Function | Supabase cloud; tự host bằng Docker | **Supabase cloud**, vùng Singapore |
| Worker (cần ffmpeg, chạy liên tục) | Fly.io, Render, Railway, một VPS | **Fly.io**: chạy từ Docker image, vùng Singapore, dừng máy khi rảnh để tiết kiệm |
| Web tĩnh | Cloudflare Pages, Vercel, Netlify | **Cloudflare Pages**: CDN toàn cầu, băng thông không giới hạn ở gói miễn phí |
| App iOS/Android | Build bằng Xcode/Android Studio; EAS | **EAS Build + EAS Update**: build trên đám mây, sửa JS gửi qua mạng không cần duyệt lại |

### Chọn gì, vì sao

**Thứ tự luôn là: database trước (migration chỉ *thêm*, không phá code cũ đang chạy) → Edge Function → worker → web → app.** Migration theo kiểu mở rộng rồi thu gọn: thêm cột mới, deploy code dùng cột mới, lần sau mới xóa cột cũ.

### Làm từng bước

**Bước 1: Docker image cho worker.** Node 26, ffmpeg, Python có ViSQOL. Không có bước build TypeScript.

```dockerfile
# worker/Dockerfile
FROM node:26-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
 && python3 -m venv /opt/visqol && /opt/visqol/bin/pip install --no-cache-dir visqol-python \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY analyzers ./analyzers
ENV PSL_PYTHON=/opt/visqol/bin/python NODE_ENV=production
CMD ["node", "src/main.ts"]
```

```toml
# worker/fly.toml (trích)
app = "hugo-music-worker"
primary_region = "sin"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

```bash
fly secrets set SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... --config worker/fly.toml
fly deploy --config worker/fly.toml
```

**Bước 2: quy trình tự động.** Hai bí mật cần đặt trong GitHub: `SUPABASE_ACCESS_TOKEN` (personal access token) và `SUPABASE_DB_PASSWORD`.

```yaml
# .github/workflows/deploy.yml (trích)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  supabase:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v5
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ vars.SUPABASE_PROJECT_REF }}
      - run: supabase db push                    # migration trước
      - run: supabase functions deploy playback  # rồi Edge Function

  worker:
    needs: supabase
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config worker/fly.toml --remote-only
        env: { FLY_API_TOKEN: '${{ secrets.FLY_API_TOKEN }}' }

  web:
    needs: supabase
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with: { node-version: 26, cache: pnpm }
      - run: pnpm install --frozen-lockfile && pnpm build:web
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.SUPABASE_PUBLISHABLE_KEY }}
      - run: npx wrangler pages deploy app/dist --project-name hugo-music
        env: { CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}' }
```

**Bước 3: cấu hình Auth cho production.** Ở *Authentication → URL Configuration*: Site URL là tên miền web thật; thêm `hugomusic://auth` vào Redirect URLs cho app. Ở Google Cloud Console, thêm `https://<ref>.supabase.co/auth/v1/callback` vào Authorized redirect URIs.

**Bước 4: app iOS và Android.**

```bash
cd app
eas build --platform all --profile production    # build trên đám mây
eas submit --platform all                         # gửi lên App Store, Google Play
eas update --channel production -m "sửa lỗi"      # sửa JS sau này, không cần duyệt lại
```

### Kết quả

![Bản build web: một thư mục dist tĩnh](images/term-20-build.png)

### Kiểm tra

```bash
supabase migration list --linked     # Local và Remote khớp
fly logs --config worker/fly.toml    # worker đang chờ việc
curl -sI https://<tên miền web> | head -1
```

### Thực hành

1. Push một nhánh có lỗi kiểu TypeScript cố ý, xem CI báo đỏ ở bước typecheck.
2. Build bản web (`pnpm build:web`) và mở thư mục `dist` bằng một server tĩnh bất kỳ.

### Tự kiểm

1. Mỗi phần của hệ thống (database, Edge Function, worker, web, app) được deploy lên đâu?
2. CI chạy những bước nào trước khi cho gộp code?
3. Sửa một lỗi giao diện trên app điện thoại đã phát hành thì có cần nộp lại cho App Store không?

### Khi nào đổi

- **Cần môi trường thử trước production:** bật Supabase Branching: mỗi pull request có một nhánh database riêng với migration của nó.
- **Worker xử lý không kịp:** `fly scale count 3`; hàng đợi tự chia việc.

### Code của chương

Các file chương này viết, trong repo đã clone ở phần Mở đầu:

- `worker/fly.toml`
- `.github/workflows/deploy.yml`
