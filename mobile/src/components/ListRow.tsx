import { ChevronRight } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, hit, press, r, sp } from '@theme/token';

type IconProps = { size?: number; strokeWidth?: number; color?: string };

type Props = {
  icon?: ComponentType<IconProps>;
  label: string;
  /** 라벨 아래 한 줄. 꿈 목록에서 미리보기로 쓴다 */
  subtitle?: string;
  /** 우측 값. 시각 · 상태처럼 짧은 것만 */
  value?: string;
  onPress?: () => void;
  /** 삭제 · 신고처럼 되돌리기 어려운 행 */
  danger?: boolean;
  /** 지금 해야 할 일을 가리키는 행 (온보딩의 위젯 설치 등) */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 행 사이에 구분선을 긋지 않는다. 여백과 글자 굵기만으로 나눈다.
 *
 * 어두운 화면에서 구분선은 두 가지 중 하나가 된다 — 안 보이거나, 줄무늬가 되거나.
 * 목록이 길어질수록 후자가 되고, 그때 화면은 읽는 것이 아니라 훑는 것이 된다.
 *
 * 대신 **행 사이 간격은 `sp[3]`(12) 이상**을 준다. 선이 없으니 간격이 곧 경계이고,
 * 새벽에 옆 행을 잘못 누르는 것을 막는 것도 이 간격이다.
 */
export function ListRow({
  icon: Icon,
  label,
  subtitle,
  value,
  onPress,
  danger,
  highlight,
  style,
}: Props) {
  const fg = danger ? c.danger : highlight ? c.action : c.fg;

  const content = (
    <>
      {Icon && <Icon size={20} strokeWidth={1.75} color={danger ? c.danger : c.fgMuted} />}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="label" weight={subtitle ? 'medium' : 'regular'} color={fg}>
          {label}
        </AppText>
        {!!subtitle && (
          <AppText size="caption" color={c.fgFaint} numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {!!value && (
        <AppText size="label" color={c.fgFaint}>
          {value}
        </AppText>
      )}
      {/* 화살표는 "누를 수 있다"는 유일한 신호다. onPress가 없으면 그리지 않는다 */}
      {!!onPress && <ChevronRight size={18} strokeWidth={1.75} color={c.fgFaint} />}
    </>
  );

  if (!onPress) return <View style={[s.row, highlight && s.highlight, style]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.row,
        highlight && s.highlight,
        pressed && { opacity: press },
        style,
      ]}>
      {content}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: hit.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[3],
    paddingHorizontal: sp[4],
    paddingVertical: sp[2],
  },
  // 강조도 채움이다. 테두리로 두르면 목록 안에서 상자 하나가 떠 버린다
  highlight: { backgroundColor: c.surface, borderRadius: r.control },
});
