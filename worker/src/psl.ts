// PSL (Perceptual Saturation Ladder): chỉ dựng những mức bitrate mà tai người còn nghe ra khác biệt.
// Đo điểm MOS bằng ViSQOL (script Python), rồi áp quy tắc TAU bên dưới.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const CANDIDATES = [64, 96, 128, 160, 192, 256, 320];
export const TAU = 0.1; // lớn hơn nhiễu đo của ViSQOL (0,03–0,06 điểm)

/** Giữ mức thấp nhất; giữ mức tiếp theo chỉ khi hơn mức ĐÃ GIỮ gần nhất ít nhất TAU điểm. */
export function applyTau(mos: Record<number, number>, tau = TAU) {
  const tiers = Object.keys(mos).map(Number).sort((a, b) => a - b);
  const ladder = tiers.slice(0, 1);
  for (const k of tiers.slice(1)) if (mos[k] - mos[ladder.at(-1)!] >= tau) ladder.push(k);
  return ladder;
}

/** Chỉ xét mức thấp hơn bitrate nguồn: mã hóa lên cao hơn nguồn không thêm chất lượng. */
export const candidatesFor = (sourceKbps: number | null) => CANDIDATES.filter((k) => sourceKbps == null || k < sourceKbps);

export async function measurePsl(file: string, sourceKbps: number | null) {
  const tiers = candidatesFor(sourceKbps);
  const python = process.env.PSL_PYTHON;
  if (!python || tiers.length === 0) return { ladder: tiers.length ? [64, 128, 256].filter((k) => tiers.includes(k)) : [], mos: null };
  const { stdout } = await promisify(execFile)(python, ['analyzers/psl_measure.py', file, '--tiers', tiers.join(',')],
    { timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  const mos = JSON.parse(stdout).mos as Record<number, number>;
  return { ladder: applyTau(mos), mos };
}
