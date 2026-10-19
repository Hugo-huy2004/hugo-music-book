// Kiểm tra Worker chạy cục bộ (wrangler dev --local, file mẫu đã đặt vào R2 cục bộ).
// Chạy: EDGE_URL=http://localhost:8787 node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierToken } from '../src/ticket.ts';

const base = process.env.EDGE_URL ?? 'http://localhost:8787';
const secret = process.env.PLAYBACK_SECRET ?? 'local-test-secret';
const song = process.env.SONG_ID ?? '429e342f-6f40-4edd-994e-855ef509ca03';
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');

async function ticket(s: string, e = Math.floor(Date.now() / 1000) + 600) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64(enc.encode(JSON.stringify({ s, e })));
  return `${body}.${b64(await crypto.subtle.sign('HMAC', key, enc.encode(body)))}`;
}
const fileUrl = async (t: string, kbps = 64) => `${base}/a/${song}/${await tierToken(secret, song, kbps)}.mp4?t=${t}`;

test('serves a byte range with a valid ticket', async () => {
  const r = await fetch(await fileUrl(await ticket(song)), { headers: { range: 'bytes=0-1023' } });
  assert.equal(r.status, 206);
  assert.match(r.headers.get('content-range') ?? '', /^bytes 0-1023\/\d+$/);
  assert.equal((await r.arrayBuffer()).byteLength, 1024);
});

test('second listener with a different ticket hits the shared cache', async () => {
  await fetch(await fileUrl(await ticket(song)));            // nạp cache
  await new Promise((r) => setTimeout(r, 300));
  const r = await fetch(await fileUrl(await ticket(song, Math.floor(Date.now() / 1000) + 900)), { headers: { range: 'bytes=0-99' } });
  assert.equal(r.headers.get('x-cache'), 'HIT');
  assert.equal(r.status, 206);
});

test('rejects a forged, expired or other-song ticket', async () => {
  assert.equal((await fetch(await fileUrl('abc.def'))).status, 403);
  assert.equal((await fetch(await fileUrl(await ticket(song, 1)))).status, 403);
  assert.equal((await fetch(await fileUrl(await ticket('00000000-0000-0000-0000-000000000000')))).status, 403);
});

test('file name does not reveal the bitrate', async () => {
  assert.doesNotMatch(await fileUrl(await ticket(song), 256), /256/);
});
