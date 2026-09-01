import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui';
import { c, dur, r, sp } from '@theme/token';

/** 첫 프레임에도 화면 밖에 있도록 넉넉히 잡은 값 */
const HIDDEN = 700;
/** 이만큼 끌어내리면 닫는다 */
const CLOSE_DY = 90;
/** 짧게 튕겨도 닫히도록 — 거리를 못 채워도 속도가 빠르면 닫을 뜻이다 */
const CLOSE_VY = 0.8;

const SPRING = { useNativeDriver: false, damping: 32, stiffness: 300, mass: 0.9 } as const;

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
 * **닫기는 항상 한 길로 간다.** 오버레이든 손잡이든 시트 안의 버튼이든 전부
 * 부모의 `visible`을 내리고, 그다음 몸통이 내려가는 애니메이션을 끝낸 뒤 사라진다.
 * 내부에만 있는 닫기 경로를 따로 두면 시트 안 버튼으로 닫을 때만 애니메이션이 빠진다.
 *
 * **`Animated.Value`는 몸통 안에서 만든다.** 바깥에 두면 닫혀 있는 동안 —
 * 붙을 뷰가 하나도 없는 상태에서 — 네이티브에 등록돼 버리고, 나중에 뷰가 생겨도
 * 그 값이 뷰를 움직이지 못한다.
 */
export function Sheet({ visible, onClose, title, description, children }: Props) {
  const [showing, setShowing] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);

  // 여는 것은 렌더 단계에서 결정한다. effect에서 하면 한 프레임 늦게 붙어 깜빡인다.
  // 닫는 것은 반대로 애니메이션이 끝나야 알 수 있어 몸통이 알려준다.
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) setShowing(true);
  }

  const handleExited = useCallback(() => setShowing(false), []);

  return (
    <Modal
      visible={showing}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      {showing && (
        <SheetBody
          closing={!visible}
          onExited={handleExited}
          onClose={onClose}
          title={title}
          description={description}>
          {children}
        </SheetBody>
      )}
    </Modal>
  );
}

type BodyProps = Omit<Props, 'visible'> & { closing: boolean; onExited: () => void };

function SheetBody({ closing, onExited, onClose, title, description, children }: BodyProps) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(HIDDEN));

  useEffect(() => {
    if (closing) {
      // 지금 있는 자리에서 이어서 내려간다. 끌다가 놓은 경우에도 끊기지 않는다
      Animated.timing(y, { toValue: HIDDEN, duration: dur.base, useNativeDriver: false }).start(
        ({ finished }) => {
          if (finished) onExited();
        },
      );
      return;
    }
    Animated.spring(y, { toValue: 0, ...SPRING }).start();
  }, [closing, y, onExited]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 닫히는 중에는 손잡이를 받지 않는다. 받으면 아래 setValue가 닫기 애니메이션을
        // 멈추고(AnimatedValue.setValue는 진행 중인 애니메이션을 stop한다),
        // 완료 콜백이 finished: false로 돌아와 onExited가 불리지 않는다.
        // 그러면 showing이 true로 남고 closing도 그대로라 effect가 다시 돌지 않아
        // **시트가 화면에 갇힌다.** 스크림을 눌러도 부모의 visible은 이미 false다.
        onStartShouldSetPanResponder: () => !closing,
        onMoveShouldSetPanResponder: (_, g) => !closing && g.dy > 3,
        onPanResponderMove: (_, g) => {
          // 위로는 끌리지 않는다. 확장이 아직 없는데 늘어나면 시트가 찢어져 보인다
          y.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DY || g.vy > CLOSE_VY) {
            onClose();
            return;
          }
          Animated.spring(y, { toValue: 0, ...SPRING }).start();
        },
      }),
    [y, onClose, closing],
  );

  return (
    <View style={s.root}>
      {/* 오버레이는 애니메이션하지 않는다. 시트가 올라오기 전에 이미 어두워져 있어야
          "지금 이건 결정 화면"이라는 것이 먼저 전달된다 */}
      <Pressable
        style={[s.fill, { backgroundColor: c.scrim }]}
        onPress={onClose}
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
  gripArea: { height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: -sp[5] },
  grip: { width: 36, height: 4, borderRadius: r.chip, backgroundColor: c.line },
});
