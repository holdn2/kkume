import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

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
};

const FG: Record<Tone, string> = { neutral: c.fg, running: c.running, danger: c.danger };

/**
 * 표시만 하는 컴포넌트다. **언제 사라지는지는 부르는 쪽이 정한다** —
 * 자동 소멸 시간을 여기에 박으면 "되돌리기"처럼 더 오래 떠 있어야 하는 것과
 * 단순 알림이 같은 시간을 쓰게 된다.
 *
 * 새벽 화면에는 띄우지 않는다. 토스트는 읽어야 하는 것이고,
 * 읽어야 하는 것은 결정을 만든다(절대 규칙 7).
 */
export function Toast({ visible, message, tone = 'neutral', actionLabel, onAction, edge = 'bottom', offset = sp[6] }: Props) {
  const [a] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(a, {
      toValue: visible ? 1 : 0,
      duration: dur.base,
      useNativeDriver: true,
    }).start();
  }, [visible, a]);

  return (
    <Animated.View
      // 누를 것이 없으면 터치를 받지 않는다 — 위에 뜨면 헤더(뒤로 · ⋯)를 덮는다
      pointerEvents={visible && !!actionLabel ? 'auto' : 'none'}
      style={[
        s.wrap,
        { [edge]: offset },
        {
          opacity: a,
          // 붙은 끝 쪽에서 미끄러져 들어온다
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [edge === 'top' ? -16 : 16, 0] }) }],
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
