import { ChevronRight } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, hit, sp, tint } from '@theme/token';

type IconProps = { size?: number; strokeWidth?: number; color?: string };

type Props = {
  icon?: ComponentType<IconProps>;
  label: string;
  value?: string;
  onPress?: () => void;
  /** 삭제 · 신고처럼 되돌리기 어려운 행 */
  danger?: boolean;
  /** 지금 해야 할 일을 가리키는 행 (온보딩의 위젯 설치 등) */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({ icon: Icon, label, value, onPress, danger, highlight, style }: Props) {
  const fg = danger ? c.danger : highlight ? c.action : c.fg;

  const content = (
    <>
      {Icon && <Icon size={20} strokeWidth={2} color={highlight ? c.action : c.fgMuted} />}
      <AppText size="label" color={fg} style={{ flex: 1 }}>
        {label}
      </AppText>
      {!!value && (
        <AppText size="label" color={c.fgFaint}>
          {value}
        </AppText>
      )}
      {/* 화살표는 "누를 수 있다"는 유일한 신호다. onPress가 없으면 그리지 않는다 */}
      {!!onPress && <ChevronRight size={18} strokeWidth={2} color={c.fgDisabled} />}
    </>
  );

  if (!onPress) return <View style={[s.row, highlight && s.highlight, style]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, highlight && s.highlight, pressed && { opacity: 0.7 }, style]}>
      {content}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[3],
    paddingHorizontal: sp[4],
  },
  highlight: { backgroundColor: tint.actionWeak },
});
