// Chương 11: Edge Function cấp quyền nghe và phát playlist HLS.
//   POST /functions/v1/playback  { song_id }       (kèm phiên đăng nhập)  -> { url, remaining }
//   GET  /functions/v1/playback?t=<vé>[&kbps=128]  (trình phát gọi)         -> playlist .m3u8
//   GET  /functions/v1/playback?t=<vé>&trial=<id>&side=A   (blind test)      -> playlist của bên A, không lộ bitrate
// Trình phát (<audio>, AVPlayer, ExoPlayer) không gửi được header đăng nhập, nên quyền nghe nằm trong
// một "vé" ký bằng HMAC, sống 2 giờ, chỉ mở đúng một bài.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TICKET_TTL = 2 * 60 * 60; // giây
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };

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
  let kbps = u.searchParams.get('kbps');
  const trial = u.searchParams.get('trial');
  if (trial) kbps = String(await blindSideKbps(trial, songId, u.searchParams.get('side')));
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
  const tpl = await template(base);
  // Có CDN (Cloudflare Worker + R2, chương 23): link file không chứa bitrate, dùng chung vé, cache được ở điểm biên.
  // Chưa có: link ký của Supabase Storage.
  const fileUrl = CDN
    ? `${CDN}/a/${songId}/${await tierToken(songId, Number(kbps))}.mp4?t=${u.searchParams.get('t')}`
    : await signedUrl(`${base}.mp4`);
  return new Response(tpl.replaceAll(`${Number(kbps)}.mp4`, fileUrl), m3u8);
}

// Playlist mẫu của mỗi mức không bao giờ đổi: giữ trong bộ nhớ của function, khỏi tải lại từ Storage mỗi lượt.
const CDN = Deno.env.get('AUDIO_CDN_URL');
const templates = new Map<string, string>();
async function template(base: string) {
  if (!templates.has(base)) {
    const { data, error } = await admin.storage.from('audio').download(`${base}.m3u8`);
    if (error) throw error;
    if (templates.size > 2000) templates.clear();
    templates.set(base, await data.text());
  }
  return templates.get(base)!;
}
async function signedUrl(path: string) {
  const { data, error } = await admin.storage.from('audio').createSignedUrl(path, TICKET_TTL);
  if (error) throw error;
  return data.signedUrl;
}
async function tierToken(songId: string, kbps: number) {
  return b64(await crypto.subtle.sign('HMAC', await key, enc.encode(`tier:${songId}:${kbps}`))).slice(0, 16);
}

// Blind test: client chỉ biết "bên A", "bên B"; mức bitrate của mỗi bên chỉ server biết tới khi công bố.
async function blindSideKbps(trialId: string, songId: string, side: string | null) {
  const { data, error } = await admin.from('blind_trials').select('song_id, a_kbps, b_kbps').eq('id', trialId).single();
  if (error) throw error;
  if (data.song_id !== songId || (side !== 'A' && side !== 'B')) throw new Error('ticket does not match trial');
  return side === 'A' ? data.a_kbps : data.b_kbps;
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
