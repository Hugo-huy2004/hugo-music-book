import { ScrollView } from 'react-native';
import { EmptyState, InsetGroup, ListRow, ActionButton, LargeTitle } from 'hugo-music';
import { useStore, useMember } from '../../store/useStore';

export default function AccountScreen() {
  const member = useMember();
  const logout = useStore((s) => s.logout);
  if (!member) return <EmptyState icon="person-circle-outline" title="Bạn đang nghe với tư cách khách" hint="Đăng nhập để lưu bài yêu thích." />;
  return (
    <ScrollView>
      <LargeTitle title="Tài khoản" />
      <InsetGroup header="Tài khoản">
        <ListRow icon="mail-outline" title="Email" subtitle={member.email} />
        <ListRow icon="person-outline" title="Tên hiển thị" subtitle={member.nickname} separator={false} />
      </InsetGroup>
      <ActionButton title="Đăng xuất" variant="danger" onPress={logout} />
    </ScrollView>
  );
}
