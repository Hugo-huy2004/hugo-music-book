// Đồng bộ giữa các máy của CÙNG một người (nghe trên laptop, chuyển sang điện thoại nghe tiếp).
// Kênh Realtime riêng tư `workspace:<user id>`: Broadcast mang trạng thái phát, Presence đếm số máy đang mở.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

let channel: RealtimeChannel | null = null;

type Handlers = {
  onState: (state: any) => void;           // máy khác vừa phát/dừng/tua
  onStateRequest: () => void;              // máy mới vào hỏi "đang phát gì?"
  onMembers: (count: number) => void;
};

export async function joinWorkspace(userId: string, device: string, h: Handlers) {
  await leaveWorkspace();
  await supabase.realtime.setAuth(); // kênh riêng tư: Realtime kiểm quyền bằng JWT của người dùng
  channel = supabase.channel(`workspace:${userId}`, { config: { private: true, broadcast: { self: false }, presence: { key: device } } });
  channel
    .on('broadcast', { event: 'play_sync' }, ({ payload }) => h.onState(payload))
    .on('broadcast', { event: 'state_request' }, () => h.onStateRequest())
    .on('presence', { event: 'sync' }, () => h.onMembers(Object.keys(channel!.presenceState()).length))
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel!.track({ joinedAt: Date.now() });
      channel!.send({ type: 'broadcast', event: 'state_request', payload: {} });
    });
}

export function sendWorkspaceState(payload: unknown) {
  channel?.send({ type: 'broadcast', event: 'play_sync', payload });
}

export async function leaveWorkspace() {
  if (channel) await supabase.removeChannel(channel);
  channel = null;
}
