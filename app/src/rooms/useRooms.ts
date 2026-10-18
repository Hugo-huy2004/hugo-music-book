import { create } from 'zustand';
import { Alert } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, resolvePlayback, toSong, roomLook } from '../api/api';
import { audioEngine } from '../audio/audioEngine';
import { useStore, liveRoomHooks, Song } from '../store/useStore';
import { serverNow, syncClock } from './serverClock';
import { startAligned, alignTo, releaseRate, SYNC } from '../audio/timelineSync';

// The machine side of the shared listening room (apps/server/src/modules/rooms/). Server keeps pace; pointing machine:
// - Radio: broadcast at correct location = server time − startedAt, and periodically measure/correct deviation.
// - Blind listening: play A and then B according to server schedule, listen again when voting and sending votes.

export type StationEntry = {
  id: string; song: Song; addedBy: string; addedByName: string; votes: number; voters: string[];
};
export type StationState = {
  station: { id: string; name: string; tagline?: string; colors: [string, string]; allowRequests: boolean };
  now: { song: Song & { duration: number }; startedAt: number } | null;
  queue: StationEntry[];
  listeners: { userId: string; name: string }[];
};
export type Condition = { key: string; kbps: number | null };
export type Trial = {
  id: string; no: number; song: Song & { duration: number }; a: Condition; b: Condition;
  excerptStart: number; excerptSeconds: number; difficulty: string;
  aAt: number; bAt: number; voteFrom: number; voteUntil: number; revealUntil: number;
};
export type ScoreRow = { userId: string; name: string; correct: number; total: number };
export type Reveal = {
  trialId: string; a: Condition; b: Condition; control: boolean; tally: { A: number; B: number; same: number };
  correct: Record<string, boolean>; leaderboard: ScoreRow[]; nextDifficulty: string;
};
export type Choice = 'A' | 'B' | 'same';

type RoomsState = {
  station: StationState | null;
  // Deviation between actual transmit position and radio clock — measurement of synchronization technique.
  blind: {
    room: { id: string; name: string; tagline?: string; colors: [string, string] };
    trial: Trial | null; listenerCount: number; leaderboard: ScoreRow[];
  } | null;
  votesIn: { voted: number; listeners: number } | null; // How many people chose (no choice revealed)
  myVote: Choice | null;
  reveal: Reveal | null;
  playingSide: 'A' | 'B' | null;
  error: string | null;
};

export const useRooms = create<RoomsState>(() => ({
  station: null, blind: null, votesIn: null, myVote: null, reveal: null, playingSide: null, error: null,
}));

// Follow the station's timeline: utils/audio/timelineSync.ts (slight speed change / fast forward at the same cost).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));


// ---------------- Radio 24/7 ----------------

let driftTimer: ReturnType<typeof setInterval> | null = null;

const stationPosition = (now: NonNullable<StationState['now']>) => (serverNow() - now.startedAt) / 1000;
const inStation = (id?: string) => {
  const room = useStore.getState().liveRoom;
  return room?.kind === 'station' && (!id || room.id === id);
};

// Stick to the station's timeline (utils/audio/timelineSync.ts). Loading/buffering, stationary position —
// At that time, you will think it is misleading and unfair, so ignore it.
async function correctDrift() {
  const now = useRooms.getState().station?.now;
  const store = useStore.getState();
  if (!now || !inStation() || !store.isPlaying || store.isBuffering || store.currentSong?._id !== now.song._id) return;
  await alignTo(() => stationPosition(now));
}

// Play the correct song and the correct station. `resume`: the listener just pressed playback.
async function applyStation(resume = false) {
  const st = useRooms.getState().station;
  const now = st?.now;
  if (!now || !inStation(st.station.id)) return;
  const store = useStore.getState();
  if (store.currentSong?._id === now.song._id && audioEngine.hasSound()) {
    if (resume) {
      useStore.setState({ isPlaying: true });
      await startAligned(() => stationPosition(now), async (pos) => {
        await audioEngine.seek(pos);
        await audioEngine.play();
      });
    }
    return;
  }
  // New posts are announced a few seconds in advance (LEAD_MS on the server): wait until the time and then all machines will join.
  const wait = now.startedAt - serverNow();
  if (wait > 0) await sleep(wait);
  if (useRooms.getState().station?.now?.song._id !== now.song._id || !inStation()) return;
  // Enter the machine exactly as long as needed to ask for tokens + load cards, and when there is a sound, the station will match.
  await startAligned(() => stationPosition(now), (pos) => store.playSong(now.song, [now.song], pos));
  await correctDrift(); // remaining deviation: slight speed adjustment
}

// ---- Đài 24/7 trên Supabase: đọc trạng thái từ bảng, nghe thay đổi qua một kênh Realtime công khai.
let roomChannel: RealtimeChannel | null = null;
const STATION_SONG = 'song:songs(*, artist:artists(name))';

async function loadStation(id: string): Promise<Omit<StationState, 'listeners'>> {
  const [{ data: st, error }, { data: reqs }] = await Promise.all([
    supabase.from('stations').select(`*, now:station_now(started_at, ${STATION_SONG})`).eq('id', Number(id)).single(),
    supabase.from('station_requests').select(`id, votes, user_id, ${STATION_SONG}`).eq('station_id', Number(id)).is('played_at', null).order('votes', { ascending: false }),
  ]);
  if (error) throw error;
  const now: any = Array.isArray(st.now) ? st.now[0] : st.now;
  return {
    station: { ...roomLook(st), allowRequests: st.allow_requests },
    now: now?.song ? { song: toSong(now.song) as Song & { duration: number }, startedAt: Date.parse(now.started_at) } : null,
    queue: (reqs ?? []).map((r: any) => ({ id: String(r.id), song: toSong(r.song), addedBy: r.user_id, addedByName: '', votes: r.votes, voters: [] })),
  };
}

export async function joinStation(id: string, name: string) {
  await leaveRoom();
  await syncClock();
  useRooms.setState({ station: { ...(await loadStation(id)), listeners: [] }, error: null });
  useStore.setState({ liveRoom: { kind: 'station', id, name } });
  liveRoomHooks.resume = () => { applyStation(true).catch(() => {}); };
  driftTimer = setInterval(() => { correctDrift().catch(() => {}); }, SYNC.PERIOD_MS);

  const refresh = async () => {
    if (!inStation(id)) return;
    const prevSong = useRooms.getState().station?.now?.song._id;
    const next = await loadStation(id);
    useRooms.setState((s) => ({ station: { ...next, listeners: s.station?.listeners ?? [] } }));
    if (next.now && next.now.song._id !== prevSong) applyStation().catch(() => {});
  };
  const user = useStore.getState().user;
  roomChannel = supabase.channel(`station:${id}`, { config: { presence: { key: user?._id ?? Math.random().toString(36) } } })
    .on('broadcast', { event: 'now_playing' }, refresh)                     // database báo chuyển bài
    .on('postgres_changes', { event: '*', schema: 'public', table: 'station_requests', filter: `station_id=eq.${id}` }, refresh)
    .on('presence', { event: 'sync' }, () => {
      const listeners = Object.values(roomChannel!.presenceState()).flat().map((p: any) => ({ userId: p.userId, name: p.name }));
      useRooms.setState((s) => (s.station ? { station: { ...s.station, listeners } } : {}));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') roomChannel!.track({ userId: user?._id, name: user?.nickname || 'Người nghe' });
    });
  await applyStation();
}

const currentStationId = () => Number(useRooms.getState().station?.station.id);
export async function suggestSong(songId: string) {
  const { error } = await supabase.rpc('request_song', { p_station_id: currentStationId(), p_song_id: songId });
  if (error) throw error;
}
export async function voteEntry(entryId: string) {
  const entry = useRooms.getState().station?.queue.find((e) => e.id === entryId);
  if (entry) await suggestSong(entry.song._id); // bỏ phiếu = gợi ý lại cùng bài
}
export async function removeEntry(entryId: string) {
  const { error } = await supabase.from('station_requests').delete().eq('id', Number(entryId)); // RLS: chỉ admin xóa được
  if (error) throw error;
}

// ---------------- Blind listening room ----------------
// Fast: when preparing, the machine loads A into the active deck AND preloads B into the standby deck (utils/audioEngine),
// both have fast forwarded to the beginning of the excerpt. At this point, B just needs to change decks (crossfade 0 ms) — don't load anything.

let playSeq = 0;        // Each time a segment is played, it increases; If the old part sees a different number, it stops automatically
let trialUrls: { A: string; B: string } | null = null;

const inBlind = () => useStore.getState().liveRoom?.kind === 'blind';
const blindTrialId = () => useRooms.getState().blind?.trial?.id;

async function playWindow(side: 'A' | 'B', at: number, ready: boolean) {
  const trial = useRooms.getState().blind?.trial;
  const url = trialUrls?.[side];
  if (!trial || !url) return;
  const mine = ++playSeq;
  if (!ready) await audioEngine.load(url, false, { startAt: trial.excerptStart });
  if (mine !== playSeq) return;
  await sleep(at - serverNow());
  const late = Math.max(0, (serverNow() - at) / 1000); // entered the room midway/computer was slow
  if (mine !== playSeq || late >= trial.excerptSeconds) return;
  if (side === 'B' && ready) await audioEngine.crossfade(0);
  if (late > 0.15) await audioEngine.seek(trial.excerptStart + late);
  await audioEngine.play();
  useRooms.setState({ playingSide: side });
  await sleep((trial.excerptSeconds - late) * 1000);
  if (mine !== playSeq) return;
  await audioEngine.pause();
  useRooms.setState({ playingSide: null });
}

async function runTrial(trial: Trial) {
  playSeq += 1;
  audioEngine.pause().catch(() => {});
  useRooms.setState({ myVote: null, reveal: null, playingSide: null, votesIn: null, error: null });
  try {
    // Một vé nghe cho bài, hai URL cho hai mức: playlist của từng mức HLS.
    const { url } = await resolvePlayback({ _id: trial.song._id }, 'auto');
    // Hai URL chỉ ghi "bên A", "bên B": mức bitrate của mỗi bên chỉ server biết tới khi công bố.
    trialUrls = { A: `${url}&trial=${trial.id}&side=A`, B: `${url}&trial=${trial.id}&side=B` };
    // Load A and then pre-load B while preparing. Must be sequential: load() unloads the waiting deck, running in parallel will
    // delete B just loaded.
    await audioEngine.load(trialUrls.A, false, { startAt: trial.excerptStart });
    await audioEngine.preload(trialUrls.B, `${trial.id}:B`, { startAt: trial.excerptStart });
  } catch (e: any) {
    useRooms.setState({ error: e.message });
    return;
  }
  if (blindTrialId() !== trial.id) return;
  await playWindow('A', trial.aAt, true);
  if (blindTrialId() === trial.id) await playWindow('B', trial.bAt, audioEngine.preloadedKey() === `${trial.id}:B`);
}

async function toTrial(t: any): Promise<Trial> {
  const { data } = await supabase.from('songs').select('*, artist:artists(name)').eq('id', t.songId ?? t.song_id).single();
  const hidden = { key: 'hidden', kbps: null }; // chưa công bố: không ai biết bên nào là mức nào
  return {
    id: t.id, no: t.no, song: toSong(data) as Song & { duration: number },
    a: hidden, b: hidden, excerptStart: Number(t.excerptStart), excerptSeconds: Number(t.excerptSeconds),
    difficulty: '', aAt: t.aAt, bAt: t.bAt, voteFrom: t.voteFrom, voteUntil: t.voteUntil, revealUntil: t.revealUntil,
  };
}

export async function joinBlindRoom(id: string, name: string) {
  await leaveRoom();
  await syncClock();
  await audioEngine.unload().catch(() => {});
  useStore.setState({ currentSong: null, isPlaying: false, queue: [], liveRoom: { kind: 'blind', id, name } });
  const [{ data: room }, { data: last }] = await Promise.all([
    supabase.from('blind_rooms').select('*').eq('id', Number(id)).single(),
    supabase.from('blind_trials').select('id, no, song_id, excerpt_start, excerpt_sec, a_at, b_at, vote_until, reveal_until').eq('room_id', Number(id)).eq('revealed', false).order('no', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ms = (iso: string) => Date.parse(iso);
  const trial = last ? await toTrial({
    id: last.id, no: last.no, songId: last.song_id, excerptStart: last.excerpt_start, excerptSeconds: last.excerpt_sec,
    aAt: ms(last.a_at), bAt: ms(last.b_at), voteFrom: ms(last.b_at), voteUntil: ms(last.vote_until), revealUntil: ms(last.reveal_until),
  }) : null;
  useRooms.setState({
    blind: { room: { ...roomLook(room!), id }, trial, listenerCount: 1, leaderboard: [] },
    votesIn: null, myVote: null, reveal: null, error: null,
  });
  if (trial) runTrial(trial).catch(() => {});

  const user = useStore.getState().user;
  roomChannel = supabase.channel(`blind:${id}`, { config: { presence: { key: user?._id ?? Math.random().toString(36) } } })
    .on('broadcast', { event: 'trial' }, async ({ payload }) => {
      const blind = useRooms.getState().blind;
      if (!inBlind() || !blind) return;
      const next = await toTrial(payload);
      useRooms.setState({ blind: { ...blind, trial: next } });
      runTrial(next).catch(() => {});
    })
    .on('broadcast', { event: 'reveal' }, ({ payload }) => {
      const blind = useRooms.getState().blind;
      if (!inBlind() || !blind) return;
      playSeq += 1; // công bố -> dừng mọi đoạn đang nghe
      audioEngine.pause().catch(() => {});
      const mine = useRooms.getState().myVote;
      const right = payload.control ? 'same' : payload.aKbps > payload.bKbps ? 'A' : 'B';
      const label = (k: number, o: number) => ({ key: k >= o ? 'high' : 'low', kbps: k });
      useRooms.setState({
        playingSide: null,
        reveal: { trialId: payload.trialId, a: label(payload.aKbps, payload.bKbps), b: label(payload.bKbps, payload.aKbps), control: payload.control,
          tally: payload.tally, correct: user && mine ? { [user._id]: mine === right } : {}, leaderboard: payload.leaderboard, nextDifficulty: '' },
        blind: { ...blind, leaderboard: payload.leaderboard },
      });
    })
    .on('broadcast', { event: 'votes' }, ({ payload }) => {
      const blind = useRooms.getState().blind;
      if (inBlind() && blind?.trial?.id === payload.trialId) useRooms.setState({ votesIn: { voted: payload.voted, listeners: blind!.listenerCount } });
    })
    .on('presence', { event: 'sync' }, () => {
      const blind = useRooms.getState().blind;
      if (blind) useRooms.setState({ blind: { ...blind, listenerCount: Object.keys(roomChannel!.presenceState()).length } });
    })
    .subscribe((status) => { if (status === 'SUBSCRIBED') roomChannel!.track({ userId: user?._id }); });
}

export function replaySide(side: 'A' | 'B') {
  playWindow(side, serverNow(), false).catch(() => {});
}

export async function castVote(choice: Choice) {
  const blind = useRooms.getState().blind;
  if (!blind?.trial) return;
  const { error } = await supabase.rpc('vote_blind', { p_trial_id: blind.trial.id, p_choice: choice });
  if (error) throw error;
  useRooms.setState({ myVote: choice });
}

function resetLocal() {
  if (driftTimer) clearInterval(driftTimer);
  driftTimer = null;
  playSeq += 1;
  liveRoomHooks.resume = undefined;
  releaseRate().catch(() => {});
}

export async function leaveRoom() {
  if (!useStore.getState().liveRoom) return;
  if (roomChannel) await supabase.removeChannel(roomChannel);
  roomChannel = null;
  resetLocal();
  await audioEngine.pause().catch(() => {});
  useStore.setState({ liveRoom: null, isPlaying: false });
  useRooms.setState({ station: null, blind: null, votesIn: null, myVote: null, reveal: null, playingSide: null, error: null });
}

