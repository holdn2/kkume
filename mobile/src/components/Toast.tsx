import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, dur, r, sp } from '@theme/token';

type Tone = 'neutral' | 'running' | 'danger';

type Props = {
  visible: boolean;
  message: string;
  tone?: Tone;
  /** 되돌리기 같은 한 가지 행동만 붙인다. 두 개를 붙이면 그건 시트여야 한다 */
  actionLabel?: string;
  onAction?: () => void;
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
export function Toast({ visible, message, tone = 'neutral', actionLabel, onAction }: Props) {
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
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        s.wrap,
        { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
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
  wrap: { position: 'absolute', left: sp[5], right: sp[5], bottom: sp[6] },
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
