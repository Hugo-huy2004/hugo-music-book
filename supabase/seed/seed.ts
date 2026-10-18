// Nạp nhạc mẫu: tạo admin, tải file lên Storage, tạo bài, duyệt để worker xử lý.
// Chạy: node --env-file=worker/.env supabase/seed/seed.ts <thư mục demo> <email admin> <mật khẩu>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const [dir, email, password] = process.argv.slice(2);
const url = process.env.SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

// 1. Tài khoản admin: quyền nằm trong app_metadata, người dùng không tự sửa được.
const { data: list } = await admin.auth.admin.listUsers();
let user = list.users.find((u) => u.email === email);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'admin' } });
  if (error) throw error;
  user = data.user;
}
await admin.auth.admin.updateUserById(user.id, { password, app_metadata: { role: 'admin' } });

// 2. Đăng nhập như admin để gọi review_song (hàm tự kiểm tra is_admin()).
const asAdmin = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error: e0 } = await asAdmin.auth.signInWithPassword({ email, password });
if (e0) throw e0;

type Item = { file: string; cover: string; title: string; artist: string; genre: string; color: string };
const items: Item[] = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));

for (const it of items) {
  const { data: artistId, error: e1 } = await asAdmin.rpc('ensure_artist', { p_name: it.artist });
  if (e1) throw e1;
  const { data: exists } = await admin.from('songs').select('id').eq('title', it.title).maybeSingle();
  if (exists) { console.log('skip', it.title); continue; }

  const key = `seed/${it.file}`;
  const cover = `seed/${it.cover}`;
  await admin.storage.from('originals').upload(key, await readFile(join(dir, it.file)), { contentType: 'audio/flac', upsert: true });
  await admin.storage.from('covers').upload(cover, await readFile(join(dir, it.cover)), { contentType: 'image/png', upsert: true });

  const { data: song, error: e2 } = await admin.from('songs').insert({
    title: it.title, artist_id: artistId, genre: it.genre, cover_color: it.color,
    license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source_url: 'https://github.com/Hugo-huy2004/hugo-music-book', original_path: key, cover_path: cover,
    uploaded_by: user.id,
  }).select('id').single();
  if (e2) throw e2;

  const { error: e3 } = await asAdmin.rpc('review_song', { p_song_id: song.id, p_decision: 'publish' });
  if (e3) throw e3;
  console.log('queued', it.title);
}
