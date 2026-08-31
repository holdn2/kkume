import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, r, sp } from '@theme/token';

const H = 6;

type Props = {
  /** 0~1. `indeterminate`면 무시된다 */
  value?: number;
  /** 얼마나 걸릴지 모를 때. 만화 생성이 여기에 해당한다 */
  indeterminate?: boolean;
  label?: string;
};

/**
 * 진행 막대는 **청록**이다 — 절대 규칙 5번의 "진행 중"이 정확히 이것이다.
 * 무채색 UI에서 이 색이 보인다는 것 자체가 "지금 뭔가 돌고 있다"는 신호다.
 *
 * 퍼센트를 숫자로 같이 보여주지 않는다. 새벽에 숫자는 읽히지 않고,
 * 읽히면 "얼마나 남았지"라는 계산을 만든다.
 */
export function Progress({ value = 0, indeterminate, label }: Props) {
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [indeterminate, slide]);

  const pct = Math.max(0, Math.min(1, value));

  return (
    <View style={{ gap: sp[2] }} accessibilityRole="progressbar">
      {!!label && (
        <AppText size="caption" color={c.fgMuted}>
          {label}
        </AppText>
      )}
      <View style={s.track}>
        {indeterminate ? (
          <Animated.View
            style={[
              s.fill,
              s.chunk,
              // 폭을 모르니 화면 밖에서 들어와 밖으로 나간다. 끝점이 없다는 것을 그대로 보여준다
              { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: ['-100%', '400%'] }) }] },
            ]}
          />
        ) : (
          <View style={[s.fill, { width: ((pct * 100).toString() + '%') as DimensionValue }]} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: H, borderRadius: r.chip, backgroundColor: c.raised, overflow: 'hidden' },
  fill: { height: H, borderRadius: r.chip, backgroundColor: c.running },
  chunk: { width: '25%' },
});
