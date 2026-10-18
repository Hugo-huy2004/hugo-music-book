// Admin khóa, mở khóa, xóa tài khoản người khác. Các việc này chỉ Auth API làm được (cần secret key),
// nên nằm ở Edge Function; danh sách và chi tiết người dùng đọc bằng hàm SQL admin_users/admin_user.
//   POST { action: 'disable' | 'enable' | 'delete', user_id }
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: me } = await admin.auth.getUser(token);
  if (me.user?.app_metadata?.role !== 'admin') return reply({ error: 'admins only' }, 403);

  const { action, user_id } = await req.json();
  if (user_id === me.user.id) return reply({ error: 'không thao tác trên chính tài khoản của mình' }, 400);
  const { data: target } = await admin.auth.admin.getUserById(user_id);
  if (!target.user) return reply({ error: 'user not found' }, 404);
  if (target.user.app_metadata?.role === 'admin') return reply({ error: 'không khóa hay xóa tài khoản admin' }, 400);

  const { error } =
    action === 'disable' ? await admin.auth.admin.updateUserById(user_id, { ban_duration: '876000h' }) // ~100 năm
    : action === 'enable' ? await admin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
    : action === 'delete' ? await admin.auth.admin.deleteUser(user_id)
    : { error: new Error('unknown action') };
  return error ? reply({ error: error.message }, 400) : reply({ ok: true });
});
