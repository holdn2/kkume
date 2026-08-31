import { Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

type Props = {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/**
 * 원 안에 점 하나. 선택은 **테두리 색과 점**으로만 보이고 배경은 건드리지 않는다 —
 * 배경까지 바꾸면 목록에서 선택된 행 하나만 상자로 떠 버린다. `Card`와 다른 점이다.
 *
 * 원만 누르게 두지 않는다. **행 전체가 터치 대상**이라 새벽에 조준할 필요가 없다.
 */
export function Radio({ selected, onSelect, label, description, disabled }: Props) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tapFeedback();
        onSelect();
      }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => [s.row, pressed && !disabled && { opacity: press }]}>
      <View style={[s.ring, { borderColor: disabled ? c.line : selected ? c.action : c.fgFaint }]}>
        {selected && <View style={[s.dot, { backgroundColor: disabled ? c.fgDisabled : c.action }]} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="label" color={disabled ? c.fgDisabled : c.fg} weight={selected ? 'semibold' : 'regular'}>
          {label}
        </AppText>
        {!!description && (
          <AppText size="caption" color={c.fgFaint}>
            {description}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { minHeight: hit.base, flexDirection: 'row', alignItems: 'center', gap: sp[3], paddingVertical: sp[2] },
  ring: { width: 22, height: 22, borderRadius: r.chip, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: r.chip },
});
