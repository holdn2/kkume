import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, dur, press, r, sp } from '@theme/token';

const PAD = 3;
const GAP = 3;
const SEG_H = 42;

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (next: T) => void;
};

/**
 * 알약을 쓰는 몇 안 되는 자리다. 작고, 서로 붙어 있고, 하나만 켜진다 —
 * 알약 반경의 이름이 `chip`인 이유가 이런 것들이다.
 *
 * 선택 표시는 **칸 뒤에서 미끄러지는 판 하나**다. 칸마다 배경을 켜고 끄면
 * 어디서 어디로 옮겨갔는지가 안 보이고, 그러면 세그먼트가 그냥 버튼 줄이 된다.
 * 판은 `translateX`만 움직이므로 네이티브 드라이버로 돌아간다.
 */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const [w, setW] = useState(0);
  const [x] = useState(() => new Animated.Value(0));

  const n = options.length;
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segW = w > 0 ? (w - PAD * 2 - GAP * (n - 1)) / n : 0;
  const canSlide = n > 1 && segW > 0;

  useEffect(() => {
    Animated.timing(x, { toValue: idx, duration: dur.fast, useNativeDriver: true }).start();
  }, [idx, x]);

  return (
    <View style={s.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {canSlide && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.pill,
            {
              width: segW,
              transform: [
                {
                  translateX: x.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * (segW + GAP)),
                  }),
                },
              ],
            },
          ]}
        />
      )}

      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (on) return;
              tapFeedback();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.seg, pressed && !on && { opacity: press }]}>
            <AppText size="label" weight={on ? 'semibold' : 'regular'} color={on ? c.fg : c.fgFaint}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: r.chip,
    padding: PAD,
    gap: GAP,
  },
  pill: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    height: SEG_H,
    borderRadius: r.chip,
    backgroundColor: c.raised,
  },
  seg: {
    flex: 1,
    height: SEG_H,
    borderRadius: r.chip,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp[3],
  },
});
