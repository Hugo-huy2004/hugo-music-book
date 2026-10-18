/**
 * =============================================================================
 * APP STORE (Global State Management — Zustand)
 * =============================================================================
 * WHAT IT DOES:
 *    - Manages global state across the entire Hugo Music application:
 *        + Player state: currentSong, isPlaying, volume, progress, queue.
 *        + User state: user, token, likedSongIds (favorites list).
 *        + DJ & Sound state: djAutoplay, equalizerPreset, transitionPlan (Deck A/B).
 *        + UI state: activeTab, isLoginModalVisible, liveRoom.
 * 
 * WHO CALLS THIS FILE:
 *    - All UI screens: `HomeScreen`, `PlayerScreen`, `AccountScreen`, `LoginModal`, etc.
 * 
 * WHAT THIS FILE CALLS:
 *    - `../audio/audioEngine.ts`: Controls real audio playback.
 *    - `../audio/smartTransition.ts`: BPM matching for DJ Autoplay.
 *    - `../api/api.ts`: Sends HTTP requests to backend API.
 * =============================================================================
 */

import { serverNow, syncClock } from '../rooms/serverClock';
import { startAligned, alignTo, releaseRate, SYNC } from '../audio/timelineSync';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioEngine } from '../audio/audioEngine';
import { api, auth, me, supabase, resolvePlayback, resolveOfflineUrl, steering } from '../api/api';
import { joinSyncChannel, leaveSyncChannel as leaveWorkspace, sendSyncState as sendWorkspaceState } from '../rooms/workspace';
import { prefetchNext } from '../audio/prefetch';
import { offlineManager } from '../audio/offlineManager';
import { Platform } from 'react-native';
import { getStationCover } from '../lib/radioArtwork';
import { shuffled } from '../lib/shuffle';
import { planTransition, gainFor, startOf, TransitionInfo, TransitionMode, TrackInfo } from '../audio/transitionPlan';
import { findBestDJNextSong, EqualizerPreset, EQ_PRESETS } from '../audio/smartTransition';
import type { PlaybackStatus, PlaybackTelemetry } from '../audio/audioEngine';

// Collect playback telemetry and send to server.
// Only send when audio was actually playing to avoid measuring aborted loads.
// Current CDN playing (utils/cdnSteering.ts): report playback performance and errors per CDN.
let playingCdn = 'origin';
let preparedCdn = 'origin';
let playingSince = 0; // Timestamp when current song loaded — helps distinguish CDN failure from expired token

function flushPlaybackTelemetry(song: Song | null, taken?: PlaybackTelemetry | null, cdn = playingCdn) {
  if (!song) return;
  const t = taken === undefined ? audioEngine.takeTelemetry() : taken;
  if (!t || (!t.startupMs && !t.playedMs)) return;
  api.recordPlayback({
    songId: song._id,
    startupMs: t.startupMs,
    rebufferCount: t.rebufferCount,
    rebufferMs: t.rebufferMs,
    playedMs: t.playedMs,
    completed: t.completed,
    platform: Platform.OS,
    cdn,
  });
}

// Current active live room (24/7 radio or blind listening room, see src/rooms/).
// In a room, the server controls playback sync so seek and skip buttons are locked.
export type LiveRoom = { kind: 'station' | 'blind'; id: string; name: string };
// src/rooms/ registers hooks here (store avoids importing src/rooms/ to prevent circular dependencies).
export const liveRoomHooks: { resume?: () => void } = {};

export interface UserAddress {
  country?: string;
  province?: string;
  ward?: string;
  detail?: string;
}

export interface User {
  _id: string;
  username: string;
  nickname?: string;
  email: string;
  emailVerified?: boolean;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  musicGenres?: string[];
  address?: UserAddress;
  role: string; // 'user' | 'admin' — only 'admin' can manage the song catalog
  googleLinked: boolean; // true = signed in via Google
  isGuest?: boolean; // khách ẩn danh (signInAnonymously)
  hasPassword?: boolean; // đã tự đặt mật khẩu (mật khẩu là tùy chọn, chương 6)
  token: string;
}

// A device's private, always-the-same-two-people room: `workspace:<userId>`. Any
// device signed into this account that turns Workspace sync on joins this exact room,
// so they all mirror the same song/position/play-state — no PIN to share, no "party"
// to invite strangers to. See utils/socket.ts + apps/server/src/index.js for the room protocol
// this reuses (same play_sync/sync_playback/room_state events as Sync Party).

export interface Song {
  _id: string;
  title: string;
  artist: string;
  filePath?: string;
  coverArt?: string;
  duration?: number;
  category?: string;
  genre?: string;
  country?: string;
  likesCount?: number;
  // License information — required when admin uploads a song (songReview.js).
  // Shown under song title — CC and Public Domain licenses require attribution.
  licenseType?: string;
  licenseUrl?: string;
  hlsPath?: string;
  hlsTiers?: string[];
  // Transition data for gapless and crossfade playback (transition_analyze.py).
  transition?: TransitionInfo;
  // Album metadata and dominant cover color (ReleaseJob.js).
  album?: { sourceId: string; title: string; artist?: string; year?: number; trackCount?: number; trackNo?: number; description?: string };
  coverColor?: string;
  lyricsSource?: string; // 'id3' | 'lrclib' when song has lyrics
  uploadedBy?: string;
  // Catalog management fields (admin only).
  status?: 'pending' | 'published' | 'rejected';
  sourceUrl?: string;
  attribution?: string;
  reviewNote?: string;
  createdAt?: string;
}

export interface Playlist {
  _id: string;
  name: string;
  description?: string;
  songs: Song[];
}

// A real Wikipedia-sourced artist photo (see apps/server/src/modules/artists/Artist.js) — only exists
// for artists a confident match was found for; most netlabel/indie acts have none.
export interface Artist {
  _id: string;
  name: string;
  photo: string;
  bio?: string;
  sourceUrl?: string;
}

// A real, currently-live third-party broadcast (see apps/server/src/modules/radio/RadioStation.js) —
// not a Song: no duration, no seeking, sourced from radio-browser.info rather than
// this app's own catalog.
export interface RadioStation {
  _id: string;
  name: string;
  streamUrl: string;
  country?: string;
  countryCode?: string;
  genre?: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
}

// The post represents a real radio station playing (playLiveRadio): there is no broadcast token.
const isLiveRadio = (s: Song) => s._id.startsWith('radio-');

interface StoreState {
  // --- auth ---
  user: User | null;
  isLoginModalVisible: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  // Set when login() gets { requiresOtp: true } back (admin accounts) — the caller
  // should show an OTP entry step and call verifyOtp() with what the user types in.
  pendingOtpToken: string | null;
  setLoginModalVisible: (visible: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  startPasswordlessLogin: (email: string) => Promise<{ tempToken: string; email: string }>;
  loginPasswordless: (tempToken: string, code: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  // true = logged in, false = user closes Google window (web: page is switching to Google).
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  deleteAccount: (confirm: { password?: string; confirm?: string }) => Promise<void>;
  removeAvatar: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (fields: { nickname?: string; phone?: string; musicGenres?: string[]; dateOfBirth?: string; address?: { country?: string; province?: string; ward?: string; detail?: string } }) => Promise<void>;
  completeProfile: (fields: {
    nickname?: string;
    dateOfBirth?: string;
    musicGenres?: string[];
    country?: string;
    province?: string;
    ward?: string;
    addressDetail?: string;
  }) => Promise<void>;
  updateAvatar: (file: File | Blob) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;

  // --- registration wizard (step -> step) ---
  registrationEmail: string | null;
  registrationOtpToken: string | null; // proves the OTP was sent for this email
  registrationVerifiedToken: string | null; // proves the OTP was actually confirmed
  sendRegistrationOtp: (email: string) => Promise<void>;
  verifyRegistrationOtp: (code: string) => Promise<void>;
  completeRegistration: (form: FormData) => Promise<void>;
  resetRegistration: () => void;

  // --- song library ---
  songs: Song[];
  isLoadingSongs: boolean;
  fetchSongs: () => Promise<void>;
  likedSongIds: string[];
  likedSongs: Song[];
  fetchLikedSongs: () => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;

  // --- playlists ---
  playlists: Playlist[];
  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<void>;
  updatePlaylist: (id: string, fields: { name?: string; description?: string }) => Promise<void>;
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  reorderPlaylistSongs: (playlistId: string, songIds: string[]) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;

  // --- playback ---
  queue: Song[];
  queueIndex: number;
  currentSong: Song | null;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  playbackBitrate: number | null;
  playbackCodec: string | null;
  playbackSegment: number | null;
  isHlsStream: boolean;
  // 'auto' = ABR changes automatically according to network | 'low'/'mid'/'high' = single level lock
  // | 'original' = original file, not through HLS
  audioQuality: string;
  playSong: (song: Song, queue?: Song[], startAtSeconds?: number) => Promise<void>;
  playOrToggleSong: (song: Song, queue?: Song[]) => Promise<void>;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
  next: () => void;
  prev: () => void;
  // Shuffle/repeat like Apple Music. originalQueue holds the original order to turn off mixing then returns.
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  originalQueue: Song[];
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  shufflePlay: (list: Song[]) => Promise<void>;
  onTrackFinished: () => void;
  // Seamless transition (utils/audio/transitionPlan.ts): transition type, crossfade length, volume balance.
  transitionMode: TransitionMode;
  crossfadeSeconds: number;
  soundCheck: boolean;
  djAutoplay: boolean;
  equalizerPreset: EqualizerPreset;
  setTransitionMode: (mode: TransitionMode) => void;
  setCrossfadeSeconds: (s: number) => void;
  setSoundCheck: (on: boolean) => void;
  setDjAutoplay: (on: boolean) => void;
  setEqualizerPreset: (preset: EqualizerPreset) => void;
  // Record that the next song has been transferred by the transmitter (after crossfade) — do not reload.
  commitAdvance: (song: Song) => void;

  // --- real live radio (see apps/server/src/modules/radio/RadioStation.js) ---
  radioStations: RadioStation[];
  fetchRadioStations: (country?: string) => Promise<void>;
  playLiveRadio: (station: RadioStation) => Promise<void>;

  // --- real artist photos (see apps/server/src/modules/artists/Artist.js) — only populated for
  // artists a confident Wikipedia match was found for; absent for most netlabel acts.
  artists: Artist[];
  fetchArtists: () => Promise<void>;

  liveRoom: LiveRoom | null;

  // --- nhóm nghe chung (chương 15): chủ nhóm điều khiển, thành viên phát theo
  group: { id: string; code: string; name: string; hostId: string } | null;
  groupMembers: { name?: string }[];
  createGroup: (name: string) => Promise<void>;
  joinGroup: (code: string) => Promise<void>;
  leaveGroup: () => Promise<void>;

  // --- workspace (personal multi-device sync, see workspaceRoomId above) ---
  workspaceEnabled: boolean;
  workspaceMemberCount: number;
  toggleWorkspaceSync: () => void;

  // --- theme ---
  themeMode: 'auto' | 'dark' | 'light';
  setThemeMode: (mode: 'auto' | 'dark' | 'light') => void;

  // --- offline & cache ---
  offlineSongIds: string[];
  offlineSongs: Song[];
  loadOfflineSongs: () => Promise<void>;
  downloadSongOffline: (song: Song) => Promise<void>;
  removeSongOffline: (songId: string) => Promise<void>;

  // --- play history ---
  historySongs: Song[];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // Supabase giữ phiên (lưu, tự gia hạn token). Store chỉ nghe sự kiện và nạp hồ sơ.
      const completeSession = async () => {
        const user = await me();
        if (!user) return;
        set({ user, isAuthLoading: false, isLoginModalVisible: false, pendingOtpToken: null });
        if (!user.isGuest) {
          get().fetchPlaylists();
          get().fetchLikedSongs();
        }
        // Khách vừa hết lượt nghe rồi đăng nhập: phát tiếp đúng bài đang dở.
        const { currentSong, queue } = get();
        if (currentSong && !isLiveRadio(currentSong) && !audioEngine.hasSound()) get().playSong(currentSong, queue);
      };
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(completeSession); // không gọi API ngay trong callback
        if (event === 'SIGNED_OUT') set({ user: null, playlists: [], likedSongIds: [], likedSongs: [] });
      });
      // Không có phiên nào: vào thẳng với tư cách khách ẩn danh để nghe thử (giới hạn 3 bài/ngày).
      supabase.auth.getSession().then(({ data }) => { if (!data.session) auth.continueAsGuest().catch(() => {}); });

      const withAuthState = async <T,>(fn: () => Promise<T>) => {
        set({ isAuthLoading: true, authError: null });
        try {
          const r = await fn();
          set({ isAuthLoading: false });
          return r;
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      };

      return {
      // --- auth ---
      user: null,
      isLoginModalVisible: false,
      isAuthLoading: false,
      authError: null,
      pendingOtpToken: null,
      setLoginModalVisible: (visible) => set({ isLoginModalVisible: visible, authError: null }),
      login: (email, password) => withAuthState(async () => { await auth.signInWithPassword(email, password); }),
      verifyOtp: async () => {},
      // Đăng nhập 1 chạm: nhập email -> nhận mã 6 số -> xong. Email mới thì Supabase tự tạo tài khoản.
      startPasswordlessLogin: (email) => withAuthState(async () => { await auth.sendCode(email); return { tempToken: email, email }; }),
      loginPasswordless: (email, code) => withAuthState(async () => { await auth.verifyCode(email, code); }),
      loginWithGoogle: () => withAuthState(() => auth.signInWithGoogle()),
      registrationEmail: null,
      registrationOtpToken: null,
      registrationVerifiedToken: null,
      sendRegistrationOtp: (email) => withAuthState(async () => { await auth.sendCode(email); set({ registrationEmail: email, registrationOtpToken: email }); }),
      verifyRegistrationOtp: (code) => withAuthState(async () => {
        await auth.verifyCode(get().registrationEmail!, code);
        set({ registrationVerifiedToken: 'ok' });
      }),
      completeRegistration: async (form) => {
        const text = (k: string) => (form.get(k) as string | null)?.trim() || undefined;
        const password = text('password');
        if (password) await auth.changePassword('', password); // tài khoản mới: chưa có mật khẩu cũ
        await get().completeProfile({
          nickname: text('nickname'), dateOfBirth: text('dateOfBirth'), musicGenres: JSON.parse(text('musicGenres') ?? '[]'),
          country: text('country'), province: text('province'), ward: text('ward'), addressDetail: text('addressDetail'),
        });
        const avatar = form.get('avatar') as Blob | null;
        if (avatar) await get().updateAvatar(avatar);
        get().resetRegistration();
      },
      resetRegistration: () => set({ registrationEmail: null, registrationOtpToken: null, registrationVerifiedToken: null }),
      logout: () => {
        const { user, workspaceEnabled } = get();
        if (user && workspaceEnabled) leaveWorkspace();
        set({ workspaceEnabled: false, workspaceMemberCount: 0, pendingOtpToken: null });
        auth.signOut().then(() => auth.continueAsGuest().catch(() => {}));
      },
      deleteAccount: async () => {
        await api.deleteAccount();
        get().logout();
      },
      removeAvatar: async () => {
        const current = get().user;
        if (!current) return;
        const updated = await api.removeAvatar();
        set({ user: { ...current, ...updated } });
      },
      // Re-pulls the user record from the server (username/email/role) —
      // the persisted `user` only reflects what was true at login time, so anything
      // changed server-side since (e.g. an admin promotion) needs this to show up
      // without forcing a logout/login cycle.
      refreshUser: async () => {
        const current = get().user;
        if (!current) return;
        try {
          const fresh = await api.me();
          set({ user: { ...current, ...fresh } });
        } catch (e) {
          console.warn('refreshUser failed', e);
        }
      },
      updateProfile: async (fields) => {
        const current = get().user;
        if (!current) return;
        const updated = await api.updateProfile(fields);
        set({ user: { ...current, ...updated } });
      },
      completeProfile: async (fields) => {
        const updated = await api.updateProfile({
          nickname: fields.nickname, musicGenres: fields.musicGenres, dateOfBirth: fields.dateOfBirth,
          address: { country: fields.country, province: fields.province, ward: fields.ward, detail: fields.addressDetail },
        });
        if (updated) set({ user: updated });
      },
      updateAvatar: async (file) => {
        const updated = await api.updateAvatar(file);
        if (updated) set({ user: updated });
      },
      changePassword: (current, next) => withAuthState(() => auth.changePassword(current, next)),
      resetPassword: (email, code, newPassword) => withAuthState(() => auth.resetPassword(email, code, newPassword)),

      // --- song library ---
      songs: [],
      isLoadingSongs: false,
      fetchSongs: async () => {
        set({ isLoadingSongs: true });
        try {
          const songs = await api.getSongs();
          // Keep local history fresh by replacing cached songs with latest server copies.
          // Filtering by ID alone is not enough because fields might have changed on server
          // (such as license, tags, or cover art).
          const liveById = new Map(songs.map((s: Song) => [s._id, s]));
          const history = (get().historySongs || [])
            .map((h) => liveById.get(h._id))
            .filter(Boolean) as Song[];
          set({ songs, historySongs: history, isLoadingSongs: false });
        } catch (e) {
          console.warn('fetchSongs failed', e);
          set({ isLoadingSongs: false });
        }
      },
      likedSongIds: [],
      likedSongs: [],
      fetchLikedSongs: async () => {
        if (!get().user) return;
        try {
          const likedSongs = await api.getLikedSongs();
          set({ likedSongs, likedSongIds: likedSongs.map((s: Song) => s._id) });
        } catch (e) {
          console.warn('fetchLikedSongs failed', e);
        }
      },
      toggleLike: async (songId) => {
        if (!get().user) {
          set({ isLoginModalVisible: true });
          return;
        }
        try {
          const { liked } = await api.toggleLike(songId);
          set((state) => ({
            likedSongIds: liked
              ? [...state.likedSongIds, songId]
              : state.likedSongIds.filter((id) => id !== songId),
            likedSongs: liked
              ? state.likedSongs
              : state.likedSongs.filter((s) => s._id !== songId),
          }));
          if (liked) get().fetchLikedSongs(); // pull the full song object for the new favorite
        } catch (e) {
          console.warn('toggleLike failed', e);
        }
      },

      // --- playlists ---
      playlists: [],
      fetchPlaylists: async () => {
        if (!get().user) return;
        try {
          const playlists = await api.getPlaylists();
          set({ playlists });
        } catch (e) {
          console.warn('fetchPlaylists failed', e);
        }
      },
      createPlaylist: async (name, description = '') => {
        const playlist = await api.createPlaylist(name, description);
        set((state) => ({ playlists: [playlist, ...state.playlists] }));
      },
      updatePlaylist: async (id, fields) => {
        const updated = await api.updatePlaylist(id, fields);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === id ? updated : p)) }));
      },
      addSongsToPlaylist: async (playlistId, songIds) => {
        const updated = await api.addSongsToPlaylist(playlistId, songIds);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === playlistId ? updated : p)) }));
      },
      // Reorder playlist: update local UI optimistically first, then sync with server.
      reorderPlaylistSongs: async (playlistId, songIds) => {
        const before = get().playlists;
        const pl = before.find((p) => p._id === playlistId);
        if (!pl) return;
        const byId = new Map(pl.songs.map((x) => [x._id, x]));
        set({ playlists: before.map((p) => (p._id === playlistId ? { ...p, songs: songIds.map((id) => byId.get(id)!).filter(Boolean) } : p)) });
        try {
          await api.reorderPlaylist(playlistId, songIds);
        } catch (e) {
          set({ playlists: before });
          throw e;
        }
      },
      deletePlaylist: async (id) => {
        await api.deletePlaylist(id);
        set((state) => ({ playlists: state.playlists.filter((p) => p._id !== id) }));
      },
      addSongToPlaylist: async (playlistId, songId) => get().addSongsToPlaylist(playlistId, [songId]),
      removeSongFromPlaylist: async (playlistId, songId) => {
        const updated = await api.removeSongFromPlaylist(playlistId, songId);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === playlistId ? updated : p)) }));
      },

      // --- playback ---
      queue: [],
      queueIndex: 0,
      currentSong: null,
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      playbackBitrate: null,
      playbackCodec: null,
      playbackSegment: null,
      isHlsStream: false,
      audioQuality: 'auto',
      playSong: async (song, queue = [song], startAtSeconds) => {
        // If shuffle is active and playing from a NEW list: shuffle that list and put selected song first.
        // next()/prev() pass the existing queue so it stays stable.
        if (get().shuffle && queue !== get().queue && queue.length > 1) {
          const original = queue;
          queue = [song, ...shuffled(queue.filter((s) => s._id !== song._id))];
          set({ originalQueue: original });
        }
        // Flush telemetry of current track BEFORE loading new track.
        // Once a new track starts, telemetry counters are reset.
        flushPlaybackTelemetry(get().currentSong);
        const index = queue.findIndex((s) => s._id === song._id);
        const existingHistory = get().historySongs || [];
        const updatedHistory = [song, ...existingHistory.filter((s) => s._id !== song._id)].slice(0, 30);
        set({
          queue,
          queueIndex: index === -1 ? 0 : index,
          currentSong: song,
          position: 0,
          duration: 0,
          isBuffering: true,
          historySongs: updatedHistory,
        });
        try {
          // Worker CDN first (served from closest edge PoP), Node proxy as fallback.
          const cachedUrl = await offlineManager.getPlayableUrl(offlineKey(song._id));
          const { url, cdn } = cachedUrl ? { url: cachedUrl, cdn: 'offline' } : await resolvePlayback(song, get().audioQuality);
          playingCdn = cdn;
          playingSince = Date.now();
          // Skip leading silence when starting; apply Sound Check loudness normalization.
          const startAt = startAtSeconds && startAtSeconds > 0 ? startAtSeconds : startOf(song.transition);
          const loadStarted = Date.now();
          await audioEngine.load(url, true, { startAt, gain: get().soundCheck ? gainFor(song.transition) : 1 });
          // Passive telemetry for CDN steering: track load-to-play duration.
          if (cdn !== 'offline' && audioEngine.hasSound()) steering.success(cdn, Date.now() - loadStarted);
          if (startAt > 0) set({ position: startAt });

          // Prefetch next track AFTER current track finishes loading
          // so it does not compete for bandwidth with currently playing audio.
          const nextSong = queue[(index === -1 ? 0 : index) + 1];
          if (nextSong) prefetchNext(nextSong, get().audioQuality);
        } catch (e: any) {
          if (e?.requiresLogin) {
            // Guest free play limit reached: stop playback and show login modal.
            audioEngine.unload().catch(() => {});
            set({ isBuffering: false, isPlaying: false, isLoginModalVisible: true });
            return;
          }
          console.warn('playback failed', e);
          set({ isBuffering: false });
          return;
        }
        emitWorkspaceSync(true);
      },
      playOrToggleSong: async (song, queue = [song]) => {
        const { currentSong } = get();
        if (currentSong?._id === song._id) {
          get().togglePlay();
        } else {
          await get().playSong(song, queue);
        }
      },
      togglePlay: async () => {
        const { currentSong, isPlaying, queue, position, liveRoom } = get();
        if (!currentSong) return;
        if (liveRoom?.kind === 'station' && !isPlaying) {
          // Resuming radio catches up to live broadcast time rather than where paused.
          liveRoomHooks.resume?.();
          return;
        }
        if (isPlaying) {
          set({ isPlaying: false });
          await audioEngine.pause();
        } else {
          set({ isPlaying: true });
          if (!audioEngine.hasSound()) {
            await get().playSong(currentSong, queue, position);
          } else {
            await audioEngine.play();
          }
        }
        emitWorkspaceSync();
      },
      seek: (seconds) => {
        if (get().liveRoom) return; // In live rooms, server controls the beat
        audioEngine.seek(seconds);
        set({ position: seconds });
        emitWorkspaceSync();
      },
      seekBy: (deltaSeconds) => {
        const { position, duration, currentSong, queue, liveRoom } = get();
        if (!currentSong) return;
        if (duration === Infinity) return; // Live stream seeking disabled
        const currentPos = typeof position === 'number' && !isNaN(position) ? position : 0;
        const maxDuration = duration > 0 ? duration : 3600;
        const target = Math.max(0, Math.min(maxDuration, currentPos + deltaSeconds));
        if (liveRoom) return;
        if (!audioEngine.hasSound()) {
          get().playSong(currentSong, queue, target);
        } else {
          get().seek(target);
        }
      },
      next: () => {
        const { liveRoom, queue, queueIndex } = get();
        if (liveRoom) return;
        const upcoming = queue[queueIndex + 1] ?? queue[0];
        // Next song already preloaded (near transition point): jump immediately.
        if (upcoming && audioEngine.preloadedKey() === upcoming._id) {
          transitioner.jump(upcoming);
          return;
        }
        if (queueIndex + 1 < queue.length) {
          get().playSong(queue[queueIndex + 1], queue);
        } else if (queue.length > 0) {
          // Clicking "next" at the end of queue wraps around to the beginning.
          get().playSong(queue[0], queue);
        }
      },
      shuffle: false,
      repeat: 'off',
      originalQueue: [],
      toggleShuffle: () => {
        const { shuffle, queue, currentSong, originalQueue } = get();
        if (!shuffle) {
          // Keep current track at head, shuffle the remainder of queue.
          const rest = shuffled(queue.filter((s) => s._id !== currentSong?._id));
          const next = currentSong ? [currentSong, ...rest] : rest;
          set({ shuffle: true, originalQueue: queue, queue: next, queueIndex: 0 });
        } else {
          const base = originalQueue.length ? originalQueue : queue;
          const idx = base.findIndex((s) => s._id === currentSong?._id);
          set({ shuffle: false, queue: base, queueIndex: Math.max(0, idx), originalQueue: [] });
        }
      },
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      shufflePlay: async (list) => {
        if (!list.length) return;
        const q = shuffled(list);
        set({ shuffle: true, originalQueue: list, queue: q });
        await get().playSong(q[0], q);
      },
      onTrackFinished: () => {
        const { liveRoom, repeat, queue, queueIndex, currentSong, djAutoplay, songs, historySongs } = get();
        if (liveRoom || !currentSong) return; // In live rooms, server handles track transitions
        const upcoming = repeat === 'one' ? currentSong : queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : undefined);
        autoAdvanceOf = upcoming?._id ?? null;
        if (repeat === 'one') {
          get().playSong(currentSong, queue);
        } else if (queueIndex + 1 < queue.length) {
          get().playSong(queue[queueIndex + 1], queue);
        } else if (repeat === 'all' && queue.length) {
          get().playSong(queue[0], queue);
        } else if (djAutoplay && songs.length) {
          const next = findBestDJNextSong(currentSong, songs, historySongs?.map((s) => s._id) || []);
          if (next) {
            const nextQueue = [...queue, next];
            set({ queue: nextQueue });
            get().playSong(next, nextQueue);
            return;
          }
          audioEngine.pause().catch(() => {});
          set({ isPlaying: false });
        } else {
          audioEngine.pause().catch(() => {});
          set({ isPlaying: false }); // End of queue: stop playback (Apple Music style)
        }
      },
      transitionMode: 'automix',
      crossfadeSeconds: 6,
      soundCheck: true,
      djAutoplay: true,
      equalizerPreset: 'flat',
      setTransitionMode: (mode) => set({ transitionMode: mode }),
      setCrossfadeSeconds: (sec) => set({ crossfadeSeconds: sec }),
      setSoundCheck: (on) => {
        set({ soundCheck: on });
        const song = get().currentSong;
        audioEngine.setGain(on && song && !isLiveRadio(song) ? gainFor(song.transition) : 1);
      },
      setDjAutoplay: (on) => set({ djAutoplay: on }),
      setEqualizerPreset: (preset) => set({ equalizerPreset: preset }),
      commitAdvance: (song) => {
        const { queue, historySongs } = get();
        const index = queue.findIndex((s) => s._id === song._id);
        set({
          currentSong: song,
          queueIndex: index === -1 ? 0 : index,
          position: startOf(song.transition),
          duration: 0,
          historySongs: [song, ...(historySongs || []).filter((s) => s._id !== song._id)].slice(0, 30),
        });
        const after = queue[index + 1];
        if (after) prefetchNext(after, get().audioQuality);
        autoAdvanceOf = song._id; // Seamless track transition was automatic
        emitWorkspaceSync(true);
      },
      prev: () => {
        const { liveRoom, queue, queueIndex, position } = get();
        if (liveRoom) return;
        if (position > 3) {
          get().seek(0);
          return;
        }
        if (queueIndex - 1 >= 0) {
          get().playSong(queue[queueIndex - 1], queue);
        } else if (queue.length > 0) {
          get().playSong(queue[queue.length - 1], queue);
        } else {
          get().seek(0);
        }
      },

      radioStations: [],
      fetchRadioStations: async (country) => {
        try {
          const radioStations = await api.getRadioStations(country);
          set({ radioStations });
        } catch (e) {
          console.warn('fetchRadioStations failed', e);
        }
      },

      artists: [],
      fetchArtists: async () => {
        try {
          const artists = await api.getArtists();
          set({ artists });
        } catch (e) {
          console.warn('fetchArtists failed', e);
        }
      },
      // A genuine third-party broadcast — the stream URL itself IS the live audio, so
      // unlike playSong there's no playback token and nothing to offline-cache (you can't
      // download "the rest of a live stream").
      playLiveRadio: async (station) => {
        const syntheticSong: Song = {
          _id: `radio-${station._id}`,
          title: station.name,
          artist: station.country || station.genre || 'Radio',
          coverArt: getStationCover(station),
        };
        set({
          queue: [syntheticSong],
          queueIndex: 0,
          currentSong: syntheticSong,
          position: 0,
          duration: 0,
          isBuffering: true,
          playbackBitrate: station.bitrate || 128,
          playbackCodec: station.codec || 'MP3',
          playbackSegment: null,
          isHlsStream: false,
        });
        try {
          await audioEngine.load(station.streamUrl, true);
        } catch (e) {
          console.warn('live radio playback failed', e);
          set({ isBuffering: false });
        }
      },

      liveRoom: null,

      // --- nhóm nghe chung ---
      group: null,
      groupMembers: [],
      createGroup: async (name) => {
        const { data, error } = await supabase.rpc('create_group', { p_name: name });
        if (error) throw error;
        set({ group: { id: data.id, code: data.code, name: data.name, hostId: data.host_id }, workspaceEnabled: false });
        await joinWorkspace();
      },
      joinGroup: async (code) => {
        const { data, error } = await supabase.rpc('join_group', { p_code: code });
        if (error) throw new Error(error.code === 'P0002' ? 'Không tìm thấy nhóm hoặc nhóm đã kết thúc' : error.message);
        set({ group: { id: data.id, code: data.code, name: data.name, hostId: data.host_id }, workspaceEnabled: false });
        await joinWorkspace();
      },
      leaveGroup: async () => {
        const { group, user } = get();
        if (!group) return;
        await leaveWorkspace();
        if (user?._id === group.hostId) await supabase.from('listening_groups').update({ ended_at: new Date().toISOString() }).eq('id', group.id);
        else await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', user?._id ?? '');
        set({ group: null, groupMembers: [] });
      },

      // --- workspace ---
      workspaceEnabled: false,
      workspaceMemberCount: 0,
      toggleWorkspaceSync: () => {
        const { workspaceEnabled, user } = get();
        if (!user) return;
        if (workspaceEnabled) {
          leaveWorkspace();
          set({ workspaceEnabled: false, workspaceMemberCount: 0 });
        } else {
          set({ workspaceEnabled: true });
          joinWorkspace();
        }
      },

      // --- offline & cache ---
      offlineSongIds: [],
      offlineSongs: [],
      loadOfflineSongs: async () => {
        const list = await offlineManager.getOfflineSongs();
        set({ offlineSongs: list, offlineSongIds: list.map((s) => s._id) });
      },
      downloadSongOffline: async (song: Song) => {
        // Offline download is only available for registered members.
        if (!get().user || get().user?.isGuest) {
          set({ isLoginModalVisible: true });
          return;
        }
        const url = await resolveOfflineUrl(song);
        const success = await offlineManager.downloadSong(song, url, offlineKey(song._id));
        if (success) {
          await get().loadOfflineSongs();
        }
      },
      removeSongOffline: async (songId: string) => {
        await offlineManager.removeSong(songId, offlineKey(songId));
        await get().loadOfflineSongs();
      },

      // --- play history ---
      historySongs: [],

      // --- theme ---
      themeMode: 'auto',
      setThemeMode: (mode) => set({ themeMode: mode }),
      };
    },
    {
      name: 'musicapp-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // `workspaceEnabled`, `themeMode`, and `historySongs` persist locally
      partialize: (state) => ({
        user: state.user,
        workspaceEnabled: state.workspaceEnabled,
        themeMode: state.themeMode,
        historySongs: state.historySongs,
        shuffle: state.shuffle,
        repeat: state.repeat,
        transitionMode: state.transitionMode,
        crossfadeSeconds: state.crossfadeSeconds,
        soundCheck: state.soundCheck,
        djAutoplay: state.djAutoplay,
        equalizerPreset: state.equalizerPreset,
      }),
      onRehydrateStorage: () => (state) => {
        state?.loadOfflineSongs();
        if (state?.workspaceEnabled) joinWorkspace();
      },
    }
  )
);

// Playback tokens only last a few minutes and are embedded in URLs. When expired
// (e.g. after long pause or long tracks), reload the track at current position.
// Multi-CDN: on mid-stream failure, steer away from failing CDN to the next CDN or origin.
// Maximum 3 retries within 15 seconds to prevent infinite reconnect loops.
const recoveries: number[] = [];
audioEngine.onError(() => {
  const { currentSong, queue, position, playSong } = useStore.getState();
  // Radio streams are third-party broadcasts without tokens.
  if (!currentSong || isLiveRadio(currentSong) || useStore.getState().liveRoom?.kind === 'blind') return;
  const { isPlaying, isBuffering } = useStore.getState();
  if (!isPlaying && !isBuffering) return; // User stopped playback: do not auto-resume
  const now = Date.now();
  while (recoveries.length && now - recoveries[0] > 15000) recoveries.shift();
  if (recoveries.length >= 3) return;
  recoveries.push(now);
  if (now - playingSince < 300_000 && playingCdn !== 'offline') steering.failure(playingCdn);
  playSong(currentSong, queue, position);
});

// Feed native playback status straight into the store. Registered once at module load.
audioEngine.onStatus((status) => {
  useStore.setState({
    isPlaying: status.isPlaying,
    isBuffering: status.isBuffering,
    position: status.position,
    duration: status.duration,
    playbackBitrate: status.bitrate ?? useStore.getState().playbackBitrate,
    playbackCodec: status.codec ?? useStore.getState().playbackCodec,
    playbackSegment: status.segmentIndex ?? useStore.getState().playbackSegment,
    isHlsStream: status.isHls ?? useStore.getState().isHlsStream,
  });
  transitioner.onStatus(status);
  if (status.didFinish && !transitioner.handledEnd()) useStore.getState().onTrackFinished();
});

// Seamless track transition coordinator. Monitors playback progress:
//   ~25s before transition point -> request token and preload next track into standby deck;
//   at transition point (transitionPlan.ts) -> crossfade or splice cleanly into next track.
// If preloading is unavailable (e.g. guest quota), advances at actual audio end.
const PRELOAD_LEAD_S = 25;
const JUMP_FADE_MS = 250;

const albumKeyOf = (s: Song) => `${s.artist}_${s.category || 'singles'}`;
const trackOf = (s: Song, duration?: number): TrackInfo => ({
  duration: duration && duration > 0 ? duration : s.duration,
  transition: s.transition,
  albumKey: albumKeyOf(s),
});

class Transitioner {
  private songId: string | null = null;
  private nextId: string | null = null;
  private preparing = false;
  private fired = false;

  private reset(songId: string | null) {
    this.songId = songId;
    this.nextId = null;
    this.preparing = false;
    this.fired = false;
  }

  // Next track to play after current track (based on queue + repeat mode).
  private upcoming(): Song | null {
    const { queue, queueIndex, repeat, djAutoplay, songs, historySongs } = useStore.getState();
    if (repeat === 'one') return null;
    if (queueIndex + 1 < queue.length) return queue[queueIndex + 1];
    if (repeat === 'all' && queue.length > 1) return queue[0];
    if (djAutoplay && queue.length > 0 && songs.length > 0) {
      const cur = queue[queueIndex];
      if (cur) {
        const nextSong = findBestDJNextSong(cur, songs, historySongs?.map((h) => h._id) || []);
        if (nextSong && nextSong._id !== cur._id) {
          useStore.setState((prev) => ({ queue: [...prev.queue, nextSong] }));
          return nextSong;
        }
      }
    }
    return null;
  }

  handledEnd() { return this.fired; }

  onStatus(st: PlaybackStatus) {
    const s = useStore.getState();
    const cur = s.currentSong;
    if (!cur || s.liveRoom || isLiveRadio(cur)) return;
    if (cur._id !== this.songId) this.reset(cur._id);
    if (this.fired || !st.isPlaying) return;

    const next = this.upcoming();
    const end = cur.transition?.trimEnd;
    if (!next) {
      // End of queue or repeat one: skip trailing silence.
      if (end && st.position >= end) {
        this.fired = true;
        s.onTrackFinished();
      }
      return;
    }
    if (this.nextId && this.nextId !== next._id) {
      audioEngine.dropStandby(); // Queue changed: discard preloaded track
      this.reset(cur._id);
    }

    const plan = planTransition(trackOf(cur, st.duration), trackOf(next), s.transitionMode, s.crossfadeSeconds);
    if (s.user && !this.preparing && st.position >= plan.at - PRELOAD_LEAD_S) this.prepare(next, plan.nextStart);
    if (st.position < plan.at) return;

    if (audioEngine.preloadedKey() === next._id) {
      this.fired = true;
      this.advance(next, plan.fadeMs);
    } else if (end && st.position >= end) {
      this.fired = true; // Preload missed: skip trailing silence directly
      s.onTrackFinished();
    }
  }

  private async prepare(next: Song, startAt: number) {
    this.preparing = true;
    this.nextId = next._id;
    const s = useStore.getState();
    try {
      const cached = await offlineManager.getPlayableUrl(offlineKey(next._id));
      const { url, cdn } = cached ? { url: cached, cdn: 'offline' } : await resolvePlayback(next, s.audioQuality);
      preparedCdn = cdn;
      await audioEngine.preload(url, next._id, { startAt, gain: s.soundCheck ? gainFor(next.transition) : 1 });
    } catch {
      this.nextId = null; // Preload failed: fallback to normal playback when track ends
    }
  }

  private async advance(next: Song, fadeMs: number) {
    const leaving = useStore.getState().currentSong;
    const telemetry = await audioEngine.crossfade(fadeMs);
    flushPlaybackTelemetry(leaving, telemetry);
    playingCdn = preparedCdn;
    playingSince = Date.now();
    this.reset(next._id);
    useStore.getState().commitAdvance(next);
  }

  // Jump immediately when next track is already preloaded.
  jump(next: Song) {
    this.fired = true;
    this.advance(next, JUMP_FADE_MS);
  }
}
const transitioner = new Transitioner();

// ---------------- Multi-device workspace synchronization ----------------
// Devices with "Device Sync" enabled follow ONE shared timeline:
// { song, position `pos` at server time `at`, isPlaying }.
// When any device changes playback, all devices calculate target time
// and align playback speed smoothly (timelineSync.ts).
type Timeline = { songId: string; pos: number; at: number; playing: boolean; device: string };
// Khóa cache offline của một bài (không còn URL /api/songs/stream).
function offlineKey(songId: string) { return `hugo-offline://${songId}`; }
const DEVICE = Math.random().toString(36).slice(2, 10); // Unique device identifier per session
let timeline: Timeline | null = null;
let autoAdvanceOf: string | null = null; // Track that was auto-advanced (not initiated by user)

const expectedOf = (t: Timeline) => () => t.pos + (t.playing ? (serverNow() - t.at) / 1000 : 0);
const workspaceActive = () => {
  const { workspaceEnabled, group, user, liveRoom } = useStore.getState();
  return !!user && (workspaceEnabled || !!group) && !liveRoom;
};

// User intended to play or transition — audio engine might still be buffering.
async function emitWorkspaceSync(playing?: boolean) {
  const { user, currentSong, isPlaying, position, queue, queueIndex } = useStore.getState();
  if (!currentSong || !user || !workspaceActive() || isLiveRadio(currentSong)) return;
  const { group } = useStore.getState();
  if (group && group.hostId !== user._id) return; // trong nhóm, chỉ chủ nhóm phát lệnh; thành viên phát theo
  const auto = autoAdvanceOf === currentSong._id;
  autoAdvanceOf = null;
  // Auto-advanced follower device: leader device will broadcast timeline — avoid race.
  if (auto && timeline && timeline.device !== DEVICE) return;
  const pos = (await audioEngine.getPosition()) ?? position;
  timeline = { songId: currentSong._id, pos, at: serverNow(), playing: playing ?? isPlaying, device: DEVICE };
  sendWorkspaceState({
    ...timeline,
    queue: queue.map((s) => s._id).slice(0, 200),
    queueIndex,
  });
}

// Another device clicked playback: follow its timeline (do not echo back).
async function applyRemoteState(r: Timeline & { queue?: string[]; queueIndex?: number }) {
  if (!r?.songId || r.device === DEVICE || typeof r.at !== 'number' || !workspaceActive()) return;
  if (timeline && r.at < timeline.at) return; // Outdated packet arrived late
  timeline = { songId: r.songId, pos: r.pos, at: r.at, playing: r.playing, device: r.device };
  const t = timeline;
  const expected = expectedOf(t);
  const state = useStore.getState();
  const byId = new Map(state.songs.map((s) => [s._id, s]));
  const song = byId.get(r.songId) ?? (state.currentSong?._id === r.songId ? state.currentSong : undefined);
  if (!song) return; // Catalog not loaded yet — next sync will catch up
  if (t.playing && song.duration && expected() > song.duration) return; // Song already finished
  const queue = (r.queue || []).map((id) => byId.get(id)).filter((x): x is Song => !!x);
  const index = queue.findIndex((x) => x._id === song._id);

  if (state.currentSong?._id !== song._id) {
    useStore.setState({
      currentSong: song, queue: index >= 0 ? queue : [song], queueIndex: Math.max(0, index),
      position: r.pos, duration: 0, isBuffering: true,
    });
    try {
      const { url } = await resolvePlayback(song, state.audioQuality);
      const gain = state.soundCheck ? gainFor(song.transition) : 1;
      if (timeline !== t) return; // Newer timeline received while loading
      if (!t.playing) await audioEngine.load(url, false, { startAt: t.pos, gain });
      else await startAligned(expected, (pos) => audioEngine.load(url, true, { startAt: pos, gain }));
    } catch (e) {
      console.warn('workspace sync playback failed', e);
    }
    return;
  }
  if (index >= 0) useStore.setState({ queue, queueIndex: index });
  if (!t.playing) {
    await audioEngine.pause();
    await audioEngine.seek(t.pos);
    return;
  }
  const actual = await audioEngine.getPosition();
  // Already close to target time: let micro speed adjustment close the gap.
  if (actual !== null && state.isPlaying && Math.abs(actual - expected()) < 1.5) return;
  await startAligned(expected, async (pos) => {
    await audioEngine.seek(pos);
    await audioEngine.play();
  });
}

// Periodic sync: follower devices check drift and adjust speed smoothly.
let checks = 0;
setInterval(() => {
  // Hardware clocks drift slightly: resync with server time every ~1 minute.
  if (++checks % Math.round(60000 / SYNC.PERIOD_MS) === 0 && workspaceActive()) syncClock().catch(() => {});
  const t = timeline;
  const s = useStore.getState();
  if (s.liveRoom) return; // Live rooms have their own sync protocol
  if (!t || !t.playing || !workspaceActive() || !s.isPlaying || s.isBuffering || s.currentSong?._id !== t.songId) {
    releaseRate().catch(() => {});
    return;
  }
  // Local audio is source of truth on the active device:
  // only re-stamp timeline when significant buffering drift occurs.
  if (t.device === DEVICE) {
    releaseRate().catch(() => {});
    audioEngine.getPosition().then((p) => {
      if (p !== null && timeline === t && Math.abs(p - expectedOf(t)()) > SYNC.SEEK_ABOVE_S) emitWorkspaceSync();
    });
    return;
  }
  alignTo(expectedOf(t)).catch(() => {});
}, SYNC.PERIOD_MS);

// Vào kênh đồng bộ của chính mình: chỉnh giờ theo máy chủ trước, rồi hỏi máy khác đang phát gì.
async function joinWorkspace() {
  const { user, group } = useStore.getState();
  if (!user || (!group && user.isGuest)) return;
  await syncClock().catch(() => {});
  // Nhóm: kênh group:<id>. Không có nhóm: kênh workspace:<id người dùng> (các máy của chính mình).
  const topic = group ? `group:${group.id}` : `workspace:${user._id}`;
  await joinSyncChannel(topic, DEVICE, { name: user.nickname || 'Người nghe' }, {
    onState: applyRemoteState,
    onStateRequest: () => { if (timeline?.device === DEVICE) emitWorkspaceSync(); },
    onMembers: (members) => useStore.setState({ workspaceMemberCount: members.length, groupMembers: members }),
  });
}

// Development mode only: exposes store and audio engine to browser console for testing.
// Production builds completely omit this block.
if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as any).__hugo = { store: useStore, audioEngine };
}


/** Người dùng đã đăng nhập thật (không phải khách ẩn danh). Khách vẫn có phiên Supabase để nghe thử,
 *  nhưng màn hình đối xử như chưa đăng nhập: mời đăng nhập thay vì hiện hồ sơ trống. */
export const useMember = () => useStore((s) => (s.user && !s.user.isGuest ? s.user : null));
