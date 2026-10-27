import { usePathname, useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { showToast } from '@components';
import { useMe } from '@features/community';
import { isComicRunning, type ComicStatus } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { c, press, r, sp } from '@theme/token';

import { COMIC_STEPS, stepStates } from './logic';
import { useComic } from './queries';
import { useWatchedComic } from './watchStore';

/**
 * CM-2 진행 표시(계획서 001 · 003 — 「이탈해도 백그라운드 진행 → BottomAccessory에 표시, 완료 시 알림」).
 *
 * 마지막으로 만든 만화 하나를 지켜본다. 만드는 동안 탭바 위에 진행을 보이고(iOS 26 이상), 끝나면 토스트로 알린다
 * (모든 기기). 끝난 뒤에도 그 만화를 열기 전까지 「다 그려졌어요」를 남긴다 — 토스트는 금방 사라진다.
 *
 * **앱이 뒤에 있을 때 알리는 것은 서버 푸시가 있어야 한다** — 이 앱은 그동안 JS가 돌지 않는다. 앱으로 돌아오면
 * 그때 다시 묻고 알린다.
 *
 * 지켜보는 id는 `watchStore.ts`가 들고 있다.
 */

/** 한 줄 문구. 만드는 중이면 지금 단계 */
function line(status: ComicStatus): string {
  if (status === 'done') return '만화가 다 그려졌어요';
  if (status === 'failed' || status === 'refused') return '만화를 그리지 못했어요';
  const i = stepStates(status).indexOf('active');
  return i < 0 ? '만화를 그릴 준비를 하는 중' : COMIC_STEPS[i];
}

/**
 * 탭 레이아웃에서 부른다. 지켜보는 만화가 있으면 탭바 위 줄(iOS 26 이상)을 돌려준다 — 없으면 null.
 * 끝나는 순간 그 만화 화면에 있지 않으면 토스트를 띄운다
 */
export function useComicAccessory() {
  const id = useWatchedComic();
  const me = useMe();
  const comic = useComic(me?.id, id);
  const status = comic.data?.id === id ? comic.data?.status : undefined;
  const router = useRouter();
  const pathname = usePathname();

  // 만드는 중이던 것이 끝나는 순간만 알린다 — 앱을 켰을 때 이미 끝나 있던 것은 줄로만 보인다
  const prev = useRef<ComicStatus | undefined>(undefined);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (!id || !status || !was || !isComicRunning(was) || isComicRunning(status)) return;
    if (pathname === `/comic/${id}`) return;
    if (status === 'done') showToast('만화가 다 그려졌어요. 탭바 위 줄이나 꿈 상세에서 볼 수 있어요.', 'neutral');
    else showToast('만화를 그리지 못했어요. 꿈 상세에서 다시 만들 수 있어요.');
  }, [id, status, pathname]);

  // 탭바 위 줄은 iOS 26부터다. 그 밖에는 토스트만 남는다
  if (!id || !status || Platform.OS !== 'ios' || Number.parseInt(String(Platform.Version), 10) < 26) return null;
  const running = isComicRunning(status);
  return (
    <NativeTabs.BottomAccessory>
      <Pressable
        onPress={() => router.push(`/comic/${id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${line(status)}, 만화 열기`}
        style={({ pressed }) => [s.row, pressed && { opacity: press }]}>
        {/* 청록은 진행 중에만(절대 규칙 5) */}
        <View style={[s.dot, { backgroundColor: running ? c.running : status === 'done' ? c.fg : c.danger }]} />
        <AppText size="caption" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          {line(status)}
        </AppText>
      </Pressable>
    </NativeTabs.BottomAccessory>
  );
}

const s = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp[2], paddingHorizontal: sp[4] },
  dot: { width: 8, height: 8, borderRadius: r.chip },
});
