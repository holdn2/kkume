import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui/AppText';
import { c, hit, r, sp } from '@theme/token';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'base' | 'sm';

type Props = {
  label: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** 되돌리기 어려운 액션에만 준다. 남발하면 신호가 죽는다 */
  haptic?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

// danger는 채우지 않고 테두리로 그린다 — 새벽에 실수로 누르기 어렵게 하려는 의도다.
const FG: Record<Variant, string> = {
  primary: c.actionFg, // 어두운 라벨. 흰색은 보라 위에서 3.33:1로 AA 미달이다
  outline: c.fg,
  ghost: c.fgMuted,
  danger: c.danger,
};

export function Button({
  label,
  variant = 'primary',
  size = 'base',
  disabled,
  loading,
  haptic,
  onPress,
  style,
}: Props) {
  const off = disabled || loading;

  const handle = () => {
    if (haptic) tapFeedback();
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        s.base,
        size === 'sm' && s.sm,
        s[variant],
        pressed && !off && { opacity: 0.75 },
        off && s.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? c.actionFg : c.fgMuted} />
      ) : (
        <AppText size="label" weight="semibold" color={off ? c.fgDisabled : FG[variant]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  // 기본 높이가 48이 아니라 56인 이유는 새벽에 손이 정확하지 않기 때문이다
  base: {
    height: hit.base,
    borderRadius: r.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp[5],
  },
  sm: { height: hit.min, paddingHorizontal: sp[4] },
  primary: { backgroundColor: c.action },
  outline: { borderWidth: 1, borderColor: c.line },
  ghost: { backgroundColor: 'transparent' },
  danger: { borderWidth: 1, borderColor: c.danger },
  disabled: { backgroundColor: c.field, borderColor: c.field },
});
