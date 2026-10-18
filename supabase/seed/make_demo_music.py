"""Tạo nhạc demo cho Hugo Music (tự tổng hợp, phát hành CC0) để seed database mà không cần tải nhạc của ai.
python3 make_demo_music.py <thư mục ra>   -> mỗi bài một file .flac + một ảnh bìa .png"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SR = 44100
NOTES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)

def chord(root, minor):  # bộ ba
    r = 48 + NOTES[root]
    return [r, r + (3 if minor else 4), r + 7]

def tone(f, dur, kind, vol):
    t = np.arange(int(SR * dur)) / SR
    if kind == 'pad':
        w = sum(np.sin(2 * np.pi * f * k * t) / k for k in (1, 2, 3)) * 0.4
        env = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4 + 0.01)
    elif kind == 'pluck':
        w = np.sign(np.sin(2 * np.pi * f * t)) * 0.3 + np.sin(2 * np.pi * f * t) * 0.5
        env = np.exp(-t * 6)
    else:  # bass
        w = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
        env = np.exp(-t * 2.5)
    return w * env * vol

def drums(beats, bpm, style):
    beat = 60 / bpm
    out = np.zeros(int(SR * beat * beats) + SR)
    rng = np.random.default_rng(7)
    for b in range(beats):
        i = int(b * beat * SR)
        if style != 'none':
            if b % 2 == 0:  # kick
                t = np.arange(int(SR * 0.25)) / SR
                out[i:i + len(t)] += np.sin(2 * np.pi * (50 + 80 * np.exp(-t * 30)) * t) * np.exp(-t * 12) * 0.9
            if b % 2 == 1:  # snare
                n = int(SR * 0.15)
                out[i:i + n] += rng.normal(0, 0.35, n) * np.exp(-np.arange(n) / SR * 25)
            for h in (0, 0.5):  # hi-hat
                j = int(i + h * beat * SR); n = int(SR * 0.04)
                out[j:j + n] += rng.normal(0, 0.12 if style == 'soft' else 0.2, n) * np.exp(-np.arange(n) / SR * 80)
    return out

def song(prog, bpm, minutes, style, lead):
    beat = 60 / bpm
    bars = int(minutes * 60 / (beat * 4))
    total = np.zeros(int(SR * beat * 4 * bars) + SR * 2)
    rng = np.random.default_rng(len(prog) * bpm)
    for bar in range(bars):
        name = prog[bar % len(prog)]
        notes = chord(name.rstrip('m'), name.endswith('m'))
        i = int(bar * 4 * beat * SR)
        for n in notes:
            seg = tone(hz(n + 12), beat * 4, 'pad', 0.12)
            total[i:i + len(seg)] += seg
        seg = tone(hz(notes[0] - 12), beat * 2, 'bass', 0.35)
        total[i:i + len(seg)] += seg
        total[i + int(2 * beat * SR):i + int(2 * beat * SR) + len(seg)] += seg
        if lead:
            for k in range(8):
                n = notes[rng.integers(0, 3)] + 24 + (12 if rng.random() < 0.2 else 0)
                s = tone(hz(n), beat / 2, 'pluck', 0.14)
                j = i + int(k * beat / 2 * SR)
                total[j:j + len(s)] += s
    d = drums(bars * 4, bpm, style)
    total[:len(d)] += d[:len(total)] * (0.6 if style == 'soft' else 0.9)
    fade = int(SR * 3)
    total[:fade] *= np.linspace(0, 1, fade); total[-fade:] *= np.linspace(1, 0, fade)
    total /= np.max(np.abs(total)) * 1.1
    stereo = np.stack([total, np.roll(total, 220)], axis=1)
    return (stereo * 32767).astype(np.int16)

def cover(path, c1, c2, title):
    W = 1000
    img = Image.new('RGB', (W, W))
    a, b = np.array(Image.new('RGB', (1, 1), c1).getpixel((0, 0))), np.array(Image.new('RGB', (1, 1), c2).getpixel((0, 0)))
    g = np.linspace(0, 1, W)[None, :, None] * 0.6 + np.linspace(0, 1, W)[:, None, None] * 0.4
    img = Image.fromarray((a * (1 - g) + b * g).astype(np.uint8))
    d = ImageDraw.Draw(img, 'RGBA')
    h = abs(hash(title))
    for k in range(5):
        x, y, r = (h >> (k * 5)) % W, (h >> (k * 7)) % W, 120 + (h >> k) % 260
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 38))
    img.filter(ImageFilter.GaussianBlur(2)).save(path)

CATALOG = [
    ('Mưa Đêm Sài Gòn', 'Lofi Sài Gòn', 'Lo-fi', ['Am', 'F', 'C', 'G'], 78, 'soft', True, '#5AC8FA', '#5856D6'),
    ('Sóng Xa', 'Kim Ngân', 'Ambient', ['Em', 'C', 'G', 'D'], 70, 'none', False, '#64D2FF', '#0A84FF'),
    ('Neon Street', 'Pulse Theory', 'Electronic', ['Dm', 'A#', 'F', 'C'], 124, 'hard', True, '#BF5AF2', '#FF2D55'),
    ('Golden Hour', 'Mira Vale', 'Pop', ['C', 'G', 'Am', 'F'], 104, 'hard', True, '#FF9F0A', '#FF375F'),
    ('Bến Xưa', 'Hà Linh', 'Folk', ['G', 'Em', 'C', 'D'], 92, 'soft', True, '#30D158', '#A2845E'),
    ('Moonlight Waltz', 'Orchestra Viva', 'Classical', ['Am', 'Dm', 'E', 'Am'], 84, 'none', True, '#AC8E68', '#5E5CE6'),
    ('City Lines', 'MC Bình', 'Hip hop', ['Fm', 'C#', 'D#', 'Cm'], 90, 'hard', False, '#FFD60A', '#FF9F0A'),
    ('Chạm Khẽ', 'Lofi Sài Gòn', 'Lo-fi', ['Dm', 'Gm', 'C', 'F'], 74, 'soft', True, '#5E5CE6', '#64D2FF'),
    ('Drift', 'Kim Ngân', 'Ambient', ['C', 'Am', 'F', 'G'], 66, 'none', True, '#0A84FF', '#30D158'),
    ('After Party', 'Pulse Theory', 'House', ['Am', 'G', 'F', 'E'], 126, 'hard', True, '#FF2D55', '#BF5AF2'),
]

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    manifest = []
    for i, (title, artist, genre, prog, bpm, style, lead, c1, c2) in enumerate(CATALOG):
        slug = f'{i:02d}'
        pcm = song(prog, bpm, 1.5, style, lead)
        raw = os.path.join(out, f'{slug}.raw'); pcm.tofile(raw)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', raw,
                        '-metadata', f'title={title}', '-metadata', f'artist={artist}', os.path.join(out, f'{slug}.flac')], check=True)
        os.remove(raw)
        cover(os.path.join(out, f'{slug}.png'), c1, c2, title)
        manifest.append({'file': f'{slug}.flac', 'cover': f'{slug}.png', 'title': title, 'artist': artist, 'genre': genre, 'color': c1})
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{len(manifest)} bài -> {out}')
