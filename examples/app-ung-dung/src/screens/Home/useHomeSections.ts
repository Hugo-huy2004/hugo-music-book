import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import type { Song } from '../../api/api';

export function useHomeSections(rowCount: number) {
  const songs = useStore((s) => s.songs);
  return useMemo(() => {
    const newest = [...songs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    const byArtist = new Map<string, Song>();
    for (const s of newest) if (!byArtist.has(s.artist)) byArtist.set(s.artist, s);
    return { newReleases: newest.slice(0, rowCount), artists: [...byArtist.values()].slice(0, rowCount) };
  }, [songs, rowCount]);
}
