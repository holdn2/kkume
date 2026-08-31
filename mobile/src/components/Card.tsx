import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { c, press, r, sp } from '@theme/token';

type Props = ViewProps & { onPress?: () => void; selected?: boolean };

/**
 * 카드는 **채움 하나로만** 성립한다.
 *
 * 배경 + 테두리 + 그림자를 같이 쓰면 세 가지가 같은 말을 반복하면서
 * 화면이 평평해진다. 쉬는 상태에는 테두리가 없고, 선택됐을 때만 생긴다 —
 * 그래서 선택이 한눈에 보인다.
 */
export function Card({ onPress, selected, style, children, ...rest }: Props) {
  const body = (
    <View style={[s.card, selected && s.selected, style]} {...rest}>
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: press } : null)}>
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: r.surface,
    padding: sp[4],
    gap: sp[2],
    // 쉬는 상태에도 자리는 잡아 둔다. 선택될 때 레이아웃이 밀리지 않는다
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selected: { backgroundColor: c.raised, borderColor: c.action },
});
