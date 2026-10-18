// In docs/print/out/book.html ra PDF bằng Chromium. node docs/print/print.mjs
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(pathToFileURL(join(dir, 'out/book.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: join(dir, 'out/hugo-music-book.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font:7.5pt Inter,sans-serif;color:#6b6f76;padding:0 17mm 0 19mm;display:flex;justify-content:space-between"><span>Hugo Music</span><span class="pageNumber"></span></div>',
  outline: true, tagged: true,
});
await browser.close();
console.log(join(dir, 'out/hugo-music-book.pdf'));
