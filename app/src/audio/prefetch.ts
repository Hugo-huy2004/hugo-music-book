import { resolvePlayback } from '../api/api';
import { supabase } from '../api/supabase';

// Chuẩn bị trước bài kế tiếp để bấm "Tiếp" là phát ngay: xin sẵn vé nghe (được giữ trong
// resolvePlayback) và tải sẵn master playlist. Không tải âm thanh: người nghe hay bỏ qua bài,
// tải trước là tiêu dữ liệu của họ.
const done = new Set<string>();

export async function prefetchNext(song: { _id: string; hlsTiers?: string[] } | null, quality: string) {
  if (!song || done.has(song._id)) return;
  // Khách: mỗi vé tính là một lượt nghe trong 3 lượt/ngày, nên không xin trước.
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return;
  done.add(song._id);
  if (done.size > 50) done.clear();
  try {
    const { url } = await resolvePlayback(song, quality);
    await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    // Tải trước hỏng cũng không sao: không được ảnh hưởng bài đang phát.
  }
}
