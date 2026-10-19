// Vẽ sơ đồ: docs/book/diagrams/*.mmd (Mermaid) và *.svg (vẽ tay) → docs/book/images/dg-*.png
// node scripts/diagrams.mjs [tên ...]     (cần: npm i mermaid playwright)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const mermaidJs = process.env.MERMAID_JS || require.resolve('mermaid/dist/mermaid.min.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'docs/book/diagrams');
const out = path.join(root, 'docs/book/images');
const only = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 2600, height: 2400 } });
await page.setContent(`<html><body style="margin:0;background:#fff"><div id=d style="display:inline-block;padding:16px"></div></body></html>`);
await page.addScriptTag({ path: mermaidJs });
await page.evaluate(() => window.mermaid.initialize({
  startOnLoad: false, theme: 'base', fontFamily: 'Inter, DejaVu Sans, sans-serif',
  themeVariables: {
    fontSize: '15px', primaryColor: '#eef3fb', primaryBorderColor: '#7f99c2', primaryTextColor: '#1c2430',
    lineColor: '#5d6b80', secondaryColor: '#fdf1e7', tertiaryColor: '#f4f6f9', noteBkgColor: '#fff8db', noteBorderColor: '#d8c27a',
    actorBkg: '#eef3fb', actorBorder: '#7f99c2', signalColor: '#3d4a5c', labelBoxBkgColor: '#f4f6f9',
  },
  flowchart: { curve: 'basis', padding: 12, htmlLabels: true }, sequence: { mirrorActors: false, messageAlign: 'left' },
  er: { layoutDirection: 'TB' },
}));

for (const f of fs.readdirSync(src).filter((f) => /\.(mmd|svg)$/.test(f)).sort()) {
  const name = f.replace(/\.(mmd|svg)$/, '');
  if (only.length && !only.includes(name)) continue;
  const code = fs.readFileSync(path.join(src, f), 'utf8');
  if (f.endsWith('.svg')) await page.evaluate((svg) => { document.getElementById('d').innerHTML = svg; }, code);
  else try {
    await page.evaluate(async ([id, code]) => {
      const { svg } = await window.mermaid.render(id, code);
      document.getElementById('d').innerHTML = svg;
      const el = document.querySelector('#d svg');            // vẽ đúng kích thước thật, không co theo khung
      const b = el.getBBox();                                   // nới ngang theo chữ tràn ra ngoài viewBox
      const [vx, vy, vw, vh] = el.getAttribute('viewBox').split(/\s+/).map(Number);
      const m = 12, x = Math.min(vx, b.x) - m, w = Math.max(vx + vw, b.x + b.width) + m - x, y = vy, h = vh;
      el.removeAttribute('style'); el.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      el.setAttribute('width', w); el.setAttribute('height', h);
    }, ['m' + name.replace(/\W/g, ''), code]);
  } catch (e) { console.log('LỖI', name, String(e).slice(0, 300)); continue; }
  await page.locator('#d').screenshot({ path: path.join(out, `dg-${name}.png`) });
  console.log('vẽ', name);
}
await browser.close();
