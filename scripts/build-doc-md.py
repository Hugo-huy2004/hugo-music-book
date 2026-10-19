#!/usr/bin/env python3
"""Ghép docs/book theo ORDER.txt thành một file markdown cho tài liệu Claude Docs.
Ảnh images/<tên>.png được thay bằng blob/<id> theo file ánh xạ (tên -> blob id), mỗi dòng: "<tên> <blob id>".
python3 scripts/build-doc-md.py <file ánh xạ> <file ra>"""
import re, sys
from pathlib import Path
book = Path(__file__).resolve().parent.parent / 'docs' / 'book'
mapping = dict(l.split() for l in Path(sys.argv[1]).read_text().splitlines() if l.strip())
text = '\n\n'.join((book / f).read_text().strip() for f in (book / 'ORDER.txt').read_text().split())
missing = set()
def rep(m):
    if m.group(2) not in mapping: missing.add(m.group(2)); return m.group(0)
    return f'![{m.group(1)}]({mapping[m.group(2)]})'
text = re.sub(r'!\[([^\]]*)\]\(images/([\w-]+)\.png\)', rep, text)
Path(sys.argv[2]).write_text(text)
print(len(text), 'ký tự; thiếu ảnh:', missing or 'không')
