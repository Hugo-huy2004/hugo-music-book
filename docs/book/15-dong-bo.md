## Chương 15. Đồng bộ giữa các máy của cùng một người

### Chương này làm gì

Bật *Đồng bộ* trên laptop và điện thoại: bấm phát, dừng, tua ở máy này thì máy kia làm theo, đúng vị trí. Chỉ máy của chính chủ tài khoản vào được kênh đồng bộ.

### Để làm gì

Người nghe hay chuyển máy: nghe trên máy tính ở nhà, ra đường mở điện thoại nghe tiếp. Đồng bộ cũng biến điện thoại thành điều khiển từ xa cho loa máy tính.

### Phân tích kỹ thuật

Kênh đài ở chương 13 là kênh công khai: ai biết tên kênh cũng vào được. Đồng bộ cá nhân cần **kênh riêng tư**.

| Cách | Ghi chú |
|---|---|
| Lưu trạng thái phát vào bảng, máy khác nghe Postgres Changes | Mỗi lần tua là một lượt ghi database; chậm và tốn |
| **Kênh Realtime riêng tư + Broadcast + Presence** | Tin nhắn đi thẳng giữa các máy qua Realtime, không ghi database; quyền vào kênh là chính sách RLS trên `realtime.messages` |

### Chọn gì, vì sao

**Kênh riêng tư `workspace:<id người dùng>`. Chính sách RLS chỉ cho đúng người đó đọc và gửi trên kênh. Broadcast mang trạng thái phát; Presence đếm số máy đang mở.** Máy mới vào kênh hỏi "đang phát gì", máy đang phát trả lời; không cần lưu trạng thái ở đâu cả.

### Làm từng bước

**Bước 1: quyền trên kênh riêng tư.** `realtime.topic()` là tên kênh người dùng đang xin vào.

```sql
-- supabase/migrations/20261018001100_realtime.sql
create policy "users join their own workspace channel"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'workspace:' || (select auth.uid())::text);

create policy "users broadcast on their own workspace channel"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'workspace:' || (select auth.uid())::text);
```

**Bước 2: vào kênh.** `private: true` buộc Realtime kiểm quyền bằng JWT của người dùng; `broadcast: { self: false }` để máy không nhận lại tin của chính mình; mỗi máy một khóa Presence.

```ts
// app/src/rooms/workspace.ts (trích)
export async function joinWorkspace(userId: string, device: string, h: Handlers) {
  await supabase.realtime.setAuth();
  channel = supabase.channel(`workspace:${userId}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: device } },
  });
  channel
    .on('broadcast', { event: 'play_sync' }, ({ payload }) => h.onState(payload))
    .on('broadcast', { event: 'state_request' }, () => h.onStateRequest())
    .on('presence', { event: 'sync' }, () => h.onMembers(Object.keys(channel!.presenceState()).length))
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel!.track({ joinedAt: Date.now() });
      channel!.send({ type: 'broadcast', event: 'state_request', payload: {} });   // "đang phát gì?"
    });
}
```

**Bước 3: gửi trạng thái theo giờ máy chủ.** Gửi "bài nào, vị trí bao nhiêu, *tại giờ máy chủ nào*, đang phát hay dừng". Máy nhận tự cộng thời gian trôi qua, nên tin nhắn tới chậm vài trăm mili giây vẫn khớp.

```ts
// app/src/store/useStore.ts (trích)
timeline = { songId: currentSong._id, pos, at: serverNow(), playing, device: DEVICE };
sendWorkspaceState({ ...timeline, queue: queue.map((s) => s._id).slice(0, 200), queueIndex });

const expectedOf = (t: Timeline) => () => t.pos + (t.playing ? (serverNow() - t.at) / 1000 : 0);
```

### Kết quả

> 📷 Ảnh: màn hình Tài khoản với công tắc Đồng bộ và dòng "2 thiết bị đang mở"; hai cửa sổ cùng tài khoản phát cùng vị trí.

### Kiểm tra

- Đăng nhập cùng tài khoản ở hai trình duyệt, bật Đồng bộ: tua ở một bên, bên kia nhảy theo.
- Đăng nhập tài khoản khác, thử `supabase.channel('workspace:<id người kia>', { config: { private: true } }).subscribe()`: trạng thái trả về lỗi quyền, không nhận được tin nào.

### Khi nào đổi

- **Muốn "nghe tiếp" cả khi máy kia đã tắt:** lưu trạng thái cuối cùng vào một bảng (ghi khi dừng hoặc mỗi 30 giây), máy mới đọc bảng nếu không ai trả lời `state_request`.
- **Mời bạn nghe cùng:** thêm bảng thành viên phòng và đổi chính sách thành `exists (thành viên)` như ví dụ phòng riêng trong tài liệu Realtime Authorization.
