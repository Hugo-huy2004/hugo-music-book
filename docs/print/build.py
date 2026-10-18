#!/usr/bin/env python3
"""Dựng bản in PDF của sách từ docs/book/*.md.
python3 docs/print/build.py   ->  docs/print/out/book.html (rồi node docs/print/print.mjs ra PDF)
"""
import glob, html, re
from pathlib import Path
import markdown
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

ROOT = Path(__file__).resolve().parent
BOOK = ROOT.parent / 'book'
OUT = ROOT / 'out'; OUT.mkdir(exist_ok=True)

def code_block(m):
    lang, src = m.group(1) or 'text', html.unescape(m.group(2))
    try: lexer = get_lexer_by_name({'ts': 'typescript', 'tsx': 'tsx', 'sh': 'bash'}.get(lang, lang))
    except ClassNotFound: lexer = get_lexer_by_name('text')
    return highlight(src, lexer, HtmlFormatter(nowrap=False, cssclass='hl'))

def render(md_text):
    h = markdown.markdown(md_text, extensions=['tables', 'fenced_code', 'sane_lists'])
    h = re.sub(r'<pre><code(?: class="language-([\w-]+)")?>(.*?)</code></pre>', code_block, h, flags=re.S)
    # ảnh: thành figure có chú thích
    h = re.sub(r'<p><img alt="([^"]*)" src="images/([^"]+)" ?/?></p>',
               lambda m: f'<figure class="shot"><img src="../../book/images/{m.group(2)}"><figcaption>{m.group(1)}</figcaption></figure>', h)
    return h

files = sorted(glob.glob(str(BOOK / '[0-9][0-9]-*.md')))
sections, toc = [], []
for f in files:
    text = Path(f).read_text()
    title_m = re.search(r'^#{1,2} (.+)$', text, re.M)
    title = title_m.group(1)
    body = render(re.sub(r'^#{1,2} .+\n', '', text, count=1))
    sid = Path(f).stem
    m = re.match(r'Chương (\d+)\. (.+)', title)
    label = f'Chương {m.group(1)}' if m else ''
    heading = m.group(2) if m else title
    toc.append(f'<a class="toc-ch" href="#{sid}"><span class="n">{m.group(1) if m else ""}</span><span class="t">{html.escape(heading)}</span></a>')
    sections.append(f'<section class="chapter" id="{sid}">' + (f'<div class="ch-label">{label}</div>' if label else '') + f'<h2>{html.escape(heading)}</h2>{body}</section>')

css = (ROOT / 'book.css').read_text() + HtmlFormatter(cssclass='hl').get_style_defs('.hl') + \
      '.hl .err{border:none;background:none;color:inherit}.hl{background:#f6f7f9;border:1px solid #e6e8ec;border-left:3px solid #b8c4d6;border-radius:3px;margin:2mm 0 4mm}.hl pre{margin:0;border:0;background:none}'
cover = f'''<section class="cover"><div><div class="kicker">Sách lập trình thực chiến</div>
<h1>Hugo <span>Music</span></h1><div class="sub">Dịch vụ nghe nhạc trên web, iOS và Android<br>với Supabase, Node.js 26 và Expo</div>
<p class="desc">Database, đăng nhập 1 chạm, lưu file, realtime, Row Level Security và xử lý âm thanh tự động. Mỗi chương một tính năng chạy được, ảnh chụp từ app thật, code ở github.com/Hugo-huy2004/hugo-music-book.</p></div>
<div class="bottom"><span class="author">Lê Gia Huy</span><span class="meta">Bản 10/2026</span></div></section>'''
doc = f'''<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hugo Music</title>
<style>{(ROOT / 'cover.css').read_text().replace('@page { size: A4; margin: 0; }', '@page cover { size: A4; margin: 0; } .cover { page: cover; }').replace('html, body { margin: 0;', 'html { ').replace('h1 {', '.cover h1 {')}</style>
<style>{css}</style></head><body class="book">{cover}
<section class="toc"><h2>Mục lục</h2><nav>{''.join(toc)}</nav></section>
{''.join(sections)}</body></html>'''
(OUT / 'book.html').write_text(doc)
print(OUT / 'book.html', len(sections), 'chương')
