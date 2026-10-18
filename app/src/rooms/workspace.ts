// Đồng bộ phát nhạc giữa nhiều máy qua một kênh Realtime riêng tư. Dùng cho hai tính năng:
//   workspace:<user id>  các máy của CÙNG một người (laptop -> điện thoại nghe tiếp)
//   group:<group id>     nhóm nghe chung (chủ nhóm điều khiển, thành viên phát theo)
// Broadcast mang trạng thái phát; Presence đếm số máy/người đang ở trong kênh.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

let channel: RealtimeChannel | null = null;

type Handlers = {
  onState: (state: any) => void;     // máy khác vừa phát/dừng/tua/đổi bài
  onStateRequest: () => void;        // máy mới vào hỏi "đang phát gì?"
  onMembers: (members: { name?: string }[]) => void;
};

export async function joinSyncChannel(topic: string, device: string, me: { name?: string }, h: Handlers) {
  await leaveSyncChannel();
  await supabase.realtime.setAuth(); // kênh riêng tư: Realtime kiểm quyền bằng JWT (chính sách trên realtime.messages)
  channel = supabase.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key: device } } });
  channel
    .on('broadcast', { event: 'play_sync' }, ({ payload }) => h.onState(payload))
    .on('broadcast', { event: 'state_request' }, () => h.onStateRequest())
    .on('presence', { event: 'sync' }, () => h.onMembers(Object.values(channel!.presenceState()).map((p: any) => p[0] ?? {})))
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel!.track({ name: me.name, joinedAt: Date.now() });
      channel!.send({ type: 'broadcast', event: 'state_request', payload: {} });
    });
}

export function sendSyncState(payload: unknown) {
  channel?.send({ type: 'broadcast', event: 'play_sync', payload });
}

export async function leaveSyncChannel() {
  if (channel) await supabase.removeChannel(channel);
  channel = null;
}
