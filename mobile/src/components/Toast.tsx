import { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, dur, r, sp } from '@theme/token';

type Tone = 'neutral' | 'running' | 'danger';

type Props = {
  visible: boolean;
  message: string;
  tone?: Tone;
  /** 되돌리기 같은 한 가지 행동만 붙인다. 두 개를 붙이면 그건 시트여야 한다 */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * 어느 끝에 붙는가와 그 끝에서 얼마나 떨어지는가. 기본은 아래 `sp[6]`.
   * 앱 전체 알림(`ToastHost`)은 위에 붙인다 — 아래는 탭바 · 고정 버튼 · 키보드에 가린다
   */
  edge?: 'top' | 'bottom';
  offset?: number;
  /**
   * 붙은 끝 쪽으로 밀어 치운다(위에 붙었으면 위로). 주면 토스트가 터치를 받는다(2026-10-08 사용자 요청 —
   * "위로 올려서 제거하려고 하면 제거되어야 해")
   */
  onDismiss?: () => void;
};

/** 이만큼 밀거나 이 속도보다 빠르게 튕기면 치운다. 못 미치면 제자리로 돌아온다 */
const DISMISS_DISTANCE = sp[6];
const DISMISS_VELOCITY = 0.3;

const FG: Record<Tone, string> = { neutral: c.fg, running: c.running, danger: c.danger };

/**
 * 표시만 하는 컴포넌트다. **언제 사라지는지는 부르는 쪽이 정한다** —
 * 자동 소멸 시간을 여기에 박으면 "되돌리기"처럼 더 오래 떠 있어야 하는 것과
 * 단순 알림이 같은 시간을 쓰게 된다.
 *
 * 새벽 화면에는 띄우지 않는다. 토스트는 읽어야 하는 것이고,
 * 읽어야 하는 것은 결정을 만든다(절대 규칙 7).
 */
export function Toast({ visible, message, tone = 'neutral', actionLabel, onAction, edge = 'bottom', offset = sp[6], onDismiss }: Props) {
  const [a] = useState(() => new Animated.Value(0));
  /** 손가락으로 민 거리. 붙은 끝 쪽(위면 음수)으로만 움직인다 */
  const [drag] = useState(() => new Animated.Value(0));
  const sign = edge === 'top' ? -1 : 1;

  // 새로 뜰 때는 제자리에서 — 지난번에 밀어 치운 자리에 남아 있지 않게
  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !!onDismiss && Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(sign * Math.max(0, sign * g.dy)),
        onPanResponderRelease: (_, g) => {
          if (sign * g.dy > DISMISS_DISTANCE || sign * g.vy > DISMISS_VELOCITY) onDismiss?.();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag, sign, onDismiss],
  );

  useEffect(() => {
    Animated.timing(a, {
      toValue: visible ? 1 : 0,
      duration: dur.base,
      useNativeDriver: true,
    }).start();
  }, [visible, a]);

  return (
    <Animated.View
      // 누르거나 밀 것이 없으면 터치를 받지 않는다 — 위에 뜨면 헤더(뒤로 · ⋯)를 덮는다
      pointerEvents={visible && (!!actionLabel || !!onDismiss) ? 'auto' : 'none'}
      // 사라진 뒤에도 글자는 남아 있다(흐려질 뿐) — 스크린리더가 지난 문장을 읽지 않게 숨긴다(PR #79 리뷰)
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      {...pan.panHandlers}
      style={[
        s.wrap,
        { [edge]: offset },
        {
          opacity: a,
          // 붙은 끝 쪽에서 미끄러져 들어오고, 민 만큼 따라간다
          transform: [
            { translateY: Animated.add(a.interpolate({ inputRange: [0, 1], outputRange: [sign * 16, 0] }), drag) },
          ],
        },
      ]}>
      <View style={s.body}>
        <AppText size="label" color={FG[tone]} style={{ flex: 1 }}>
          {message}
        </AppText>
        {!!actionLabel && (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={12}>
            <AppText size="label" weight="semibold" color={c.fg}>
              {actionLabel}
            </AppText>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: sp[5], right: sp[5] },
  body: {
    backgroundColor: c.raised,
    borderRadius: r.control,
    paddingVertical: sp[3],
    paddingHorizontal: sp[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[4],
    minHeight: 52,
  },
});
