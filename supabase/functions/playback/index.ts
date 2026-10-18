// Chương 11: Edge Function cấp quyền nghe và phát playlist HLS.
//   POST /functions/v1/playback  { song_id }       (kèm phiên đăng nhập)  -> { url, remaining }
//   GET  /functions/v1/playback?t=<vé>[&kbps=128]  (trình phát gọi)         -> playlist .m3u8
// Trình phát (<audio>, AVPlayer, ExoPlayer) không gửi được header đăng nhập, nên quyền nghe nằm trong
// một "vé" ký bằng HMAC, sống 2 giờ, chỉ mở đúng một bài.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TICKET_TTL = 2 * 60 * 60; // giây
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    return req.method === 'POST' ? await grant(req) : await playlist(new URL(req.url));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers: cors });
  }
});

// Bước 1: kiểm quyền bằng chính phiên của người nghe (hàm claim_playback đếm lượt của khách).
async function grant(req: Request) {
  const { song_id } = await req.json();
  const asUser = createClient(url, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await asUser.rpc('claim_playback', { p_song_id: song_id });
  if (error) throw error;
  if (!data.allowed) return Response.json(data, { status: 403, headers: cors });

  const ticket = await sign({ s: song_id, e: Math.floor(Date.now() / 1000) + TICKET_TTL });
  return Response.json({ url: `${url}/functions/v1/playback?t=${ticket}`, remaining: data.remaining }, { headers: cors });
}

// Bước 2: phát playlist. Không có kbps -> master (danh sách các mức); có kbps -> playlist của mức đó,
// trong đó đường dẫn file nhạc là link ký của Storage (đi thẳng qua CDN, không qua function).
async function playlist(u: URL) {
  const { s: songId } = await verify(u.searchParams.get('t') ?? '');
  const kbps = u.searchParams.get('kbps');
  const m3u8 = { headers: { ...cors, 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'private, max-age=60' } };

  if (!kbps) {
    const { data: song, error } = await admin.from('songs').select('hls_tiers').eq('id', songId).single();
    if (error) throw error;
    const lines = ['#EXTM3U', '#EXT-X-VERSION:7'];
    for (const k of song.hls_tiers as number[]) {
      lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${k * 1100},CODECS="mp4a.40.2"`, `?t=${u.searchParams.get('t')}&kbps=${k}`);
    }
    return new Response(lines.join('\n') + '\n', m3u8);
  }

  const base = `${songId}/${Number(kbps)}`;
  const [{ data: tpl, error: e1 }, { data: signed, error: e2 }] = await Promise.all([
    admin.storage.from('audio').download(`${base}.m3u8`),
    admin.storage.from('audio').createSignedUrl(`${base}.mp4`, TICKET_TTL),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  // Worker ghi playlist với tên file tương đối; thay bằng link ký tuyệt đối.
  const text = (await tpl.text()).replaceAll(`${Number(kbps)}.mp4`, signed.signedUrl);
  return new Response(text, m3u8);
}

// ---- vé HMAC (Web Crypto có sẵn trong Deno, không cần thư viện)
const enc = new TextEncoder();
const key = crypto.subtle.importKey('raw', enc.encode(Deno.env.get('PLAYBACK_SECRET')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function sign(payload: { s: string; e: number }) {
  const body = b64(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64(await crypto.subtle.sign('HMAC', await key, enc.encode(body)))}`;
}
async function verify(ticket: string) {
  const [body, mac] = ticket.split('.');
  if (!body || !mac || !(await crypto.subtle.verify('HMAC', await key, unb64(mac), enc.encode(body)))) throw new Error('invalid ticket');
  const p = JSON.parse(new TextDecoder().decode(unb64(body))) as { s: string; e: number };
  if (p.e < Date.now() / 1000) throw new Error('ticket expired');
  return p;
}
