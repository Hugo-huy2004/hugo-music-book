## Chương 14. Blind test: game nghe chung chạy trong database

### Chương này làm gì

Phòng *Tai vàng*: cả phòng nghe cùng một đoạn 10 giây ở hai mức chất lượng, A rồi B. Mỗi người chọn bản hay hơn hoặc "như nhau". Hết giờ, mọi người cùng thấy đáp án, số phiếu và bảng xếp hạng. Kết quả được tổng hợp để kiểm chứng PSL.

### Để làm gì

PSL (chương 10) dựa trên điểm của ViSQOL, một thuật toán. Câu hỏi thật là: **người nghe có phân biệt được không?** Blind test lấy câu trả lời từ chính người dùng, dưới dạng một trò chơi.

### Phân tích kỹ thuật

Một trò chơi nhiều người cần: đồng hồ chung (mọi người nghe A cùng lúc), giấu đáp án tới khi công bố, chấm điểm, và một "người dẫn" đẩy trò chơi qua từng bước.

| Người dẫn | Ghi chú |
|---|---|
| Server game riêng (Node.js + WebSocket) | Thêm một server phải chạy mãi, giữ trạng thái trong RAM |
| Một client làm "chủ phòng" | Chủ phòng thoát là phòng đứng; client gian lận được |
| **pg_cron mỗi giây gọi một hàm SQL** | Trạng thái nằm trong bảng; hàm đẩy phòng sang bước kế (tạo lượt, công bố) và phát sự kiện qua Realtime |

**Giấu đáp án:** client cần biết mức bitrate để tải đúng file A và B, nhưng không được biết *mức nào cao hơn* trước khi công bố. Vì A/B được đảo ngẫu nhiên và nhãn "hay hơn" chỉ gửi trong sự kiện công bố, client chỉ biết hai con số. Hiện app không hiện hai con số này trước khi công bố.

### Chọn gì, vì sao

**Bảng `blind_trials` lưu từng lượt với các mốc giờ tuyệt đối (nghe A lúc nào, B lúc nào, hết giờ bỏ phiếu lúc nào); hàm `advance_blind_rooms()` chạy mỗi giây; bỏ phiếu qua hàm `vote_blind()`; ba loại sự kiện Broadcast: `trial`, `votes`, `reveal`.** Một phần sáu số lượt là *lượt kiểm tra*: A và B giống hệt, đáp án đúng là "như nhau", để lọc người chọn bừa.

### Làm từng bước

**Bước 1: một lượt là một dòng với các mốc giờ.**

```sql
-- supabase/migrations/20261018000900_blind_test.sql (trích)
create table public.blind_trials (
  id            uuid primary key default gen_random_uuid(),
  room_id       bigint not null references public.blind_rooms (id) on delete cascade,
  no            integer not null,
  song_id       uuid not null references public.songs (id) on delete cascade,
  a_kbps        integer not null,
  b_kbps        integer not null,
  is_control    boolean not null,            -- A và B giống hệt
  excerpt_start numeric(8, 2) not null,
  excerpt_sec   numeric(6, 2) not null default 10,
  a_at          timestamptz not null,        -- lúc cả phòng bắt đầu nghe A
  b_at          timestamptz not null,
  vote_until    timestamptz not null,
  reveal_until  timestamptz not null,
  revealed      boolean not null default false
);
```

**Bước 2: hàm dẫn trò chơi.** Mỗi giây, với mỗi phòng: hết giờ bỏ phiếu thì chấm điểm và công bố; công bố xong thì tạo lượt mới. Trích phần tạo lượt:

```sql
v_low := s.hls_tiers[1];
v_high := s.hls_tiers[cardinality(s.hls_tiers)];
v_control := random() < 1.0 / 6;
v_a := v_low; v_b := case when v_control then v_low else v_high end;
if random() < 0.5 then select v_b, v_a into v_a, v_b; end if;   -- đảo vị trí
v_start := now() + interval '3 seconds';
insert into public.blind_trials (room_id, no, song_id, a_kbps, b_kbps, is_control, excerpt_start, excerpt_sec,
                                 a_at, b_at, vote_until, reveal_until)
values (r.id, coalesce(t.no, 0) + 1, s.id, v_a, v_b, v_control, ..., v_ex,
        v_start, v_start + make_interval(secs => v_ex + 1),
        v_start + make_interval(secs => 2 * v_ex + 9), v_start + make_interval(secs => 2 * v_ex + 15))
returning * into t;
perform realtime.send(public.blind_trial_json(t), 'trial', 'blind:' || r.id, false);
```

```sql
select cron.schedule('advance-blind-rooms', '1 seconds', $$ select public.advance_blind_rooms() $$);
```

**Bước 3: chấm điểm khi công bố.** Đúng khi: lượt kiểm tra chọn "như nhau", hoặc chọn bản có bitrate cao hơn. Chọn "như nhau" ở lượt thường không tính đúng sai: đó chính là dữ liệu quý cho PSL (người nghe không phân biệt được).

```sql
update public.blind_votes set correct = case
    when t.is_control then choice = 'same'
    when choice = 'same' then null
    else (choice = 'A') = (t.a_kbps > t.b_kbps)
  end
 where trial_id = t.id;
```

**Bước 4: bỏ phiếu.** Chỉ nhận phiếu trong khung giờ; đổi ý được trước khi hết giờ; báo cho phòng biết đã có bao nhiêu người chọn (không lộ ai chọn gì).

```sql
create or replace function public.vote_blind(p_trial_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.blind_trials; v_count integer;
begin
  select * into t from public.blind_trials where id = p_trial_id;
  if t.revealed or now() > t.vote_until or now() < t.b_at then
    raise exception 'voting is closed for this trial';
  end if;
  insert into public.blind_votes (trial_id, choice) values (p_trial_id, p_choice)
  on conflict (trial_id, user_id) do update set choice = excluded.choice;
  select count(*) into v_count from public.blind_votes where trial_id = p_trial_id;
  perform realtime.send(jsonb_build_object('trialId', p_trial_id, 'voted', v_count), 'votes', 'blind:' || t.room_id, false);
end;
$$;
```

**Bước 5: app nghe ba sự kiện.** Mỗi lượt xin một vé nghe cho bài, rồi tạo hai URL cho hai mức.

```ts
// app/src/rooms/useRooms.ts (trích)
const { url } = await resolvePlayback({ _id: trial.song._id }, 'auto');
trialUrls = { A: `${url}&kbps=${trial.a.kbps}`, B: `${url}&kbps=${trial.b.kbps}` };

roomChannel = supabase.channel(`blind:${id}`)
  .on('broadcast', { event: 'trial' }, async ({ payload }) => runTrial(await toTrial(payload)))
  .on('broadcast', { event: 'votes' }, ({ payload }) => useRooms.setState({ votesIn: { voted: payload.voted } }))
  .on('broadcast', { event: 'reveal' }, ({ payload }) => showReveal(payload))
  .subscribe();
```

**Bước 6: kết quả cho nghiên cứu.** Một view tổng hợp theo cặp mức: bao nhiêu phần trăm người nghe phân biệt được.

```sql
create view public.blind_results with (security_invoker = true) as
  select least(t.a_kbps, t.b_kbps) as low_kbps, greatest(t.a_kbps, t.b_kbps) as high_kbps, count(*) as votes,
         round(avg(case when v.correct then 1.0 when v.correct = false then 0.0 end), 3) as hit_rate,
         round(avg(case when v.choice = 'same' then 1.0 else 0.0 end), 3) as same_rate
    from public.blind_votes v join public.blind_trials t on t.id = v.trial_id
   where not t.is_control group by 1, 2;
```

`security_invoker = true` cho view chạy bằng quyền của người đọc, nên RLS của `blind_votes` vẫn áp dụng: người thường chỉ thấy số của mình, admin thấy tất cả.

### Kết quả

> 📷 Ảnh: phòng blind test lúc đang nghe B (nút A/B sáng theo đoạn đang phát), lúc bỏ phiếu, và lúc công bố (số phiếu, đáp án, bảng xếp hạng).

### Kiểm tra

```sql
select no, a_kbps, b_kbps, is_control, revealed from public.blind_trials order by a_at desc limit 5;
select * from public.blind_results;          -- hit_rate gần 0,5 nghĩa là gần như đoán bừa: mức cao có thể thừa
```

### Khi nào đổi

- **Muốn so nhiều hơn hai mức:** đổi `a_kbps`, `b_kbps` thành mảng và bỏ phiếu theo thứ hạng (MUSHRA).
- **Kết quả blind test lệch nhiều so với PSL:** dùng `blind_results` để chỉnh τ theo từng thể loại thay vì một số cho cả danh mục.
