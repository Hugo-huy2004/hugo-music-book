import type { Song } from '../store/useStore';

export interface AudioQualityInfo {
  tierName: 'Lossless' | 'High Quality' | 'Standard' | 'Data Saver';
  bitrateKbps: number;
  badgeLabel: string;
  codec: string;
  description: string;
  segmentIndex?: number;
  isHls: boolean;
}

// Nhãn chất lượng theo bitrate đang phát. AAC là định dạng nén có mất dữ liệu,
// nên chỉ file gốc FLAC mới được gọi là Lossless.
const TIERS: [minKbps: number, name: AudioQualityInfo['tierName'], description: string][] = [
  [256, 'High Quality', 'AAC chất lượng cao, khó phân biệt với bản gốc khi nghe bình thường.'],
  [128, 'Standard', 'Cân bằng giữa dung lượng và độ trong trẻo.'],
  [0, 'Data Saver', 'Tiết kiệm dữ liệu khi mạng yếu.'],
];

export function getAudioQualityInfo(options: {
  song?: Song | null;
  bitrate?: number | null;
  codec?: string | null;
  segmentIndex?: number | null;
  isHls?: boolean;
}): AudioQualityInfo {
  const { song, isHls = false, segmentIndex } = options;
  const raw = (options.codec || 'AAC').toUpperCase();
  const codec = raw.includes('FLAC') ? 'FLAC' : raw.includes('MP3') ? 'MP3' : 'AAC';

  // Ưu tiên bitrate trình phát đo được; chưa có thì lấy mức cao nhất của bài.
  const tiers = song?.hlsTiers ?? [];
  const kbps = options.bitrate || Number(tiers[tiers.length - 1]) || 128;

  const [, tierName, description] =
    codec === 'FLAC'
      ? ([0, 'Lossless', 'File gốc không nén, giữ nguyên dữ liệu âm thanh.'] as const)
      : TIERS.find(([min]) => kbps >= min)!;

  return {
    tierName,
    bitrateKbps: kbps,
    badgeLabel: `${tierName} · ${kbps} kbps`,
    codec,
    description,
    segmentIndex: segmentIndex ?? undefined,
    isHls,
  };
}
