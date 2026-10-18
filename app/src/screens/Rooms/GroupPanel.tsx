// Nhóm nghe chung: tạo nhóm (nhận mã 6 ký tự) hoặc nhập mã để vào. Trong nhóm: thấy ai đang nghe,
// chủ nhóm điều khiển, mọi người phát theo đúng giây (đồng bộ ở store, kênh Realtime group:<id>).
import { useState } from 'react';
import { View, Share, Platform } from 'react-native';
import { InsetGroup, ListRow, TextField, ActionButton, ErrorText, space } from 'hugo-music';
import { useStore } from '../../store/useStore';

export default function GroupPanel() {
  const user = useStore((s) => s.user);
  const group = useStore((s) => s.group);
  const members = useStore((s) => s.groupMembers);
  const { createGroup, joinGroup, leaveGroup, setLoginModalVisible } = useStore.getState();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (group) {
    const isHost = group.hostId === user?._id;
    const invite = () => {
      const message = `Nghe nhạc cùng mình trên Hugo Music, mã nhóm: ${group.code}`;
      if (Platform.OS === 'web') navigator.clipboard?.writeText(group.code);
      else Share.share({ message });
    };
    return (
      <InsetGroup header="Nhóm nghe chung" footer={isHost ? 'Bạn điều khiển: mọi người trong nhóm nghe đúng bài và đúng giây bạn đang phát.' : 'Chủ nhóm đang điều khiển nhạc.'}>
        <ListRow icon="people" title={group.name} subtitle={`Mã nhóm ${group.code} · ${members.length} người đang nghe`}
          right={<ActionButton size="sm" variant="glass" icon="share-outline" title={Platform.OS === 'web' ? 'Chép mã' : 'Mời'} onPress={invite} />} />
        {members.map((m, i) => <ListRow key={i} icon="person-circle-outline" title={m.name || 'Người nghe'} separator={i < members.length - 1} />)}
        <View style={{ paddingVertical: space.md }}>
          <ActionButton variant="danger" title={isHost ? 'Kết thúc nhóm' : 'Rời nhóm'} loading={busy} onPress={() => run(leaveGroup)} />
        </View>
      </InsetGroup>
    );
  }

  return (
    <InsetGroup header="Nghe cùng bạn bè" footer="Tạo nhóm rồi gửi mã cho bạn bè. Ai vào nhóm cũng nghe đúng bài, đúng giây với bạn.">
      <View style={{ paddingVertical: space.md, gap: space.md }}>
        <ActionButton icon="add-circle-outline" title="Tạo nhóm mới" loading={busy}
          onPress={() => (user && !user.isGuest ? run(() => createGroup(`Nhóm của ${user.nickname || 'mình'}`)) : setLoginModalVisible(true))} />
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Nhập mã nhóm" autoCapitalize="characters" autoCorrect={false} />
          </View>
          <ActionButton variant="glass" title="Vào" disabled={code.trim().length !== 6} onPress={() => run(() => joinGroup(code))} />
        </View>
        <ErrorText message={error} />
      </View>
    </InsetGroup>
  );
}
