#!/usr/bin/env python3
"""Sơ đồ use case theo ký hiệu UML → docs/book/diagrams/01-use-case.svg
python3 scripts/use-case.py   (rồi node scripts/diagrams.mjs 01-use-case)"""
from pathlib import Path

# (tên tác nhân, các use case trong dải của tác nhân đó)
BANDS = [
    ('Khách ẩn danh', ['Duyệt, tìm kiếm bài hát', 'Nghe nhạc (giới hạn lượt/ngày)', 'Nghe đài 24/7, yêu cầu bài',
                       'Chơi blind test', 'Đăng nhập: mã 6 số, Google']),
    ('Thành viên', ['Thích bài, tạo danh sách phát', 'Tải bài nghe offline', 'Nghe chung theo nhóm',
                    'Quản lý hồ sơ, xóa tài khoản']),
    ('Quản trị viên', ['Tải bài lên, duyệt, từ chối', 'Quản lý đài, phòng blind test', 'Quản lý người dùng, nghệ sĩ, album']),
]
AUTO = 'Mã hóa HLS, đo PSL'

W, COLS, EW, EH, GAPX, ROWH = 1060, 1, 320, 50, 26, 62
BX, BW = 220, 640                      # ranh giới hệ thống
out, y = [], 70
actor_y, first_uc = [], {}
font = "font-family='Inter, DejaVu Sans, sans-serif'"

def actor(x, y, name):
    return (f"<g stroke='#3d4a5c' stroke-width='2' fill='none'><circle cx='{x}' cy='{y-38}' r='11'/>"
            f"<line x1='{x}' y1='{y-27}' x2='{x}' y2='{y+5}'/><line x1='{x-18}' y1='{y-15}' x2='{x+18}' y2='{y-15}'/>"
            f"<line x1='{x}' y1='{y+5}' x2='{x-14}' y2='{y+28}'/><line x1='{x}' y1='{y+5}' x2='{x+14}' y2='{y+28}'/></g>"
            f"<text x='{x}' y='{y+50}' text-anchor='middle' font-size='15' font-weight='600' fill='#1c2430' {font}>{name}</text>")

def ellipse(cx, cy, text, fill='#eef3fb', stroke='#7f99c2', w=EW):
    return (f"<ellipse cx='{cx}' cy='{cy}' rx='{w/2}' ry='{EH/2}' fill='{fill}' stroke='{stroke}' stroke-width='1.5'/>"
            f"<text x='{cx}' y='{cy+5}' text-anchor='middle' font-size='14' fill='#1c2430' {font}>{text}</text>")

ucs = []
for name, items in BANDS:
    rows = (len(items) + COLS - 1) // COLS
    top = y
    for i, t in enumerate(items):
        r, c = divmod(i, COLS)
        cx = BX + 40 + EW / 2 + c * (EW + GAPX)
        cy = top + 30 + EH / 2 + r * ROWH
        ucs.append((name, cx, cy, t))
    ay = top + 30 + (rows - 1) * ROWH / 2 + EH / 2 + 10
    actor_y.append((name, ay))
    y = top + rows * ROWH + 34

# use case tự động ở góc phải dưới, nối với Worker ngoài ranh giới
AW = 220
auto_cx, auto_cy = BX + BW - AW / 2 - 24, None
H = y + 30
upload = next(u for u in ucs if u[3].startswith('Tải bài lên'))
auto_cy = upload[2] + ROWH
lines = []
for name, cx, cy, t in ucs:
    ay = dict(actor_y)[name]
    lines.append(f"<line x1='110' y1='{ay-15}' x2='{cx-EW/2}' y2='{cy}' stroke='#8a96a8' stroke-width='1.3'/>")
# kế thừa: mũi tên tam giác rỗng từ con lên cha
gen = []
for (child, cy_), (parent, py) in [(actor_y[1], actor_y[0]), (actor_y[2], actor_y[1])]:
    gen.append(f"<line x1='70' y1='{cy_-52}' x2='70' y2='{py+62}' stroke='#3d4a5c' stroke-width='1.5' marker-end='url(#gen)'/>"
               f"<text x='78' y='{(cy_+py)/2+12}' font-size='12' fill='#5d6b80' {font}>kế thừa</text>")
svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>
<defs><marker id='gen' viewBox='0 0 12 12' refX='11' refY='6' markerWidth='12' markerHeight='12' orient='auto'><path d='M0,0 L12,6 L0,12 z' fill='#fff' stroke='#3d4a5c'/></marker>
<marker id='arr' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='8' markerHeight='8' orient='auto'><path d='M0,0 L10,5 L0,10' fill='none' stroke='#5d6b80'/></marker></defs>
<rect width='{W}' height='{H}' fill='#fff'/>
<rect x='{BX}' y='30' width='{BW}' height='{H-50}' rx='10' fill='#f7f9fc' stroke='#9aa7ba' stroke-width='1.5'/>
<text x='{BX+BW/2}' y='56' text-anchor='middle' font-size='17' font-weight='700' fill='#1c2430' {font}>Hệ thống Hugo Music</text>
{''.join(lines)}
<line x1='{W-110}' y1='{auto_cy-15}' x2='{auto_cx+AW/2}' y2='{auto_cy}' stroke='#8a96a8' stroke-width='1.3'/>
<line x1='{upload[1]+EW/2}' y1='{upload[2]}' x2='{auto_cx}' y2='{auto_cy-EH/2}' stroke='#5d6b80' stroke-width='1.3' stroke-dasharray='6 4' marker-end='url(#arr)'/>
<text x='{auto_cx+8}' y='{upload[2]+4}' font-size='12' fill='#5d6b80' {font}>«kích hoạt»</text>
{''.join(gen)}
{''.join(actor(70, ay, n) for n, ay in actor_y)}
{actor(W-70, auto_cy, 'Worker')}
{''.join(ellipse(cx, cy, t) for _, cx, cy, t in ucs)}
{ellipse(auto_cx, auto_cy, AUTO, '#fdf1e7', '#d39a6a', AW)}
</svg>"""
Path(__file__).resolve().parent.parent.joinpath('docs/book/diagrams/01-use-case.svg').write_text(svg)
print('ok', W, H)
