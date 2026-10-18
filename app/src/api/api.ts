// Lớp dữ liệu của app: mỗi hàm là một câu gọi Supabase. Không còn server API tự viết:
// đọc/ghi bảng đi thẳng qua API tự sinh (PostgREST), luật nằm trong RLS và hàm SQL.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createSteering } from 'hugo-stream';
import { supabase } from './supabase';
import type { Song, Playlist, Artist, User } from '../store/useStore';

export { supabase };
export const steering = createSteering(); // giữ để store ghi nhận số đo phát nhạc (một nguồn: Supabase CDN)

// ---------- chuyển dòng database (snake_case) sang kiểu app đang dùng
const SONG_COLUMNS = '*, artist:artists(name)';
const coverUrl = (path?: string | null) =>
  path ? supabase.storage.from('covers').getPublicUrl(path).data.publicUrl : undefined;

export function toSong(r: any): Song {
  return {
    _id: r.id,
    title: r.title,
    artist: r.artist?.name ?? '',
    coverArt: coverUrl(r.cover_path),
    coverColor: r.cover_color ?? undefined,
    duration: Number(r.duration_sec) || 0,
    genre: r.genre ?? undefined,
    category: r.genre ?? undefined,
    country: r.country ?? undefined,
    likesCount: r.likes_count,
    licenseType: r.license,
    licenseUrl: r.license_url ?? undefined,
    sourceUrl: r.source_url,
    attribution: r.attribution ?? undefined,
    hlsPath: r.hls_path ?? undefined,
    hlsTiers: (r.hls_tiers ?? []).map(String),
    album: r.album_title ? { sourceId: r.album_title, title: r.album_title, artist: r.artist?.name, year: r.album_year ?? undefined } : undefined,
    lyricsSource: r.synced_lyrics || r.plain_lyrics ? 'db' : undefined,
    status: r.status,
    reviewNote: r.review_note ?? undefined,
    createdAt: r.published_at ?? r.created_at,
  };
}

/** Lỗi Supabase -> lỗi JS có message dễ đọc; data trả về thẳng */
function must<T>({ data, error }: { data: T; error: any }): T {
  if (error) throw Object.assign(new Error(error.message), { status: error.status, code: error.code });
  return data;
}

// ---------- đăng nhập 1 chạm: mã 6 số qua email, Google, hoặc nghe thử với tư cách khách
export const auth = {
  /** Gửi mã 6 số. Email chưa có tài khoản thì Supabase tự tạo, nên đăng ký và đăng nhập là một. */
  sendCode: async (email: string) => must(await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })),
  verifyCode: async (email: string, code: string) => must(await supabase.auth.verifyOtp({ email, token: code, type: 'email' })),
  continueAsGuest: async () => must(await supabase.auth.signInAnonymously()),

  /** Google: web chuyển trang; iOS/Android mở trình duyệt hệ thống rồi quay lại app qua deep link. */
  signInWithGoogle: async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      must(await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));
      return false; // trang đang chuyển sang Google
    }
    const redirectTo = Linking.createURL('auth');
    const { url } = must(await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } }));
    const result = await WebBrowser.openAuthSessionAsync(url!, redirectTo);
    if (result.type !== 'success') return false;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) return false;
    must(await supabase.auth.exchangeCodeForSession(code));
    return true;
  },
  signOut: () => supabase.auth.signOut(),
};

/** Người dùng hiện tại = tài khoản Auth + hồ sơ trong public.profiles */
export async function me(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const u = session.user;
  const { data: p } = await supabase.from('profiles').select('*').eq('id', u.id).single();
  return {
    _id: u.id,
    username: p?.username ?? '',
    nickname: p?.nickname ?? undefined,
    email: u.email ?? '',
    avatarUrl: p?.avatar_url ?? undefined,
    musicGenres: p?.music_genres ?? [],
    role: u.app_metadata?.role === 'admin' ? 'admin' : 'user',
    googleLinked: u.app_metadata?.provider === 'google',
    isGuest: u.is_anonymous ?? false,
    token: session.access_token,
  } as User;
}

// ---------- phát nhạc
type PlayableSong = { _id: string; hlsTiers?: string[] };

/** Xin vé nghe (Edge Function kiểm lượt nghe của khách) -> URL playlist HLS. */
export async function resolvePlayback(song: PlayableSong, quality: string): Promise<{ url: string; cdn: string }> {
  const { data, error } = await supabase.functions.invoke('playback', { body: { song_id: song._id } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw Object.assign(new Error(body?.reason === 'guest_limit' ? 'Khách nghe tối đa 3 bài mỗi ngày. Đăng nhập để nghe tiếp.' : error.message), {
      requiresLogin: body?.reason === 'guest_limit',
    });
  }
  const tier = quality === 'original' ? song.hlsTiers?.at(-1) : song.hlsTiers?.includes(quality) ? quality : null;
  return { url: tier ? `${data.url}&kbps=${tier}` : data.url, cdn: 'supabase' };
}

// ---------- API theo tên cũ để màn hình không phải đổi
export const api = {
  me,
  getMeta: async () => must(await supabase.rpc('get_meta')),
  getSongs: async () =>
    must(await supabase.from('songs').select(SONG_COLUMNS).eq('status', 'published').order('published_at', { ascending: false }).limit(500)).map(toSong),
  searchSongs: async (q: string) => must(await supabase.rpc('search_songs', { q }).select(SONG_COLUMNS)).map(toSong),
  getArtists: async (): Promise<Artist[]> =>
    must(await supabase.from('artists').select('id, name, photo_url, bio')).map((a) => ({ _id: String(a.id), name: a.name, photo: a.photo_url ?? '', bio: a.bio })),
  getLyrics: async (songId: string) => {
    const s = must(await supabase.from('songs').select('plain_lyrics, synced_lyrics').eq('id', songId).single());
    return { hasLyrics: !!(s.synced_lyrics || s.plain_lyrics), plainLyrics: s.plain_lyrics, syncedLyrics: s.synced_lyrics };
  },
  getTopSongs: async (days = 7, limit = 50) => {
    const top = must(await supabase.rpc('top_songs', { p_days: days, p_limit: limit }));
    if (!top.length) return [];
    const rows = must(await supabase.from('songs').select(SONG_COLUMNS).in('id', top.map((t) => t.song_id)));
    const byId = new Map(rows.map((r) => [r.id, toSong(r)]));
    return top.flatMap((t) => (byId.has(t.song_id) ? [{ ...byId.get(t.song_id)!, plays: t.plays }] : []));
  },
  recordPlayback: async (p: Record<string, any>) => {
    await supabase.from('plays').insert({
      song_id: p.songId ?? p.song, platform: Platform.OS === 'web' ? 'web' : Platform.OS,
      tier_kbps: Number(p.tier) || null, startup_ms: p.startupMs, rebuffer_count: p.rebufferCount,
      played_ms: p.playedMs, completed: !!p.completed,
    });
  },

  // thích bài
  getLikedSongs: async () =>
    must(await supabase.from('song_likes').select(`created_at, song:songs(${SONG_COLUMNS})`).order('created_at', { ascending: false }))
      .map((r: any) => toSong(r.song)),
  toggleLike: async (songId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { count } = await supabase.from('song_likes').delete({ count: 'exact' }).eq('song_id', songId).eq('user_id', user!.id);
    if (!count) must(await supabase.from('song_likes').insert({ song_id: songId }));
    return { liked: !count };
  },

  // danh sách phát
  getPlaylists: async (): Promise<Playlist[]> =>
    must(await supabase.from('playlists').select(`id, name, description, items:playlist_songs(position, song:songs(${SONG_COLUMNS}))`).order('updated_at', { ascending: false }))
      .map((p: any) => ({
        _id: p.id, name: p.name, description: p.description,
        songs: p.items.sort((a: any, b: any) => a.position - b.position).map((i: any) => toSong(i.song)),
      })),
  createPlaylist: async (name: string, description = '') => must(await supabase.from('playlists').insert({ name, description }).select().single()),
  updatePlaylist: async (id: string, fields: { name?: string; description?: string }) =>
    must(await supabase.from('playlists').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)),
  deletePlaylist: async (id: string) => must(await supabase.from('playlists').delete().eq('id', id)),
  addSongsToPlaylist: async (id: string, songIds: string[]) => {
    const { count } = await supabase.from('playlist_songs').select('*', { count: 'exact', head: true }).eq('playlist_id', id);
    const rows = songIds.map((song_id, i) => ({ playlist_id: id, song_id, position: (count ?? 0) + i }));
    must(await supabase.from('playlist_songs').upsert(rows, { ignoreDuplicates: true }));
  },
  reorderPlaylist: async (id: string, songIds: string[]) =>
    must(await supabase.from('playlist_songs').upsert(songIds.map((song_id, position) => ({ playlist_id: id, song_id, position })))),
  removeSongFromPlaylist: async (id: string, songId: string) =>
    must(await supabase.from('playlist_songs').delete().eq('playlist_id', id).eq('song_id', songId)),

  // hồ sơ
  updateProfile: async (fields: { nickname?: string; musicGenres?: string[]; username?: string; country?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    must(await supabase.from('profiles').update({
      nickname: fields.nickname, username: fields.username, country: fields.country, music_genres: fields.musicGenres,
    }).eq('id', user!.id));
    return me();
  },
  updateAvatar: async (file: Blob) => {
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/avatar-${Date.now()}.webp`;
    must(await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/webp' }));
    const avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    must(await supabase.from('profiles').update({ avatar_url }).eq('id', user!.id));
    return me();
  },
  removeAvatar: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    must(await supabase.from('profiles').update({ avatar_url: null }).eq('id', user!.id));
    return me();
  },
  deleteAccount: async () => must(await supabase.rpc('delete_my_account')),

  // đài 24/7
  getStations: async () => {
    const rows = must(await supabase.from('stations').select(`*, now:station_now(started_at, ends_at, song:songs(${SONG_COLUMNS}))`).order('sort_order'));
    return {
      stations: rows.map((s: any) => ({
        _id: String(s.id), id: String(s.id), slug: s.slug, name: s.name, tagline: s.tagline, colors: s.colors,
        allowRequests: s.allow_requests,
        now: s.now?.song ? { ...toSong(s.now.song), startedAt: s.now.started_at, endsAt: s.now.ends_at } : null,
      })),
    };
  },
  requestSong: async (stationId: string, songId: string) =>
    must(await supabase.rpc('request_song', { p_station_id: Number(stationId), p_song_id: songId })),
  getRadioStations: async () => [],

  getBlindRooms: async () => ({
    rooms: must(await supabase.from('blind_rooms').select('*').order('sort_order')).map((r: any) => ({
      id: String(r.id), name: r.name, tagline: r.tagline, colors: r.colors, trialNo: 0, listenerCount: 0,
    })),
  }),

  // ---------- admin
  getReviewQueue: async (status: 'pending' | 'published' | 'rejected') =>
    must(await supabase.from('songs').select(SONG_COLUMNS).eq('status', status).order('created_at', { ascending: false }).limit(200)).map(toSong),
  reviewSong: async (songId: string, decision: 'publish' | 'reject', note?: string) =>
    toSong(must(await supabase.rpc('review_song', { p_song_id: songId, p_decision: decision, p_note: note ?? null }))),
  deleteSong: async (songId: string) => must(await supabase.from('songs').delete().eq('id', songId)),
  updateSong: async (songId: string, f: Record<string, string>) =>
    must(await supabase.from('songs').update({ title: f.title, genre: f.genre, license: f.licenseType, source_url: f.sourceUrl, attribution: f.attribution }).eq('id', songId)),
  uploadSong: (form: FormData) => uploadSong(form),

  // Trang quản trị (chương 17): mọi lượt gọi vẫn đi qua RLS và hàm SQL tự kiểm is_admin().
  admin: {
    overview: async () => must(await supabase.rpc('admin_overview')),
    songs: async ({ q = '', status = '', page = 1, limit = 30 }: Record<string, any>) => {
      let query = supabase.from('songs').select(SONG_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (status) query = query.eq('status', status);
      if (q) query = query.ilike('title', `%${q}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { total: count ?? 0, page, limit, songs: data.map((r) => ({ ...toSong(r), pipeline: null })) };
    },
    bulkSongs: async (ids: string[], action: 'publish' | 'reject', note?: string) => {
      const results = await Promise.allSettled(ids.map((id) => api.reviewSong(id, action, note)));
      return { updated: results.filter((r) => r.status === 'fulfilled').length };
    },
    pipeline: async ({ status = '', page = 1, limit = 20 }: Record<string, any>) => {
      const map: Record<string, string> = { ok: 'done' };
      let query = supabase.from('pipeline_runs')
        .select('id, status, step, error, created_at, finished_at, song:songs(id, title, cover_path, artist:artists(name))', { count: 'exact' })
        .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
      if (status) query = query.eq('status', map[status] ?? status);
      const { data, count, error } = await query;
      if (error) throw error;
      const steps = ['download', 'analyze', 'psl', 'hls'];
      return {
        total: count ?? 0, page, limit, counts: {},
        runs: data.map((r: any) => ({
          id: String(r.id), status: r.status === 'done' ? 'ok' : r.status, startedAt: r.created_at, finishedAt: r.finished_at ?? undefined,
          trigger: 'review',
          stages: steps.map((job) => {
            const at = steps.indexOf(r.step ?? ''), me = steps.indexOf(job);
            const st = r.status === 'done' ? 'ok' : me < at ? 'ok' : me === at ? (r.status === 'failed' ? 'failed' : 'running') : 'pending';
            return { job, status: st, note: me === at && r.error ? r.error : '' };
          }),
          song: r.song ? { _id: r.song.id, title: r.song.title, artist: r.song.artist?.name ?? '', coverArt: coverUrl(r.song.cover_path) } : null,
        })),
      };
    },
    retryPipeline: (songId: string) => api.reviewSong(songId, 'publish'),
    artists: async () => ({ artists: must(await supabase.from('artists').select('*').order('name')), total: 0 }),
    updateArtist: async (f: { name: string; newName?: string; photo?: string; bio?: string }) =>
      must(await supabase.from('artists').update({ name: f.newName ?? f.name, photo_url: f.photo, bio: f.bio }).eq('name', f.name)),
    albums: async () => ({ albums: [], total: 0 }),
    album: async () => null,
    updateAlbum: async () => null,
    users: async () => ({ users: [], total: 0 }),
    user: async () => null,
    setUserDisabled: async () => null,
    revokeSessions: async () => null,
    deleteUser: async () => null,
  },
};

/** Admin tải bài lên: file đi thẳng từ máy lên Storage, rồi tạo dòng songs ở trạng thái chờ duyệt. */
async function uploadSong(form: FormData) {
  const file = form.get('audio') as File;
  const cover = form.get('cover') as File | null;
  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp3';
  must(await supabase.storage.from('originals').upload(`${id}/original.${ext}`, file, { contentType: file.type }));
  let cover_path: string | null = null;
  if (cover) {
    cover_path = `${id}/cover.${cover.name.split('.').pop()}`;
    must(await supabase.storage.from('covers').upload(cover_path, cover, { contentType: cover.type }));
  }
  const artist = must(await supabase.rpc('ensure_artist', { p_name: String(form.get('artist')) }));
  return toSong(must(await supabase.from('songs').insert({
    id, title: String(form.get('title')), artist_id: artist, genre: (form.get('genre') as string) || null,
    license: String(form.get('licenseType')), source_url: String(form.get('sourceUrl')),
    attribution: (form.get('attribution') as string) || null, original_path: `${id}/original.${ext}`, cover_path,
  }).select(SONG_COLUMNS).single()));
}
