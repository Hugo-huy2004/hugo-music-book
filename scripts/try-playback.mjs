// Thử đường phát nhạc từ đầu tới cuối, không cần app: đăng nhập → xin vé → master playlist
// → playlist một mức → tải 1 KB đầu file âm thanh bằng byte range.
// Chạy: node --env-file=worker/.env scripts/try-playback.mjs <email> <mật khẩu>
import { createRequire } from 'node:module';
const { createClient } = createRequire(import.meta.url)('@supabase/supabase-js');

const [email, password] = process.argv.slice(2);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email, password });

const { data: song } = await db.from('songs').select('id, title').eq('status', 'published').limit(1).single();
const { data: ticket, error } = await db.functions.invoke('playback', { body: { song_id: song.id } });
if (error) throw error;
const short = (s) => s.replace(/(t=[\w.-]{12})[\w.-]+/g, '$1…').replace(/(token=[\w.-]{10})[\w.-]+/g, '$1…');
console.log(`Bài: ${song.title}\nVé: ${short(ticket.url)}\n`);

const master = await (await fetch(ticket.url)).text();
console.log(short(master));
const variant = master.split('\n').find((l) => l.startsWith('?'));
const media = await (await fetch(ticket.url.split('?')[0] + variant)).text();
console.log(short(media.split('\n').slice(0, 9).join('\n')), '\n…');

const segment = media.split('\n').find((l) => l.startsWith('http'));
const res = await fetch(segment, { headers: { range: 'bytes=0-1023' } });
console.log(`\nGET đoạn âm thanh (Range: bytes=0-1023) → ${res.status} ${res.headers.get('content-type')}, ${res.headers.get('content-range')}`);
