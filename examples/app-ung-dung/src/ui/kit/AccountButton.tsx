import { GlassButton } from 'hugo-music';
import { useStore, useMember } from '../../store/useStore';

export default function AccountButton({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const member = useMember();
  const open = useStore((s) => s.setLoginModalVisible);
  return (
    <GlassButton icon="person-circle-outline" label={member ? 'Tài khoản' : 'Đăng nhập'}
      onPress={() => (member ? onNavigate('account') : open(true))} />
  );
}
