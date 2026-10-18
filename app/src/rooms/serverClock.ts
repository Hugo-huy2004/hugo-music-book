import { createServerClock } from 'hugo-stream';
import { supabase } from '../api/supabase';

// Giờ máy chủ: gọi hàm server_now() vài lần, lấy lần có độ trễ thấp nhất (createServerClock của hugo-stream).
// Mọi máy cùng nghe đài tính vị trí theo giờ này, nên đồng hồ điện thoại lệch vài giây cũng không sao.
const clock = createServerClock(async () => {
  const { data, error } = await supabase.rpc('server_now');
  return error ? null : Date.parse(data as string);
});

export const serverNow = clock.now;
export const syncClock = clock.sync;
