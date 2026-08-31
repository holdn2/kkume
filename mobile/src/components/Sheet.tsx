import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui/AppText';
import { c, dur, r, sp } from '@theme/token';

/** 첫 레이아웃 전에도 화면 밖에 있도록 넉넉히 잡은 값 */
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
 * **오버레이는 시트를 기다리지 않는다.** 같이 올라오면 뒤 화면이 절반쯤 밝은 채로
 * 시트가 도착하고, 그 사이에 "지금 이게 무슨 상태인지"가 흐려진다.
 * 어두워지는 것이 먼저고 시트는 그 위로 올라온다.
 *
 * 손잡이는 **실제로 끌린다.** 끌어내려 닫을 수 있고, 나중에 확장·축소를 붙일 때
 * 같은 제스처를 그대로 쓴다. `PanResponder`는 RN 코어라 네이티브 의존이 없다.
 */
export function Sheet({ visible, onClose, title, description, children }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);
  const [y] = useState(() => new Animated.Value(HIDDEN));
  const [dim] = useState(() => new Animated.Value(0));

  // 열릴 때의 마운트는 **렌더 단계에서** 결정한다. effect 안에서 setState를 하면
  // 한 프레임 늦게 붙어 시트가 한 번 깜빡이고, 린트도 연쇄 렌더로 잡는다.
  // 닫힐 때의 언마운트는 반대로 애니메이션이 끝나야 알 수 있어 콜백에서 한다.
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      // 애니메이션 없이 그 자리에서 어두워진다
      dim.setValue(1);
      Animated.spring(y, {
        toValue: 0,
        useNativeDriver: true,
        damping: 32,
        stiffness: 300,
        mass: 0.9,
      }).start();
      return;
    }
    Animated.timing(dim, { toValue: 0, duration: dur.fast, useNativeDriver: true }).start();
    Animated.timing(y, { toValue: HIDDEN, duration: dur.base, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setMounted(false);
      },
    );
  }, [visible, y, dim]);

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
            onClose();
            return;
          }
          Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 32, stiffness: 300 }).start();
        },
      }),
    [y, onClose],
  );

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[s.fill, { opacity: dim }]}>
          <Pressable
            style={[s.fill, { backgroundColor: c.scrim }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />
        </Animated.View>

        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + sp[5], transform: [{ translateY: y }] }]}>
          <View
            style={s.gripArea}
            accessibilityLabel="아래로 끌어 닫기"
            {...pan.panHandlers}>
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
    </Modal>
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
