// Xử lý một bài từ file gốc tới HLS: tải về -> đo -> PSL -> mã hóa từng mức -> tải lên -> phát hành.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from './supabase.ts';
import { encodeTier, loudness, probe } from './ffmpeg.ts';
import { measurePsl } from './psl.ts';

export async function processSong(songId: string, log: (step: string) => Promise<void>) {
  const { data: song, error } = await db.from('songs').select('id, original_path').eq('id', songId).single();
  if (error) throw error;
  const dir = await mkdtemp(join(tmpdir(), 'hugo-'));
  try {
    await log('download');
    const { data: blob, error: e1 } = await db.storage.from('originals').download(song.original_path);
    if (e1) throw e1;
    const src = join(dir, 'original');
    await writeFile(src, Buffer.from(await blob.arrayBuffer()));

    await log('analyze');
    const { durationSec, sourceKbps } = await probe(src);
    const lufs = await loudness(src);

    await log('psl');
    const { ladder, mos } = await measurePsl(src, sourceKbps);

    await log('hls');
    for (const kbps of ladder) {
      for (const name of await encodeTier(src, dir, kbps)) {
        const { error: e2 } = await db.storage.from('audio').upload(`${songId}/${name}`, await readFile(join(dir, name)), {
          contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'audio/mp4',
          upsert: true,
        });
        if (e2) throw e2;
      }
    }

    const { error: e3 } = await db.from('songs').update({
      duration_sec: durationSec, loudness_lufs: lufs, hls_path: `${songId}/`, hls_tiers: ladder, psl_mos: mos,
      status: 'published', published_at: new Date().toISOString(),
    }).eq('id', songId);
    if (e3) throw e3;
    return { durationSec, sourceKbps, ladder };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
