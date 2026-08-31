import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui/AppText';
import { c, r, sp } from '@theme/token';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 문장으로 쓴다 — "삭제" 말고 "계정을 삭제할까요" */
  title?: string;
  description?: string;
  children?: ReactNode;
};

/**
 * RN 기본 `Modal` 위에 올렸다. 이슈 #5에는 `@gorhom/bottom-sheet` 래퍼로 적혀 있지만,
 * 그 패키지가 **지금 폰에 깔린 dev 빌드에 실제로 들어 있는지 확인할 수 없었다** —
 * `expo-haptics`가 정확히 그 함정에 빠졌다(package.json에는 있는데 빌드에는 없었다).
 *
 * 틀렸을 때의 비용이 한쪽으로 크게 기운다. gorhom을 썼는데 없으면 **여는 순간 앱이 죽고**,
 * Modal을 썼는데 gorhom이 있었으면 잘 돌아간다. 우리가 쓸 시트는 삭제 확인과
 * 4컷/8컷 선택 같은 **결정 시트**라 드래그도 필요 없다.
 *
 * props를 `visible`/`onClose`로만 잡아 둔 것은 나중에 내부를 gorhom으로 갈아끼울 때
 * **호출부를 한 줄도 고치지 않기 위해서다.**
 */
export function Sheet({ visible, onClose, title, description, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + sp[5] }]}>
          <View style={s.grip} />
          {(!!title || !!description) && (
            <View style={{ gap: sp[2], paddingBottom: sp[2] }}>
              {!!title && (
                <AppText size="heading" weight="semibold">
                  {title}
                </AppText>
              )}
              {!!description && <AppText color={c.fgMuted}>{description}</AppText>}
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: r.sheet,
    borderTopRightRadius: r.sheet,
    paddingHorizontal: sp[5],
    paddingTop: sp[3],
    gap: sp[3],
  },
  // 잡아끌 수 없다는 것을 아는 상태에서도 이 손잡이는 남긴다.
  // "여기가 시트다"라는 표시이고, 나중에 실제로 끌 수 있게 되면 그대로 쓴다
  grip: { width: 36, height: 4, borderRadius: r.chip, backgroundColor: c.line, alignSelf: 'center', marginBottom: sp[2] },
});
