import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sp } from '@theme/token';

import { Toast } from './Toast';

type Tone = 'neutral' | 'danger';
type State = { message: string; tone: Tone; visible: boolean };

/**
 * 앱 전체에 하나 뜨는 알림(2026-10-08 사용자 요청 — "이용이 제한되거나 오류 메시지가 나올 때는 토스트로도 알려줘").
 *
 * 화면 안에 적는 안내는 **누른 자리와 먼 곳에** 그려질 때가 있다 — 글 상세에서 공감을 누르면 안내 카드는
 * 반응 줄 아래에 생기는데, 댓글을 읽느라 내려가 있으면 보이지 않는다. 그래서 화면 안 안내는 그대로 두고
 * 같은 말을 **위쪽 끝에** 한 번 더 띄운다. 아래는 탭바 · 고정 버튼 · 키보드가 차지한다.
 *
 * 부르는 쪽은 `showToast` 한 줄이다. 뜨는 자리는 루트 레이아웃과 `Sheet` 안 두 곳 —
 * 시트는 따로 뜬 창(Modal)이라 루트에 그린 것이 그 아래로 깔린다.
 *
 * 위로 밀면 바로 치워진다. 그래서 떠 있는 동안은 그 자리의 터치를 받는다 — 헤더 버튼과 겹치면 밀어 치우고 누른다.
 *
 * 새벽 화면(`/record`)에서는 부르지 않는다(`Toast`와 같은 이유, 절대 규칙 7).
 */
const SHOW_MS: Record<Tone, number> = { neutral: 2500, danger: 4000 };

let state: State = { message: '', tone: 'neutral', visible: false };
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function showToast(message: string, tone: Tone = 'danger') {
  if (!message.trim()) return;
  if (timer) clearTimeout(timer);
  set({ message, tone, visible: true });
  // 사라질 때 글자를 비우지 않는다 — 흐려지는 동안 빈 상자가 보인다
  timer = setTimeout(() => set({ ...state, visible: false }), SHOW_MS[tone]);
  AccessibilityInfo.announceForAccessibility(message);
}

/** 위로 밀어 치웠을 때 — 남은 시간을 기다리지 않는다 */
export function hideToast() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (state.visible) set({ ...state, visible: false });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const read = () => state;

export function ToastHost() {
  const { message, tone, visible } = useSyncExternalStore(subscribe, read);
  const insets = useSafeAreaInsets();
  return (
    <Toast
      visible={visible}
      message={message}
      tone={tone}
      edge="top"
      offset={Math.max(insets.top, sp[6]) + sp[2]}
      onDismiss={hideToast}
    />
  );
}
