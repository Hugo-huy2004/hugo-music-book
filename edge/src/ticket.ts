// Vé nghe do hugo-stream ký và kiểm (mintToken/verifyToken). File này chỉ còn tên file theo mức.
// Tên file trên URL không ghi bitrate: tok = 16 ký tự đầu của HMAC("tier:<bài>:<kbps>"), để blind test không lộ đáp án qua đường dẫn.
const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();
const keyFor = (secret: string) => {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  return keys.get(secret)!;
};
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function tierToken(secret: string, songId: string, kbps: number) {
  const mac = await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(`tier:${songId}:${kbps}`));
  return b64(mac).slice(0, 16);
}

export const TIERS = [64, 96, 128, 160, 192, 256, 320];
