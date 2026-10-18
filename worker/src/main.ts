// Worker: lấy việc từ hàng đợi "media" (Supabase Queues), xử lý, ghi nhật ký vào pipeline_runs.
// Chạy: node src/main.ts  (Node 26 chạy thẳng TypeScript, không cần bước build)
import { db } from './supabase.ts';
import { processSong } from './process-song.ts';
import { scheduleCleanup } from './cleanup.ts';

const MAX_ATTEMPTS = 3;
const IDLE_MS = 5_000;
let running = true;
process.on('SIGTERM', () => (running = false)); // dừng nhẹ nhàng khi deploy bản mới
scheduleCleanup();

while (running) {
  // visibility 15 phút: nếu worker chết giữa chừng, việc tự hiện lại cho worker khác sau 15 phút
  const { data: messages, error } = await db.rpc('media_read', { p_count: 1, p_visibility_sec: 900 });
  if (error) { console.error('queue read failed', error.message); await sleep(IDLE_MS); continue; }
  if (!messages?.length) { await sleep(IDLE_MS); continue; }

  const msg = messages[0];
  const songId: string = msg.message.song_id;
  const run = await startRun(songId, msg.read_ct);
  try {
    const result = await processSong(songId, (step) => updateRun(run, { step }));
    await updateRun(run, { status: 'done', meta: result, finished_at: new Date().toISOString() });
    await db.rpc('media_archive', { p_msg_id: msg.msg_id });
    console.log(`✓ ${songId}`, result);
  } catch (e) {
    const message = (e as Error).message;
    console.error(`✗ ${songId}`, message);
    // Hết lượt thử: đánh dấu lỗi, rút khỏi hàng đợi. Chưa hết: để hết thời gian ẩn thì tự thử lại.
    if (msg.read_ct >= MAX_ATTEMPTS) {
      await updateRun(run, { status: 'failed', error: message, finished_at: new Date().toISOString() });
      await db.from('songs').update({ status: 'failed', review_note: message }).eq('id', songId);
      await db.rpc('media_archive', { p_msg_id: msg.msg_id });
    } else {
      await updateRun(run, { status: 'queued', error: message });
    }
  }
}

async function startRun(songId: string, attempts: number) {
  const { data } = await db.from('pipeline_runs').select('id').eq('song_id', songId)
    .order('created_at', { ascending: false }).limit(1).single();
  await db.from('pipeline_runs').update({ status: 'running', attempts }).eq('id', data!.id);
  return data!.id as number;
}

async function updateRun(id: number, fields: Record<string, unknown>) {
  await db.from('pipeline_runs').update(fields).eq('id', id);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
