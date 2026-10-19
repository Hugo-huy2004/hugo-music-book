import { create } from 'zustand';
import { api, auth, me, type Song, type User } from '../api/api';
import { supabase } from '../api/supabase';

type State = {
  songs: Song[];
  isLoadingSongs: boolean;
  songsError: string | null;
  fetchSongs: () => Promise<void>;
  user: User | null;
  isLoginModalVisible: boolean;
  setLoginModalVisible: (v: boolean) => void;
  startPasswordlessLogin: (email: string) => Promise<unknown>;
  loginPasswordless: (email: string, code: string) => Promise<unknown>;
  logout: () => Promise<unknown>;
};

export const useStore = create<State>()((set) => {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED')
      setTimeout(async () => set({ user: await me(), isLoginModalVisible: false }));
    if (event === 'SIGNED_OUT') set({ user: null });
  });
  supabase.auth.getSession().then(({ data }) => { if (!data.session) auth.continueAsGuest(); });

  return {
    songs: [], isLoadingSongs: false, songsError: null,
    fetchSongs: async () => {
      set({ isLoadingSongs: true, songsError: null });
      try {
        set({ songs: await api.getSongs(), isLoadingSongs: false });
      } catch (e: any) {
        set({ isLoadingSongs: false, songsError: e.message });
      }
    },
    user: null as User | null,
    isLoginModalVisible: false,
    setLoginModalVisible: (v: boolean) => set({ isLoginModalVisible: v }),
    startPasswordlessLogin: (email: string) => auth.sendCode(email),
    loginPasswordless: (email: string, code: string) => auth.verifyCode(email, code),
    logout: () => auth.signOut(),
  };
});

export const useMember = () => useStore((s) => (s.user && !s.user.isGuest ? s.user : null));
