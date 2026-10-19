import { supabase } from './supabase';

// chương 5, bước 6
function must<R extends { data: unknown; error: unknown }>({ data, error }: R): NonNullable<R['data']> {
  if (error) throw new Error((error as { message: string }).message);
  return data as NonNullable<R['data']>;
}

// chương 5, bước 4
export type Song = { _id: string; title: string; artist: string; coverArt?: string; duration: number; createdAt?: string; lyricsSource?: string };
export function toSong(r: any): Song {
  return {
    _id: r.id,
    title: r.title,
    artist: r.artist?.name ?? '',
    coverArt: r.cover_path ? supabase.storage.from('covers').getPublicUrl(r.cover_path).data.publicUrl : undefined,
    duration: Number(r.duration_sec) || 0,
    createdAt: r.published_at ?? r.created_at,
    lyricsSource: r.synced_lyrics || r.plain_lyrics ? 'db' : undefined,
  };
}

const SONG_COLUMNS = '*, artist:artists(name)';
export const api = {
  getSongs: async () =>
    must(await supabase.from('songs').select(SONG_COLUMNS).eq('status', 'published')
      .order('published_at', { ascending: false }).limit(500)).map(toSong),
};

// chương 6, bước 2
export const auth = {
  sendCode: async (email: string) => must(await supabase.auth.signInWithOtp({ email })),
  verifyCode: async (email: string, code: string) =>
    must(await supabase.auth.verifyOtp({ email, token: code, type: 'email' })),
  continueAsGuest: async () => must(await supabase.auth.signInAnonymously()),
  signOut: () => supabase.auth.signOut(),
};

// Ứng dụng 3, bước 1
export type User = { _id: string; email: string; nickname?: string; musicGenres: string[]; role: 'user' | 'admin'; isGuest: boolean };
export async function me(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const u = session.user;
  const { data: p } = await supabase.rpc('my_profile');
  return {
    _id: u.id, email: u.email ?? '', nickname: p?.nickname ?? undefined, musicGenres: p?.music_genres ?? [],
    role: u.app_metadata?.role === 'admin' ? 'admin' : 'user', isGuest: u.is_anonymous ?? false,
  };
}
