// Mỗi ngày một lần: xóa khách ẩn danh không quay lại sau 30 ngày, bằng API chính thức của Supabase Auth.
import { db } from './supabase.ts';

export async function cleanupGuests() {
  const { data: ids, error } = await db.rpc('stale_guest_ids', { p_days: 30, p_limit: 500 });
  if (error) throw error;
  for (const id of ids as string[]) await db.auth.admin.deleteUser(id);
  return (ids as string[]).length;
}

const DAY = 24 * 60 * 60 * 1000;
export function scheduleCleanup() {
  const run = () => cleanupGuests().then((n) => n && console.log(`cleanup: removed ${n} stale guests`)).catch((e) => console.error('cleanup failed', e.message));
  setTimeout(run, 60_000).unref();  // chạy lần đầu sau 1 phút
  setInterval(run, DAY).unref();    // rồi mỗi ngày; unref: không giữ tiến trình sống chỉ vì hẹn giờ này
}
