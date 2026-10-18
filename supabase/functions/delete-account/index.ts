// Người dùng tự xóa tài khoản (App Store bắt buộc có). Xóa qua API chính thức auth.admin.deleteUser():
// hồ sơ, lượt thích, danh sách phát, lượt nghe xóa theo nhờ "on delete cascade".
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  // Hỏi Supabase Auth: token này của ai? (token giả hoặc hết hạn -> lỗi)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: 'not signed in' }, { status: 401, headers: cors });

  // Xóa file ảnh đại diện trước (Storage không tự xóa theo tài khoản)
  const { data: files } = await admin.storage.from('avatars').list(data.user.id);
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${data.user.id}/${f.name}`));

  const { error: e2 } = await admin.auth.admin.deleteUser(data.user.id);
  if (e2) return Response.json({ error: e2.message }, { status: 500, headers: cors });
  return Response.json({ deleted: true }, { headers: cors });
});
