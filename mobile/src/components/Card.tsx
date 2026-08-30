import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { c, r, sp, tint } from '@theme/token';

type Props = ViewProps & { onPress?: () => void; selected?: boolean };

/** 꿈 카드와 게시글 카드가 같은 것을 쓴다. `onPress`가 없으면 눌리지 않는다. */
export function Card({ onPress, selected, style, children, ...rest }: Props) {
  const body = (
    <View style={[s.card, selected && s.selected, style]} {...rest}>
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)}>
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.card,
    borderRadius: r.lg,
    // line보다 약한 경계다. 어두운 화면에서 카드끼리 겹칠 때 윤곽만 잡아준다
    borderWidth: 1,
    borderColor: tint.hairline,
    padding: sp[4],
    gap: sp[2],
  },
  selected: { borderColor: c.action, backgroundColor: tint.action },
});
