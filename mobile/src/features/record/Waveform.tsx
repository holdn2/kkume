import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { c, r } from '@theme/token';

const BARS = 28;
const MAX_H = 56;
const MIN_H = 3;
/** 한 칸 흐르는 간격 */
const TICK_MS = 100;

/**
 * **이 앱에서 유일하게 살아 있는 모션이다**(계획서 7.6).
 * 새벽 화면에는 애니메이션을 두지 않는데 여기만 예외인 이유는 하나다 —
 * "듣고 있다"를 알릴 다른 수단이 없다. 글자로 "녹음 중"이라고 쓰지 않기로 했으므로
 * 점 하나와 이 파형이 그 역할을 전부 한다.
 *
 * `Animated`를 쓰지 않는다. 막대 28개를 각각 애니메이션하면 값이 28개가 되고,
 * 그중 하나에 드라이버가 섞이는 순간 조용히 죽는다 — 이 저장소에서 이미 두 번 겪었다.
 * 레벨이 100ms마다 들어오므로 **그때마다 한 칸씩 밀어주는 것만으로 충분히 흐른다.**
 */
export function Waveform({ level, active }: { level: number; active: boolean }) {
  const [levels, setLevels] = useState<number[]>(() => new Array(BARS).fill(0));
  const latest = useRef(level);

  // 레벨은 들어오는 대로 담아만 두고, 그리는 박자는 파형이 스스로 정한다.
  // 레벨이 바뀔 때마다 setState 하면 녹음기의 폴링 주기가 곧 렌더 주기가 되고,
  // 그 주기를 바꾸는 순간 파형의 속도가 같이 변한다 — 둘은 별개여야 한다.
  useEffect(() => {
    latest.current = level;
  }, [level]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setLevels((prev) => [...prev.slice(1), latest.current]), TICK_MS);
    return () => clearInterval(t);
  }, [active]);

  return (
    <View style={s.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {levels.map((v, i) => (
        <View
          key={i}
          style={[
            s.bar,
            {
              height: MIN_H + v * (MAX_H - MIN_H),
              // 오래된 쪽을 흐리게 해서 흐르는 방향이 보이게 한다
              opacity: 0.35 + (i / BARS) * 0.65,
            },
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { height: MAX_H, flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'stretch', justifyContent: 'center' },
  bar: { flex: 1, maxWidth: 4, borderRadius: r.chip, backgroundColor: c.running },
});
