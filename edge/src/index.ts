// Phát file âm thanh từ R2 qua CDN của Cloudflare.
//   GET /a/<id bài>/<tok>.mp4?t=<vé>   (Range được hỗ trợ)
// 1. Kiểm vé tại điểm biên bằng verifyToken của hugo-stream: không hỏi về database.
// 2. Khóa cache KHÔNG chứa vé: mọi người nghe cùng một file dùng chung một bản cache.
// 3. Cache trượt thì đọc R2 (R2 không tính phí băng thông ra).
import { verifyToken } from 'hugo-stream';
import { tierToken, TIERS } from './ticket';

interface Env { AUDIO: R2Bucket; PLAYBACK_SECRET: string }

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range',
  'access-control-expose-headers': 'content-range, content-length, accept-ranges',
};
const fail = (status: number) => new Response(null, { status, headers: cors });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/a\/([0-9a-f-]{36})\/([\w-]{16})\.mp4$/);
    if (!m) return fail(404);
    const [, songId, tok] = m;

    // Cùng hàm kiểm vé với Edge Function (hugo-stream): vé ký cho "hls/<bài>/" mở mọi mức của đúng bài đó.
    if (!(await verifyToken(`hls/${songId}/`, url.searchParams.get('t'), env.PLAYBACK_SECRET))) return fail(403);

    // tok -> kbps: thử 7 mức có thể (rẻ hơn nhiều so với một lần hỏi database)
    let kbps = 0;
    for (const k of TIERS) if ((await tierToken(env.PLAYBACK_SECRET, songId, k)) === tok) { kbps = k; break; }
    if (!kbps) return fail(404);

    const key = `${songId}/${kbps}.mp4`;
    const cacheKey = new Request(`https://audio-cache/${key}`, { headers: req.headers.has('range') ? { range: req.headers.get('range')! } : {} });
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return withCors(hit, 'HIT');

    const range = req.headers.get('range');
    const obj = await env.AUDIO.get(key, range ? { range: req.headers } : {});
    if (!obj) return fail(404);

    // Lần đầu: nạp cả file vào cache ở nền để các request sau (kể cả Range) đều trúng cache.
    ctx.waitUntil(fillCache(env, key));

    const headers = new Headers(cors);
    obj.writeHttpMetadata(headers);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=7200');
    headers.set('etag', obj.httpEtag);
    headers.set('x-cache', 'MISS');
    if (range && obj.range && 'offset' in obj.range) {
      const start = obj.range.offset ?? 0;
      const len = obj.range.length ?? obj.size - start;
      headers.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
      headers.set('content-length', String(len));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
    }
    headers.set('content-length', String(obj.size));
    return new Response(req.method === 'HEAD' ? null : obj.body, { status: 200, headers });
  },
} satisfies ExportedHandler<Env>;

async function fillCache(env: Env, key: string) {
  const full = await env.AUDIO.get(key);
  if (full) await caches.default.put(new Request(`https://audio-cache/${key}`), fullResponse(full, full));
}

// Bản cache: file không bao giờ đổi (mã hóa lại thì sinh đường dẫn mới), nên giữ một năm.
function fullResponse(meta: R2Object, obj: R2ObjectBody) {
  const headers = new Headers({ 'content-type': 'audio/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable' });
  headers.set('etag', meta.httpEtag);
  headers.set('content-length', String(meta.size));
  return new Response(obj.body, { headers });
}

function withCors(res: Response, tag: string) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  r.headers.set('cache-control', 'private, max-age=7200');
  r.headers.set('x-cache', tag);
  return r;
}
