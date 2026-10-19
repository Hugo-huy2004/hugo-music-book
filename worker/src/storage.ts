// Nơi đặt file đã xử lý.
// - Playlist mẫu (.m3u8, vài KB): luôn ở Supabase Storage; Edge Function playback đọc nó.
// - File âm thanh (.mp4): Cloudflare R2 nếu đã cấu hình (không tính phí băng thông ra, chương 23),
//   chưa có thì Supabase Storage. Cả hai đều đặt Cache-Control một năm: file không bao giờ đổi.
import { AwsClient } from 'aws4fetch';
import { db } from './supabase.ts';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = 'hugo-music-audio' } = process.env;
const r2 = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
  : null;
const IMMUTABLE = 'public, max-age=31536000, immutable';

export const audioBackend = r2 ? 'r2' : 'supabase';

export async function putAudioFile(path: string, body: Uint8Array) {
  const isPlaylist = path.endsWith('.m3u8');
  const contentType = isPlaylist ? 'application/vnd.apple.mpegurl' : 'audio/mp4';
  if (r2 && !isPlaylist) {
    const res = await r2.fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`, {
      method: 'PUT', body: body as unknown as BodyInit, headers: { 'content-type': contentType, 'cache-control': IMMUTABLE },
    });
    if (!res.ok) throw new Error(`R2 upload ${path}: ${res.status} ${await res.text()}`);
    return;
  }
  const { error } = await db.storage.from('audio').upload(path, body, { contentType, cacheControl: '31536000', upsert: true });
  if (error) throw error;
}
