// Lớp dữ liệu của app: mỗi hàm là một câu gọi Supabase. Không còn server API tự viết:
// đọc/ghi bảng đi thẳng qua API tự sinh (PostgREST), luật nằm trong RLS và hàm SQL.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createSteering } from 'hugo-stream';
import { supabase } from './supabase';
import type { StationInfo, BlindRoomInfo, AdminRoom, RoomRules } from '../rooms/types';
import type { Song, Playlist, Artist, User, RadioStation } from '../store/useStore';

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
function must<R extends { data: unknown; error: unknown }>({ data, error }: R): NonNullable<R['data']> {
  if (error) {
    const e = error as { message: string; status?: number; code?: string };
    throw Object.assign(new Error(e.message), { status: e.status, code: e.code });
  }
  return data as NonNullable<R['data']>;
}

// ---------- đăng nhập 1 chạm: mã 6 số qua email, Google, hoặc nghe thử với tư cách khách
export const auth = {
  /** Gửi mã 6 số. Email chưa có tài khoản thì Supabase tự tạo, nên đăng ký và đăng nhập là một. */
  sendCode: async (email: string) => must(await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })),
  verifyCode: async (email: string, code: string) => must(await supabase.auth.verifyOtp({ email, token: code, type: 'email' })),
  continueAsGuest: async () => must(await supabase.auth.signInAnonymously()),

  /** Mật khẩu là tùy chọn: ai muốn thì đặt qua "Quên mật khẩu" (mã 6 số gửi email), sau đó đăng nhập bằng email + mật khẩu. */
  signInWithPassword: async (email: string, password: string) => must(await supabase.auth.signInWithPassword({ email, password })),
  sendResetCode: async (email: string) => must(await supabase.auth.resetPasswordForEmail(email)),
  resetPassword: async (email: string, code: string, password: string) => {
    must(await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' }));
    must(await supabase.auth.updateUser({ password }));
  },

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
  const { data: p } = await supabase.rpc('my_profile'); // hồ sơ đầy đủ chỉ đọc được qua hàm này
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
// Vé nghe sống 2 giờ; giữ lại 30 phút để bấm phát lại hay tải trước bài kế không phải xin vé mới.
const tickets = new Map<string, { url: string; until: number }>();

export async function resolvePlayback(song: PlayableSong, quality: string): Promise<{ url: string; cdn: string }> {
  let ticket = tickets.get(song._id);
  if (!ticket || ticket.until < Date.now()) {
    const { data, error } = await supabase.functions.invoke('playback', { body: { song_id: song._id } });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      throw Object.assign(new Error(body?.reason === 'guest_limit' ? 'Khách nghe tối đa 3 bài mỗi ngày. Đăng nhập để nghe tiếp.' : error.message), {
        requiresLogin: body?.reason === 'guest_limit',
      });
    }
    ticket = { url: data.url, until: Date.now() + 30 * 60_000 };
    tickets.set(song._id, ticket);
  }
  const tier = quality === 'original' ? song.hlsTiers?.at(-1) : song.hlsTiers?.includes(quality) ? quality : null;
  return { url: tier ? `${ticket.url}&kbps=${tier}` : ticket.url, cdn: 'supabase' };
}

// Tên, mô tả, màu của một đài hay phòng blind test, đúng kiểu giao diện cần.
export const roomLook = (r: { id: number; name: string; tagline?: string | null; colors: string[] }) => ({
  id: String(r.id), name: r.name, tagline: r.tagline ?? undefined, colors: [r.colors[0], r.colors[1] ?? r.colors[0]] as [string, string],
});

// Danh sách phát kèm bài, đúng thứ tự người dùng sắp.
const PLAYLIST_COLUMNS = `id, name, description, items:playlist_songs(position, song:songs(${SONG_COLUMNS}))`;
const toPlaylist = (p: any): Playlist => ({
  _id: p.id, name: p.name, description: p.description,
  songs: (p.items ?? []).sort((a: any, b: any) => a.position - b.position).map((i: any) => toSong(i.song)),
});
const getPlaylist = async (id: string) => toPlaylist(must(await supabase.from('playlists').select(PLAYLIST_COLUMNS).eq('id', id).single()));

// Cột của bảng stations/blind_rooms từ dữ liệu form quản trị (chỉ ghi trường có trong form).
const roomRow = (f: Partial<AdminRoom>, kind = f.kind) => {
  const row: Record<string, unknown> = {
    name: f.name, tagline: f.tagline, colors: f.colors, active: f.active, rules: f.rules, pinned: f.pinned, sort_order: f.order,
    ...(kind === 'station' ? { allow_requests: f.allowRequests } : {}),
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
};
async function adminUserAction(action: 'disable' | 'enable' | 'delete', user_id: string) {
  return must(await supabase.functions.invoke('admin-users', { body: { action, user_id } }));
}

// Kiểm tra trước khi duyệt: bản quyền (giấy phép + nguồn) và chất lượng thông tin bài.
const tier = (issues: (string | false)[]) => { const list = issues.filter((x): x is string => !!x); return { pass: !list.length, issues: list }; };
export const toReviewed = (r: any) => ({
  ...toSong(r),
  review: {
    copyright: tier([!r.license && 'Thiếu giấy phép', !r.source_url && 'Thiếu nguồn bài gốc']),
    quality: tier([!r.cover_path && 'Chưa có ảnh bìa', !r.genre && 'Chưa có thể loại', r.status === 'failed' && `Xử lý lỗi: ${r.review_note ?? ''}`]),
  },
});

async function pipelineCounts() {
  const n = async (st: string) => (await supabase.from('pipeline_runs').select('id', { count: 'exact', head: true }).eq('status', st)).count ?? 0;
  const [queued, running, ok, failed] = await Promise.all(['queued', 'running', 'done', 'failed'].map(n));
  return { queued, running, ok, failed } as Record<string, number>;
}

type StageStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

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
  getTopSongs: async (days = 7, limit = 50, group?: string) => {
    const top = must(await supabase.rpc('top_songs', { p_days: days, p_limit: limit, p_group: group === 'all' ? undefined : group }));
    if (!top.length) return { top: [] };
    const rows = must(await supabase.from('songs').select(SONG_COLUMNS).in('id', top.map((t) => t.song_id)));
    const byId = new Map(rows.map((r) => [r.id, toSong(r)]));
    return {
      top: top.flatMap((t, i) => {
        const song = byId.get(t.song_id);
        return song ? [{ rank: i + 1, song, plays: t.plays, listeners: t.listeners, globalPlays: t.plays, score: t.plays }] : [];
      }),
    };
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
    must(await supabase.from('playlists').select(PLAYLIST_COLUMNS).order('updated_at', { ascending: false })).map(toPlaylist),
  createPlaylist: async (name: string, description = '') =>
    toPlaylist(must(await supabase.from('playlists').insert({ name, description }).select(PLAYLIST_COLUMNS).single())),
  updatePlaylist: async (id: string, fields: { name?: string; description?: string }) =>
    toPlaylist(must(await supabase.from('playlists').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select(PLAYLIST_COLUMNS).single())),
  deletePlaylist: async (id: string) => must(await supabase.from('playlists').delete().eq('id', id)),
  addSongsToPlaylist: async (id: string, songIds: string[]) => {
    const { count } = await supabase.from('playlist_songs').select('*', { count: 'exact', head: true }).eq('playlist_id', id);
    const rows = songIds.map((song_id, i) => ({ playlist_id: id, song_id, position: (count ?? 0) + i }));
    must(await supabase.from('playlist_songs').upsert(rows, { ignoreDuplicates: true }));
    return getPlaylist(id);
  },
  reorderPlaylist: async (id: string, songIds: string[]) =>
    must(await supabase.from('playlist_songs').upsert(songIds.map((song_id, position) => ({ playlist_id: id, song_id, position })))),
  removeSongFromPlaylist: async (id: string, songId: string) => {
    must(await supabase.from('playlist_songs').delete().eq('playlist_id', id).eq('song_id', songId));
    return getPlaylist(id);
  },

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
  deleteAccount: async () => must(await supabase.functions.invoke('delete-account', { method: 'POST' })),

  // đài 24/7
  getStations: async () => {
    const rows = must(await supabase.from('stations').select(`*, now:station_now(started_at, ends_at, song:songs(${SONG_COLUMNS}))`).order('sort_order'));
    return {
      stations: rows.map((s: any): StationInfo & { _id: string; slug: string } => ({
        ...roomLook(s), _id: String(s.id), slug: s.slug, allowRequests: s.allow_requests, rules: {}, listenerCount: 0,
        now: s.now?.song ? { ...toSong(s.now.song), startedAt: s.now.started_at, endsAt: s.now.ends_at } : null,
      })),
    };
  },
  requestSong: async (stationId: string, songId: string) =>
    must(await supabase.rpc('request_song', { p_station_id: Number(stationId), p_song_id: songId })),
  // Radio Internet: danh bạ mở radio-browser.info (miễn phí, có CORS). Chỉ lấy luồng https để web phát được.
  getRadioStations: async (country = 'VN'): Promise<RadioStation[]> => {
    const q = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '40', is_https: 'true' });
    const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${country}?${q}`);
    if (!res.ok) return [];
    return (await res.json()).map((r: any) => ({
      _id: r.stationuuid, name: r.name.trim(), streamUrl: r.url_resolved, country: r.country, countryCode: r.countrycode,
      genre: r.tags?.split(',')[0] ?? '', favicon: r.favicon || undefined, codec: r.codec, bitrate: r.bitrate, votes: r.votes,
    }));
  },

  getBlindRooms: async () => ({
    rooms: must(await supabase.from('blind_rooms').select('*').order('sort_order')).map((r): BlindRoomInfo => ({
      ...roomLook(r), trialNo: 0, listenerCount: 0,
    })),
  }),

  // ---------- admin
  getReviewQueue: async (status: 'pending' | 'published' | 'rejected') => {
    const songs = must(await supabase.from('songs').select(SONG_COLUMNS).eq('status', status).order('created_at', { ascending: false }).limit(200)).map(toReviewed);
    const counts = Object.fromEntries(await Promise.all((['pending', 'published', 'rejected'] as const).map(async (st) =>
      [st, (await supabase.from('songs').select('id', { count: 'exact', head: true }).eq('status', st)).count ?? 0])));
    return { songs, counts };
  },
  reviewSong: async (songId: string, decision: 'publish' | 'reject', note?: string) =>
    toSong(must(await supabase.rpc('review_song', { p_song_id: songId, p_decision: decision, p_note: note }))),
  deleteSong: async (songId: string) => must(await supabase.from('songs').delete().eq('id', songId)),
  updateSong: async (songId: string, f: Record<string, string>) =>
    must(await supabase.from('songs').update({ title: f.title, genre: f.genre, license: f.licenseType, source_url: f.sourceUrl, attribution: f.attribution }).eq('id', songId)),
  uploadSong: (form: FormData) => uploadSong(form),

  updateSongCover: async (songId: string, form: FormData) => {
    const cover = form.get('cover') as File;
    const path = `${songId}/cover-${Date.now()}.${cover.name.split('.').pop()}`;
    must(await supabase.storage.from('covers').upload(path, cover, { contentType: cover.type }));
    return toSong(must(await supabase.from('songs').update({ cover_path: path }).eq('id', songId).select(SONG_COLUMNS).single()));
  },

  // ---------- admin: phòng nghe (đài 24/7 và blind test). id có dạng "station:3" hoặc "blind:1".
  adminRooms: async () => must(await supabase.rpc('admin_rooms')) as unknown as { rooms: AdminRoom[]; genres: { key: string; label: string }[]; categories: string[] },
  previewRoomRules: async (rules: RoomRules) => must(await supabase.rpc('admin_room_preview', { p_rules: rules })) as unknown as { count: number; sample: string[] },
  createRoom: async (f: Partial<AdminRoom>) => {
    const slug = (f.name ?? 'room').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
    must(await supabase.from(f.kind === 'blind' ? 'blind_rooms' : 'stations').insert({ slug, ...roomRow(f) } as never));
  },
  updateRoom: async (id: string, f: Partial<AdminRoom>) => {
    const [kind, key] = id.split(':');
    must(await supabase.from(kind === 'blind' ? 'blind_rooms' : 'stations').update(roomRow(f, kind as AdminRoom['kind']) as never).eq('id', Number(key)));
  },
  deleteRoom: async (id: string) => {
    const [kind, key] = id.split(':');
    must(await supabase.from(kind === 'blind' ? 'blind_rooms' : 'stations').delete().eq('id', Number(key)));
  },
  roomLive: async (id: string) => {
    const key = Number(id.split(':')[1]);
    if (id.startsWith('blind:')) return { now: null, queue: [], listeners: [] };
    const now = (await supabase.from('station_now').select(`started_at, song:songs(${SONG_COLUMNS})`).eq('station_id', key).maybeSingle()).data as any;
    const queue = must(await supabase.from('station_requests').select(`id, votes, song:songs(${SONG_COLUMNS})`)
      .eq('station_id', key).is('played_at', null).order('votes', { ascending: false }));
    return {
      now: now?.song ? { song: toSong(now.song), startedAt: Date.parse(now.started_at) } : null,
      queue: queue.map((r: any) => ({ id: String(r.id), song: toSong(r.song), addedByName: r.votes >= 1_000_000 ? 'Admin' : '', votes: r.votes as number, priority: r.votes >= 1_000_000 })),
      listeners: [] as { userId: string; name: string }[], // ai đang nghe: Presence của kênh, admin không giữ ở database
    };
  },
  roomSuggestions: async (id: string, q: string) => {
    const songs = q ? await api.searchSongs(q) : must(await supabase.from('songs').select(SONG_COLUMNS).eq('status', 'published').order('likes_count', { ascending: false }).limit(30)).map(toSong);
    return { songs, matchedRules: false };
  },
  roomPinnedSongs: async (id: string) => {
    const [kind, key] = id.split(':');
    const room = must(await supabase.from(kind === 'blind' ? 'blind_rooms' : 'stations').select('pinned').eq('id', Number(key)).single());
    if (!room.pinned.length) return { songs: [] };
    const rows = must(await supabase.from('songs').select(SONG_COLUMNS).in('id', room.pinned)).map(toSong);
    return { songs: room.pinned.map((pid: string) => rows.find((r) => r._id === pid)).filter(Boolean) as Song[] };
  },
  roomSkip: async (id: string) => must(await supabase.rpc('admin_room_skip', { p_station_id: Number(id.split(':')[1]) })),
  roomEnqueue: async (id: string, songId: string) => must(await supabase.rpc('admin_room_enqueue', { p_station_id: Number(id.split(':')[1]), p_song_id: songId })),
  roomDequeue: async (_id: string, requestId: string) => must(await supabase.rpc('admin_room_dequeue', { p_request_id: Number(requestId) })),

  // Trang quản trị (chương 18): mọi lượt gọi vẫn đi qua RLS và hàm SQL tự kiểm is_admin().
  admin: {
    overview: async () => must(await supabase.rpc('admin_overview')) as any,
    songs: async ({ q = '', status = '', license = '', page = 1, limit = 30 }: Record<string, any>) => {
      let query = supabase.from('songs').select(SONG_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (status) query = query.eq('status', status);
      if (license) query = query.eq('license', license);
      if (q) query = query.ilike('search_text', `%${q}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return { total: count ?? 0, page, limit, songs: data.map((r) => ({ ...toReviewed(r), pipeline: null })) };
    },
    bulkSongs: async (ids: string[], action: 'publish' | 'reject', note?: string) => {
      const results = await Promise.allSettled(ids.map((id) => api.reviewSong(id, action, note)));
      const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [{ id: ids[i], reason: (r.reason as Error).message }] : []));
      return { done: ids.length - failed.length, failed };
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
        total: count ?? 0, page, limit, counts: await pipelineCounts(),
        runs: data.map((r: any) => ({
          id: String(r.id), status: r.status === 'done' ? 'ok' : r.status, startedAt: r.created_at, finishedAt: r.finished_at ?? undefined,
          trigger: 'review',
          stages: steps.map((job) => {
            const at = steps.indexOf(r.step ?? ''), me = steps.indexOf(job);
            const st: StageStatus = r.status === 'done' ? 'ok' : me < at ? 'ok' : me === at ? (r.status === 'failed' ? 'failed' : 'running') : 'pending';
            return { job, status: st, note: me === at && r.error ? r.error : '' };
          }),
          song: r.song ? { _id: r.song.id, title: r.song.title, artist: r.song.artist?.name ?? '', coverArt: coverUrl(r.song.cover_path) } : null,
        })),
      };
    },
    retryPipeline: (songId: string) => api.reviewSong(songId, 'publish'),
    artists: async ({ q = '', page = 1, limit = 30 }: Record<string, any>) => {
      let query = supabase.from('artist_stats').select('*', { count: 'exact' }).order('name').range((page - 1) * limit, page * limit - 1);
      if (q) query = query.ilike('name', `%${q}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return {
        total: count ?? 0, page, limit,
        artists: data.map((a: any) => ({ name: a.name, songs: a.songs, published: a.published, albums: a.albums, cover: coverUrl(a.cover_path), photo: a.photo_url, bio: a.bio, popularity: a.popularity })),
      };
    },
    updateArtist: async (f: { name: string; newName?: string; photo?: string; bio?: string }) => {
      must(await supabase.from('artists').update({ name: f.newName ?? f.name, photo_url: f.photo, bio: f.bio }).eq('name', f.name));
      return { renamedSongs: 0 }; // bài trỏ tới nghệ sĩ bằng id, đổi tên một chỗ là mọi bài đổi theo
    },
    albums: async ({ q = '', page = 1, limit = 30 }: Record<string, any>) => {
      const r = must(await supabase.rpc('admin_albums', { p_q: q, p_page: page, p_limit: limit })) as any;
      return { ...r, albums: r.albums.map((a: any) => ({ ...a, cover: coverUrl(a.cover) })) };
    },
    album: async (key: string) => {
      const [artistId, ...rest] = key.split(':');
      const songs = must(await supabase.from('songs').select(SONG_COLUMNS).eq('artist_id', Number(artistId)).eq('album_title', rest.join(':')).order('created_at')).map(toSong);
      return { title: rest.join(':'), artist: songs[0]?.artist ?? '', year: songs[0]?.album?.year, songs };
    },
    updateAlbum: async (key: string, f: { title: string; artist: string; year?: number }) =>
      must(await supabase.rpc('admin_update_album', { p_key: key, p_title: f.title, p_artist: f.artist, p_year: f.year })),
    users: async ({ q = '', role = '', status = '', page = 1, limit = 30 }: Record<string, any>) =>
      must(await supabase.rpc('admin_users', { p_q: q, p_role: role, p_status: status, p_page: page, p_limit: limit })) as any,
    user: async (id: string) => must(await supabase.rpc('admin_user', { p_id: id })) as any,
    setUserDisabled: (id: string, disabled: boolean) => adminUserAction(disabled ? 'disable' : 'enable', id),
    revokeSessions: async (id: string) => must(await supabase.rpc('admin_revoke_sessions', { p_id: id })),
    deleteUser: (id: string) => adminUserAction('delete', id),
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
