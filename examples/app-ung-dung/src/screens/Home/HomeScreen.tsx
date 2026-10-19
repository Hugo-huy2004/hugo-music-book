import { ScrollView, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { LargeTitle, Shelf, MediaTile, Spinner, EmptyState } from 'hugo-music';
import { useStore } from '../../store/useStore';
import { useIsMobile } from '../../lib/responsive';
import { useHomeSections } from './useHomeSections';
import AccountButton from '../../ui/kit/AccountButton';

export default function HomeScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { width } = useWindowDimensions();
  const isMobile = useIsMobile();
  const { isLoadingSongs, songsError, songs } = useStore(useShallow((s) => ({
    isLoadingSongs: s.isLoadingSongs, songsError: s.songsError, songs: s.songs })));
  const { newReleases, artists } = useHomeSections(12);
  const tile = isMobile ? Math.min(170, width * 0.4) : 180;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <LargeTitle title="Trang chủ" right={<AccountButton onNavigate={onNavigate} />} />
      {isLoadingSongs && !songs.length && <Spinner />}
      {songsError && <EmptyState icon="cloud-offline-outline" title="Không tải được nhạc" hint={songsError} />}
      {!isLoadingSongs && !songsError && !songs.length && <EmptyState title="Chưa có bài nào" hint="Bài đã duyệt sẽ hiện ở đây." />}
      <Shelf title="Mới phát hành">
        {newReleases.map((s) => <MediaTile key={s._id} uri={s.coverArt} title={s.title} subtitle={s.artist} size={tile} onPress={() => {}} />)}
      </Shelf>
      <Shelf title="Nghệ sĩ">
        {artists.map((s) => <MediaTile key={s.artist} uri={s.coverArt} title={s.artist} size={tile} round onPress={() => {}} />)}
      </Shelf>
    </ScrollView>
  );
}
