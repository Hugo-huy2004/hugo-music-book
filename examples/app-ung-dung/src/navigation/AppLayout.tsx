import { useEffect } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GlassTabBar, useHugoTheme, type TabItem } from 'hugo-music';
import { useIsMobile } from '../lib/responsive';
import { useStore } from '../store/useStore';
import HomeScreen from '../screens/Home/HomeScreen';
import AccountScreen from '../screens/Account/AccountScreen';
import LoginModal from '../screens/Auth/LoginModal';

const TABS: TabItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home-outline' },
  { key: 'radio', label: 'Đài', icon: 'radio-outline' },
  { key: 'library', label: 'Thư viện', icon: 'albums-outline' },
  { key: 'account', label: 'Tài khoản', icon: 'person-circle-outline' },
];
const ROUTE: Record<string, string> = { home: 'Home', search: 'Search', radio: 'Radio', library: 'Library', account: 'Account' };

function Sidebar({ items, active, onPress }: { items: TabItem[]; active: string; onPress: (k: string) => void }) {
  const { colors } = useHugoTheme();
  return (
    <View style={{ width: 220, padding: 16, gap: 4 }}>
      {items.map((it) => (
        <Pressable key={it.key} onPress={() => onPress(it.key)}
          style={{ padding: 10, borderRadius: 10, backgroundColor: it.key === active ? colors.activeItemBg : 'transparent' }}>
          <Text style={{ color: colors.text, fontWeight: it.key === active ? '700' : '400' }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function renderScreen(tab: string, go: (t: string) => void) {
  switch (tab) {
    case 'account': return <AccountScreen />;
    case 'home':
    default: return <HomeScreen onNavigate={go} />;
  }
}

export default function AppLayout({ tab }: { tab: string }) {
  const isMobile = useIsMobile();
  const { colors } = useHugoTheme();
  const nav = useNavigation<any>();
  const go = (t: string) => nav.navigate(ROUTE[t]);
  // Ứng dụng 2, bước 2
  const fetchSongs = useStore((s) => s.fetchSongs);
  useEffect(() => { fetchSongs(); }, []);
  // Ứng dụng 3, bước 5
  const visible = useStore((s) => s.isLoginModalVisible);
  const setVisible = useStore((s) => s.setLoginModalVisible);
  return (
    <View style={{ flex: 1, flexDirection: isMobile ? 'column' : 'row', backgroundColor: colors.background }}>
      {!isMobile && <Sidebar items={TABS} active={tab} onPress={go} />}
      <View style={{ flex: 1 }}>{renderScreen(tab, go)}</View>
      {isMobile && <GlassTabBar items={TABS} value={tab} onChange={go} />}
      <LoginModal visible={visible} onClose={() => setVisible(false)} />
    </View>
  );
}
