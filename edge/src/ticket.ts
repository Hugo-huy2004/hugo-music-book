// Vé nghe: cùng định dạng với Edge Function playback (chương 11): base64url(JSON{s,e}).base64url(HMAC-SHA256).
// Tên file trên URL không ghi bitrate: tok = 16 ký tự đầu của HMAC("tier:<bài>:<kbps>"), để blind test không lộ đáp án qua đường dẫn.
const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();
const keyFor = (secret: string) => {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return keys.get(secret)!;
};
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function verifyTicket(secret: string, ticket: string, now = Date.now() / 1000) {
  const [body, mac] = ticket.split('.');
  if (!body || !mac) return null;
  if (!(await crypto.subtle.verify('HMAC', await keyFor(secret), unb64(mac), enc.encode(body)))) return null;
  const p = JSON.parse(new TextDecoder().decode(unb64(body))) as { s: string; e: number };
  return p.e >= now ? p : null;
}

export async function tierToken(secret: string, songId: string, kbps: number) {
  const mac = await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(`tier:${songId}:${kbps}`));
  return b64(mac).slice(0, 16);
}

export const TIERS = [64, 96, 128, 160, 192, 256, 320];
