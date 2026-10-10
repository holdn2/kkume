import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, Header, Screen, Sheet, showToast, Stack } from '@components';
import { ComicPanelView, ComicSteps, ComicView, useComic, useComicActions } from '@features/comic';
import { useMe } from '@features/community';
import { isComicRunning } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * CM-2 진행 + CM-3 뷰어(계획서 003). 같은 만화를 보는 화면이라 하나로 둔다 —
 * 만드는 중이면 단계 체크리스트, 끝나면 네 컷, 실패면 문구와 다시 만들기.
 *
 * 나가도 서버가 계속 만든다. 끝났다는 알림과 탭바 위 진행 표시(BottomAccessory)는 서버가 붙은 뒤에 본다 —
 * 그 전에는 꿈 상세의 「만화 보기」로 다시 들어온다.
 */
export default function ComicDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const comic = useComic(me?.id, id);
  const { remove } = useComicActions();
  const [zoom, setZoom] = useState<number | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const { width } = useWindowDimensions();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/log'));
  const data = comic.data;

  // 지우기를 연달아 누르면 요청이 둘 나가고 뒤로 가기가 두 번 돈다(PR #93 리뷰).
  // state 는 다시 그린 뒤에야 바뀌어서 ref 로 그 자리에서 막고, state 는 버튼의 loading 표시에만 쓴다
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const del = () => {
    if (!data || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    remove(data.id)
      .then(back)
      .catch(() => showToast('만화를 지우지 못했습니다. 다시 시도해 주세요.'))
      .finally(() => {
        deletingRef.current = false;
        setDeleting(false);
      });
  };

  let body;
  if (me === null) {
    body = <AppText color={c.fgMuted}>로그인한 뒤 볼 수 있어요.</AppText>;
  } else if (comic.isPending) {
    body = <AppText color={c.fgMuted}>불러오는 중입니다</AppText>;
  } else if (comic.isError) {
    body = (
      <Stack gap={sp[3]}>
        <AppText color={c.fgMuted}>만화를 불러오지 못했습니다.</AppText>
        <Button label="다시 불러오기" variant="secondary" onPress={() => void comic.refetch()} />
      </Stack>
    );
  } else if (!data) {
    body = <AppText color={c.fgMuted}>만화를 찾을 수 없어요. 지워졌을 수 있어요.</AppText>;
  } else if (isComicRunning(data.status)) {
    body = (
      <Stack gap={sp[6]}>
        <ComicSteps status={data.status} />
        <AppText size="caption" color={c.fgFaint}>
          화면을 나가도 계속 만들어요. 꿈 기록에서 「만화 보기」로 다시 볼 수 있어요.
        </AppText>
      </Stack>
    );
  } else if (data.status === 'done') {
    body = (
      <Stack gap={sp[6]}>
        <ComicView layout={data.layout} imageUrls={data.imageUrls} panels={data.panels} onPressPanel={setZoom} />
        <Stack gap={sp[2]}>
          {/* 공유 = 꿈 나눔 글쓰기로(계획서 003 CM-3). 갤러리 저장은 다음 빌드(expo-media-library) */}
          <Button
            label="꿈 나눔에 올리기"
            variant="secondary"
            onPress={() => router.push(`/community/new?dreamId=${data.dreamId}&comicId=${data.id}`)}
          />
          <Button label="이 만화 지우기" variant="ghost" onPress={() => setAskDelete(true)} />
        </Stack>
      </Stack>
    );
  } else {
    // failed · refused — 서버 문구를 그대로. 둘 다 하루 몫에서 빠져 있다(081 02장)
    body = (
      <Stack gap={sp[4]}>
        <AppText color={c.fgMuted}>{data.failMessage ?? '만화를 만들지 못했습니다.'}</AppText>
        {data.status === 'failed' && (
          <Button label="다시 만들기" onPress={() => router.replace(`/comic/new?dreamId=${data.dreamId}`)} />
        )}
      </Stack>
    );
  }

  const zoomSize = width - sp[4] * 2;

  return (
    <Screen scroll header={<Header title="꿈 만화" onBack={back} />}>
      {body}

      {/* 컷을 누르면 크게(계획서 003). 아무 데나 누르면 닫힌다 */}
      <Modal visible={zoom !== null && !!data} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable
          style={s.zoom}
          onPress={() => setZoom(null)}
          accessibilityRole="button"
          accessibilityLabel="크게 보기 닫기">
          {zoom !== null && data && (
            <View>
              <ComicPanelView
                index={zoom}
                size={zoomSize}
                layout={data.layout}
                imageUrls={data.imageUrls}
                panel={data.panels[zoom]}
                full
              />
            </View>
          )}
        </Pressable>
      </Modal>

      <Sheet visible={askDelete} onClose={() => setAskDelete(false)}>
        <Stack gap={sp[6]}>
          <Stack gap={sp[2]}>
            <AppText size="heading" weight="bold">
              이 만화를 지울까요
            </AppText>
            <AppText size="caption" color={c.fgMuted}>
              꿈 기록은 그대로 남아요. 꿈 나눔에 올린 글의 만화도 그대로예요. 지워도 오늘 만들 수 있는 수는 돌아오지 않아요.
            </AppText>
          </Stack>
          <Stack gap={sp[2]}>
            <Button label="지우기" variant="danger" onPress={del} loading={deleting} />
            <Button label="그만두기" variant="ghost" onPress={() => setAskDelete(false)} />
          </Stack>
        </Stack>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  zoom: { flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: sp[4] },
});
