import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { c, hit, press, r, sp } from '@theme/token';

import { useScreenBottom } from './layout';

/** 떠 있는 버튼이 목록 끝을 가리지 않게 목록 아래에 더 두는 높이. `SCROLL_TAIL`에 더해 쓴다 */
export const FAB_ROOM = hit.base + sp[5];

/**
 * 탭바 위 오른쪽 아래에 뜨는 둥근 버튼(꿈 나눔의 「꿈 공유하기」 · 꿈 로그의 기록하기).
 * 글자 없이 아이콘 하나라 이름은 `label`로 화면 읽기에만 준다
 */
export function Fab({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const under = useScreenBottom();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // 내용이 탭바 뒤까지 내려가는 화면이면 그만큼 올려 탭바 위에 둔다(이슈 #153)
      style={({ pressed }) => [s.fab, { bottom: sp[5] + under }, pressed && { opacity: press }]}>
      <Icon size={24} strokeWidth={2} color={c.actionFg} aria-hidden />
    </Pressable>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: sp[5],
    width: hit.base,
    height: hit.base,
    borderRadius: r.chip,
    backgroundColor: c.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
