import { Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui/AppText';
import { c, press, r, sp } from '@theme/token';

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
 * 선택은 **한 단계 밝은 채움**으로 보인다. 테두리로 그리면 칸의 크기가 달라져
 * 누를 때마다 옆 칸이 밀린다.
 */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={s.wrap}>
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
            style={({ pressed }) => [s.seg, on && { backgroundColor: c.raised }, pressed && !on && { opacity: press }]}>
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
  wrap: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: r.chip, padding: 3, gap: 3 },
  seg: { flex: 1, height: 42, borderRadius: r.chip, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp[3] },
});
