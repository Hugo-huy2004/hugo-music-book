// Chụp ảnh app thật (bản web đã export) cho sách.
// Chạy: node --env-file=worker/.env scripts/screenshots.mjs <thư mục ảnh> [tên ảnh ...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { createClient } = require('@supabase/supabase-js');

const [outDir, ...only] = process.argv.slice(2);
const root = path.resolve('app/dist');
const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(r);
}).listen(8099);

async function session(email, password) {
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}
const sessions = {
  admin: await session('admin@hugomusic.dev', process.env.SHOT_ADMIN_PASSWORD),
  member: await session('member@hugomusic.dev', process.env.SHOT_MEMBER_PASSWORD),
};

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

const click = (text, exact = false, nth = 0) => async (p) => { await p.getByText(text, { exact }).nth(nth).click(); await p.waitForTimeout(1500); };

// tên ảnh, đường dẫn, khung hình, ai đăng nhập, thao tác trước khi chụp
const shots = [
  ['home-desktop', '/', desktop, 'member'],
  ['home-mobile', '/', mobile, 'member'],
  ['home-guest', '/', desktop, null],
  ['search', '/search', desktop, 'member', async (p) => { await p.locator('input').first().fill('mua dem'); await p.waitForTimeout(2000); }],
  ['new', '/new', desktop, 'member'],
  ['library', '/library', desktop, 'member'],
  ['radio', '/radio', desktop, 'member'],
  ['account', '/account', desktop, 'member'],
  ['admin', '/admin', desktop, 'admin'],
  ['login', '/account', mobile, null],
  ['library-liked', '/library', desktop, 'member', click('Bài hát')],
  ['library-playlist', '/library', desktop, 'member', async (p) => { await click('Danh sách phát')(p); await click('Chill buổi tối')(p); }],
  ['station', '/radio', desktop, 'member', async (p) => { await click('Hugo Chill')(p); await p.waitForTimeout(4000); }],
  ['station-mobile', '/radio', mobile, 'member', async (p) => { await click('Hugo Chill')(p); await p.waitForTimeout(4000); }],
  ['blind', '/party', mobile, 'member', async (p) => { await click('Tai vàng')(p); await p.getByText('Đang phát A').waitFor({ timeout: 60000 }); await p.waitForTimeout(2000); }],
  ['blind-vote', '/party', mobile, 'member', async (p) => { await click('Tai vàng')(p); await p.getByText('Kết quả', { exact: true }).last().waitFor({ timeout: 90000 }); await p.waitForTimeout(1500); }],
  ['blind-reveal', '/party', mobile, 'member', async (p) => { await click('Tai vàng')(p); await p.getByText(/\d+ kbps/).first().waitFor({ timeout: 120000 }); await p.waitForTimeout(1500); }],
  ['admin-songs', '/admin', desktop, 'admin', click('Nhạc')],
  ['admin-publishing', '/admin', desktop, 'admin', click('Trạng thái đăng tải')],
  ['admin-rooms', '/admin', desktop, 'admin', click('Phòng nghe')],
  ['admin-users', '/admin', desktop, 'admin', click('Người dùng')],
  ['admin-catalog', '/admin', desktop, 'admin', click('Nghệ sĩ & album')],
  ['login-modal', '/account', mobile, null, async (p) => { await p.getByText('Đăng nhập', { exact: true }).last().click(); await p.waitForTimeout(1500); }],
  ['admin-upload', '/admin', desktop, 'admin', async (p) => { await click('Nhạc')(p); await p.getByText('Tải bài lên', { exact: true }).first().click(); await p.waitForTimeout(1500); }],
  ['home-dark', '/', desktop, 'member', null, 'dark'],
  ['home-mobile-dark', '/', mobile, 'member', null, 'dark'],
  ['player-mini', '/search', desktop, 'member', async (p) => { await p.locator('input').first().fill('mua dem'); await p.waitForTimeout(2000); await p.mouse.click(1384, 228); await p.waitForTimeout(6000); }],
  ['player-full', '/search', desktop, 'member', async (p) => { await p.locator('input').first().fill('mua dem'); await p.waitForTimeout(2000); await p.mouse.click(1384, 228); await p.waitForTimeout(5000); await p.getByText('Mưa Đêm Sài Gòn').last().click(); await p.waitForTimeout(3000); }],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined });
fs.mkdirSync(outDir, { recursive: true });
for (const [name, url, vp, who, act, scheme = 'light'] of shots) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'vi-VN', colorScheme: scheme });
  if (who) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(sessions[who])]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(name, 'pageerror', String(e).slice(0, 200)));
  await p.goto('http://localhost:8099' + url, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(2500);
  if (act) await act(p).catch((e) => console.log(name, 'action', String(e).slice(0, 150)));
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(outDir, name + '.png') });
  console.log('shot', name);
  await ctx.close();
}
await browser.close();
srv.close();
