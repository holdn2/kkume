import { useEffect, useState } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { c, r } from '@theme/token';

type Props = {
  width?: DimensionValue;
  height?: number;
  /** 아바타 자리를 채울 때 */
  circle?: boolean;
  radius?: number;
};

/**
 * 로컬 SQLite를 읽는 사이에 쓴다. 서버를 기다리는 것이 아니라
 * **이미 있는 것을 꺼내는 중**이라 길어야 한 박자다.
 *
 * 그래서 반짝이는 띠(shimmer)를 쓰지 않는다. 한 박자짜리 대기에 움직이는 것을 넣으면
 * 화면이 시끄럽기만 하고, 새벽에는 더 그렇다. 밝기만 조용히 오르내린다.
 */
export function Skeleton({ width = '100%', height = 16, circle, radius }: Props) {
  const [o] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);

  const size = circle ? { width: height, height } : { width, height };

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        size,
        { backgroundColor: c.surface, borderRadius: circle ? r.chip : (radius ?? r.control), opacity: o },
      ]}
    />
  );
}
