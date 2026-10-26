import { Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@shared/ui';
import { c, press, sp } from '@theme/token';

/**
 * 상세 화면 맨 아래의 지우기 입구 — 휴지통과 작은 글자(이슈 #129, 문서 095 D2).
 *
 * **버튼이 아니라 조용한 줄이다.** 지우기는 그 화면에서 가장 드물게 하는 일이라 큰 버튼 사이에 두면
 * 주된 동작과 같은 무게로 읽힌다. 누르면 늘 확인 시트가 한 번 뜬다. 꿈 상세와 만화가 함께 쓴다 —
 * 전에는 꿈은 이 모양, 만화는 회색 버튼이었다
 */
export function DeleteLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.row, pressed && { opacity: press }]}>
      <Trash2 size={16} strokeWidth={1.75} color={c.fgFaint} aria-hidden />
      <AppText size="caption" color={c.fgFaint}>
        {label}
      </AppText>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: sp[2], alignSelf: 'center', paddingVertical: sp[3] },
});
