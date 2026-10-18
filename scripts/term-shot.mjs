// Chụp đầu ra dòng lệnh thật thành ảnh cửa sổ terminal.
// Chạy: node scripts/term-shot.mjs <file .txt> <file .png> [tiêu đề]
// Dòng bắt đầu bằng "$ " là lệnh (tô màu), còn lại là đầu ra đúng như khi chạy.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const [src, out, title = 'Terminal'] = process.argv.slice(2);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const body = fs.readFileSync(src, 'utf8').trimEnd().split('\n')
  .map((l) => (l.startsWith('$ ') ? `<b><i>$</i> ${esc(l.slice(2))}</b>` : l.startsWith('sql> ') ? `<b><i>sql&gt;</i> ${esc(l.slice(5))}</b>` : esc(l))).join('\n');
const html = `<html><body style="margin:0;background:transparent;font:14px/1.5 'DejaVu Sans Mono',monospace">
<div id=w style="display:inline-block;min-width:760px;margin:16px;border-radius:12px;background:#1c1c1e;box-shadow:0 12px 32px #0004;overflow:hidden">
<div style="height:34px;background:#2c2c2e;display:flex;align-items:center;padding:0 14px;gap:8px;color:#98989d;font:13px system-ui">
<span style="width:12px;height:12px;border-radius:6px;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:6px;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:6px;background:#28c840"></span>
<span style="flex:1;text-align:center;margin-right:60px">${esc(title)}</span></div>
<pre style="margin:0;padding:14px 18px;color:#e5e5ea;white-space:pre">${body}</pre></div>
<style>b{color:#fff;font-weight:600}i{color:#30d158;font-style:normal}</style></body></html>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: 2400, height: 400 } });
await p.setContent(html);
await p.locator('#w').screenshot({ path: out, omitBackground: true });
await b.close();
