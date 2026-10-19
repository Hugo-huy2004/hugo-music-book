// Chuyển file âm thanh (.mp4) đã xử lý từ Supabase Storage sang Cloudflare R2 (chương 23).
// Playlist mẫu (.m3u8) ở lại Supabase. Chạy lại nhiều lần được: file đã có trên R2 thì bỏ qua.
// Chạy: node --env-file=worker/.env scripts/move-audio-to-r2.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../worker/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const { AwsClient } = require('aws4fetch');

const { SUPABASE_URL, SUPABASE_SECRET_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = 'hugo-music-audio' } = process.env;
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
const r2Url = (path) => `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`;

const { data: songs } = await db.from('songs').select('id, title, hls_tiers').eq('status', 'published');
let moved = 0, bytes = 0;
for (const s of songs) {
  for (const k of s.hls_tiers) {
    const path = `${s.id}/${k}.mp4`;
    if ((await r2.fetch(r2Url(path), { method: 'HEAD' })).ok) continue;
    const { data, error } = await db.storage.from('audio').download(path);
    if (error) throw error;
    const body = new Uint8Array(await data.arrayBuffer());
    const res = await r2.fetch(r2Url(path), { method: 'PUT', body, headers: { 'content-type': 'audio/mp4', 'cache-control': 'public, max-age=31536000, immutable' } });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    moved++; bytes += body.byteLength;
  }
  console.log('✓', s.title);
}
console.log(`đã chuyển ${moved} file, ${(bytes / 1e6).toFixed(1)} MB`);
