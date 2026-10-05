import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

/**
 * 스택 화면 맨 위의 고정 줄 — 뒤로 · 제목 · 오른쪽 동작.
 *
 * `Screen`의 `header`에 넣으면 **스크롤 바깥에** 붙어 내용이 길어도 위에 남는다(2026-10-03 사용자 —
 * *"다른 페이지에서도 헤더는 상단 고정이 웬만하면 되도록"*). 전에는 뒤로 버튼이 내용과 함께 스크롤돼
 * 긴 글 · 긴 입력 화면에서 맨 위까지 올려야 나갈 수 있었다.
 *
 * 제목은 한 줄이다. 탭 화면의 큰 제목(`Title`)과 다르다 — 스택 화면은 "어디에 들어와 있는지"만 알리면 된다.
 */
export function Header({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={s.bar}>
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          style={({ pressed }) => [s.back, pressed && { opacity: press }]}>
          <ChevronLeft size={24} strokeWidth={1.75} color={c.fg} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {!!title && (
          <AppText size="heading" weight="semibold" numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}

/**
 * 작은 알약 버튼 — 카드 안 이름 옆처럼 **주된 동작이 아닌 곁가지**에 쓴다(마이 탭 「닉네임 바꾸기」).
 * 큰 버튼과 섞이지 않게 한 단계 밝은 채움(`raised`)에 아이콘을 붙인다. 잡는 자리는 hitSlop 으로 넓힌다
 */
export function Chip({
  label,
  icon: Icon,
  onPress,
  iconOnly,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  /** 아이콘만 그린다(동그라미). 글자는 접근성 이름으로만 남는다 — 마이 탭 닉네임 옆(2026-10-05 사용자 요청) */
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.chip, iconOnly && s.round, pressed && { opacity: press }]}>
      {Icon && <Icon size={iconOnly ? 16 : 14} strokeWidth={2} color={c.fg} aria-hidden />}
      {!iconOnly && (
        <AppText size="caption" weight="semibold">
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: sp[2], minHeight: hit.min },
  back: { height: hit.min, justifyContent: 'center', marginLeft: -sp[1] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[1],
    height: 32,
    paddingHorizontal: sp[3],
    borderRadius: r.chip,
    backgroundColor: c.raised,
  },
  round: { width: 32, paddingHorizontal: 0, justifyContent: 'center' },
});
