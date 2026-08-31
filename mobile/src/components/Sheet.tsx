import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui/AppText';
import { c, dur, r, sp } from '@theme/token';

/** 첫 프레임에도 화면 밖에 있도록 넉넉히 잡은 값 */
const HIDDEN = 700;
/** 이만큼 끌어내리면 닫는다 */
const CLOSE_DY = 90;
/** 짧게 튕겨도 닫히도록 — 거리를 못 채워도 속도가 빠르면 닫을 뜻이다 */
const CLOSE_VY = 0.8;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 문장으로 쓴다 — "삭제" 말고 "계정을 삭제할까요" */
  title?: string;
  description?: string;
  children?: ReactNode;
};

/**
 * RN 기본 `Modal` 위에 올렸다. `@gorhom/bottom-sheet`가 지금 dev 빌드에 들어 있는지
 * 확인할 수 없었고(`expo-haptics`가 같은 함정에 빠졌다), 틀렸을 때 그쪽은 앱이 죽는다.
 * props를 `visible`/`onClose`로만 잡아 나중에 내부만 갈아끼울 수 있게 했다.
 *
 * **마운트는 `Modal`에게 맡긴다.** 직접 들고 있으려다 한 번 크게 틀렸다 —
 * 닫혀 있는 동안 `Animated.Value`에 네이티브 드라이버 애니메이션을 걸어 두면
 * 값이 붙을 뷰가 없는 상태로 네이티브에 등록되고, 나중에 뷰가 생겨도 그 값이
 * 뷰를 움직이지 못한다. 시트가 화면 밖에 멈춘 채 **투명한 오버레이만 화면을 덮어**
 * 그 뒤로는 무엇을 눌러도 반응이 없는 것처럼 보였다.
 *
 * 그래서 몸통을 따로 뺐다. `SheetBody`는 열릴 때마다 새로 마운트되고,
 * `Animated.Value`도 그때 처음 만들어진다. 붙을 뷰가 없는 시점이 아예 없다.
 */
export function Sheet({ visible, onClose, title, description, children }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <SheetBody onClose={onClose} title={title} description={description}>
        {children}
      </SheetBody>
    </Modal>
  );
}

function SheetBody({ onClose, title, description, children }: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(HIDDEN));

  useEffect(() => {
    Animated.spring(y, {
      toValue: 0,
      useNativeDriver: true,
      damping: 32,
      stiffness: 300,
      mass: 0.9,
    }).start();
  }, [y]);

  /** 내려가는 것을 보여준 다음에 닫는다. 바로 사라지면 어디로 갔는지 알 수 없다 */
  const close = useCallback(() => {
    Animated.timing(y, { toValue: HIDDEN, duration: dur.base, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) onClose();
      },
    );
  }, [y, onClose]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
        onPanResponderMove: (_, g) => {
          // 위로는 끌리지 않는다. 확장이 아직 없는데 늘어나면 시트가 찢어져 보인다
          y.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DY || g.vy > CLOSE_VY) {
            close();
            return;
          }
          Animated.spring(y, {
            toValue: 0,
            useNativeDriver: true,
            damping: 32,
            stiffness: 300,
            mass: 0.9,
          }).start();
        },
      }),
    [y, close],
  );

  return (
    <View style={s.root}>
      {/* 오버레이는 애니메이션하지 않는다. 시트가 올라오기 전에 이미 어두워져 있어야
          "지금 이건 결정 화면"이라는 것이 먼저 전달된다 */}
      <Pressable
        style={[s.fill, { backgroundColor: c.scrim }]}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="닫기"
      />

      <Animated.View
        style={[s.sheet, { paddingBottom: insets.bottom + sp[5], transform: [{ translateY: y }] }]}>
        <View style={s.gripArea} accessibilityLabel="아래로 끌어 닫기" {...pan.panHandlers}>
          <View style={s.grip} />
        </View>

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
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: r.sheet,
    borderTopRightRadius: r.sheet,
    paddingHorizontal: sp[5],
    gap: sp[3],
  },
  // 손잡이 자체는 작지만 잡는 자리는 넓게 준다. 새벽에 4px을 조준할 수는 없다
  gripArea: { height: 32, alignItems: 'center', justifyContent: 'center', marginHorizontal: -sp[5] },
  grip: { width: 36, height: 4, borderRadius: r.chip, backgroundColor: c.line },
});
