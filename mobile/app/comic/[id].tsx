import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, DeleteLink, EmptyCard, ErrorCard, Header, Loading, Screen, Sheet, showToast, Stack } from '@components';
import { ComicPanelView, ComicSteps, ComicView, useComic, useComicActions } from '@features/comic';
import { useMe } from '@features/community';
import { dreamTitle } from '@features/community/DreamPicker';
import { isComicRunning } from '@shared/api/comic';
import { useBack } from '@shared/back';
import { getDreamRepo } from '@shared/db';
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

  const back = useBack('/log');
  const data = comic.data;

  // 어느 꿈의 만화인지 네 컷 위에 한 줄(이슈 #137, 095 E3 · 097 C4). 제목은 서버에 없고 폰의 꿈에서 읽는다 —
  // 폰에서 지운 꿈이면 줄을 그리지 않는다
  const dreamId = data?.dreamId;
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!dreamId) return;
    let alive = true;
    getDreamRepo()
      .then((repo) => repo.get(dreamId))
      .then((d) => alive && setTitle(d && !d.deletedAt ? dreamTitle(d) : null))
      .catch(() => alive && setTitle(null));
    return () => {
      alive = false;
    };
  }, [dreamId]);

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
      .catch(() => showToast('만화를 지우지 못했어요. 다시 시도해 주세요.'))
      .finally(() => {
        deletingRef.current = false;
        setDeleting(false);
      });
  };

  let body;
  if (me === null) {
    body = <EmptyCard title="로그인한 뒤 볼 수 있어요." hint="마이 탭에서 로그인해 주세요." />;
  } else if (comic.isPending) {
    body = <Loading />;
  } else if (comic.isError) {
    body = <ErrorCard message="만화를 불러오지 못했어요." onRetry={() => void comic.refetch()} />;
  } else if (!data) {
    body = <EmptyCard title="만화를 찾을 수 없어요." hint="지워졌을 수 있어요." />;
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
        {title && (
          <AppText size="title" weight="bold" numberOfLines={2}>
            {title}
          </AppText>
        )}
        <ComicView layout={data.layout} imageUrls={data.imageUrls} panels={data.panels} onPressPanel={setZoom} />
        <Stack gap={sp[2]}>
          {/* 공유 = 꿈 나눔 글쓰기로(계획서 003 CM-3). 갤러리 저장은 다음 빌드(expo-media-library) */}
          <Button
            label="꿈 나눔에 올리기"
            variant="secondary"
            onPress={() => router.push(`/community/new?dreamId=${data.dreamId}&comicId=${data.id}`)}
          />
          <DeleteLink label="이 만화 지우기" onPress={() => setAskDelete(true)} />
        </Stack>
      </Stack>
    );
  } else {
    // failed · refused — 서버 문구를 그대로. 둘 다 하루 몫에서 빠져 있다(081 02장)
    body = (
      <Stack gap={sp[4]}>
        <AppText color={c.fgMuted}>{data.failMessage ?? '만화를 만들지 못했어요.'}</AppText>
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

      <Sheet
        visible={askDelete}
        onClose={() => setAskDelete(false)}
        title="이 만화를 지울까요"
        description="꿈 기록은 그대로 남아요. 꿈 나눔에 올린 글의 만화도 그대로예요. 지워도 오늘 만들 수 있는 수는 돌아오지 않아요.">
        <Stack gap={sp[2]} style={{ paddingTop: sp[4] }}>
          <Button label="지우기" variant="danger" onPress={del} loading={deleting} />
          <Button label="취소" variant="ghost" onPress={() => setAskDelete(false)} />
        </Stack>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  zoom: { flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: sp[4] },
});
