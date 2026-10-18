// Chụp nhóm nghe chung: hai tài khoản, hai trình duyệt, cùng một nhóm.
// Chạy: node --env-file=worker/.env scripts/group-shot.mjs <thư mục ảnh>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { createClient } = require('@supabase/supabase-js');

const outDir = process.argv[2];
const root = path.resolve('app/dist');
const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(8099);
async function session(email) {
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: process.env.SHOT_MEMBER_PASSWORD });
  if (error) throw error;
  return data.session;
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost' } });
async function open(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'vi-VN' });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(await session(email))]);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (/realtime|channel|group|error/i.test(m.text())) console.log(email.slice(0,4), m.type(), m.text().slice(0, 200)); });
  p.on('pageerror', (e) => console.log(email, String(e).slice(0, 200)));
  await p.goto('http://localhost:8099/party', { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(3000);
  return p;
}
const host = await open('member@hugomusic.dev');
await host.screenshot({ path: path.join(outDir, 'group-empty.png') });
await host.getByText('Tạo nhóm mới').click();
await host.waitForTimeout(3000);
const code = (await host.getByText(/^[A-Z2-9]{6} · /).first().textContent()).slice(0, 6);
console.log('code', code);
const guest = await open('lan@hugomusic.dev');
await guest.getByPlaceholder('Nhập mã nhóm').fill(code);
await guest.getByText('Vào', { exact: true }).click();
await guest.waitForTimeout(10000);
await host.screenshot({ path: path.join(outDir, 'group-host.png') });
await guest.screenshot({ path: path.join(outDir, 'group-guest.png') });
// chủ nhóm phát một bài: máy của Lan tự phát theo
await host.getByLabel(/tìm kiếm|search/i).last().click().catch(() => host.mouse.click(350, 810));
await host.waitForTimeout(1500);
await host.locator('input').first().fill('neon');
await host.waitForTimeout(2500);
await host.getByText('Neon Street').first().click();
await guest.waitForTimeout(6000);
await host.screenshot({ path: path.join(outDir, 'group-host-play.png') });
await guest.screenshot({ path: path.join(outDir, 'group-guest-play.png') });
await browser.close();
srv.close();
