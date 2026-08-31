import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui/AppText';
import { c, hit, press, r, sp } from '@theme/token';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
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

/**
 * 주 버튼은 흰 채움이고 알약이 아니다.
 *
 * 알약 버튼은 지금 어느 앱에나 있어서 그 자체로는 아무것도 말하지 않는다.
 * 화면 폭을 채우는 사각 버튼은 "이 화면에서 할 일은 이것 하나"라고 말한다 —
 * 새벽 결정 0개(절대 규칙 7)와 같은 방향이다.
 */
const FG: Record<Variant, string> = {
  primary: c.actionFg,
  secondary: c.fg,
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
        off && s.off,
        pressed && !off && { opacity: press },
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
  base: {
    height: hit.base,
    borderRadius: r.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp[5],
  },
  sm: { height: hit.min, paddingHorizontal: sp[4] },

  primary: { backgroundColor: c.action },
  // 보조 버튼도 채운다. 테두리로 그리면 주/보조가 아니라 다른 종류로 읽힌다
  secondary: { backgroundColor: c.surface },
  ghost: { backgroundColor: 'transparent' },
  // danger만 테두리다. 새벽에 실수로 누르기 어렵게 하려는 의도이고,
  // "채우지 않는다"가 여기서만 예외라서 오히려 눈에 걸린다
  danger: { borderWidth: 1, borderColor: c.danger },

  // 비활성은 흐린 것이 아니라 꺼진 것이다. 채운 회색으로 확실히 죽인다
  off: { backgroundColor: c.surface, borderWidth: 0 },
});
