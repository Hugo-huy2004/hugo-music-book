// Gọi ffmpeg/ffprobe như chương trình ngoài: phần nặng chạy ở tiến trình khác, event loop của Node không bị chặn.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MB = 64 * 1024 * 1024;

/** Thời lượng (giây) và bitrate nguồn (kbps) */
export async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-of', 'json',
    '-show_entries', 'stream=bit_rate:format=duration,bit_rate', file], { maxBuffer: MB });
  const info = JSON.parse(stdout);
  const bps = info.streams?.[0]?.bit_rate ?? info.format?.bit_rate;
  return { durationSec: Number(info.format.duration), sourceKbps: bps ? Math.round(bps / 1000) : null };
}

/** Độ to tích hợp (LUFS, chuẩn EBU R128): app dùng để cân âm lượng giữa các bài */
export async function loudness(file: string) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { maxBuffer: MB });
  return Number(JSON.parse(stderr.slice(stderr.lastIndexOf('{'))).input_i);
}

/** Một mức HLS = một file .mp4 (fMP4) + playlist trỏ vào các đoạn byte của file đó */
export async function encodeTier(src: string, outDir: string, kbps: number) {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-map', '0:a:0', '-ac', '2',
    '-c:a', 'aac', '-b:a', `${kbps}k`,
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4', '-hls_flags', 'single_file',
    '-hls_segment_filename', `${outDir}/${kbps}.mp4`, `${outDir}/${kbps}.m3u8`], { maxBuffer: MB });
  return [`${kbps}.mp4`, `${kbps}.m3u8`];
}
