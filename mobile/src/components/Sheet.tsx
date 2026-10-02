import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui';
import { c, dur, r, sp } from '@theme/token';

/**
 * 첫 프레임과 닫힌 뒤에 화면 밖에 있도록 — 시트가 화면 높이까지 커질 수 있어(최대 높이, 2026-09-30)
 * 고정값(700)이면 긴 시트의 윗부분이 닫힌 뒤에도 남았다가 툭 사라졌다
 */
const HIDDEN = Dimensions.get('window').height;
/** 안쪽 스크롤이 끝에서 이만큼 안쪽으로 들어오면 다음 것을 읽는다 */
const END_REACHED_PX = 200;
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
  /** 안쪽 스크롤이 끝에 가까워지면 부른다 — 긴 목록을 이어 읽을 때(꿈 고르기) */
  onEndReached?: () => void;
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
export function Sheet({ visible, onClose, title, description, children, onEndReached }: Props) {
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
          description={description}
          onEndReached={onEndReached}>
          {children}
        </SheetBody>
      )}
    </Modal>
  );
}

type BodyProps = Omit<Props, 'visible'> & { closing: boolean; onExited: () => void };

function SheetBody({ closing, onExited, onClose, title, description, children, onEndReached }: BodyProps) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(HIDDEN));
  // 키보드가 떠 있으면 홈 인디케이터 여백이 필요 없다 — 두면 시트와 키보드 사이가 크게 벌어진다
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

      {/* 시트 안의 입력칸이 키보드에 가리지 않게 시트째 올린다(2026-09-30 닉네임 바꾸기에서 가렸다).
          Modal 은 따로 뜬 창이라 화면 쪽 처리가 닿지 않아 여기서 받는다.
          위쪽은 상태바 아래까지만 — 내용이 길면 그 높이에서 멈추고 안쪽이 스크롤된다 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.avoid, { paddingTop: insets.top + sp[4] }]}
        pointerEvents="box-none">
        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: keyboardUp ? sp[4] : insets.bottom + sp[5], transform: [{ translateY: y }] },
          ]}>
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
          {/* 항목이 많으면(꿈 고르기) 시트가 화면 위로 넘쳐 위쪽을 볼 수 없었다(2026-09-30).
              시트 높이는 화면까지로 막고 안쪽만 스크롤한다. 짧으면 내용 높이 그대로다 */}
          <ScrollView
            style={s.body}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={100}
            onScroll={
              onEndReached
                ? ({ nativeEvent: e }) => {
                    if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - END_REACHED_PX) {
                      onEndReached();
                    }
                  }
                : undefined
            }>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: r.sheet,
    borderTopRightRadius: r.sheet,
    paddingHorizontal: sp[5],
    gap: sp[3],
    maxHeight: '100%',
  },
  body: { flexGrow: 0, flexShrink: 1 },
  // 손잡이 자체는 작지만 잡는 자리는 넓게 준다. 새벽에 4px을 조준할 수는 없다
  gripArea: { height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: -sp[5] },
  grip: { width: 36, height: 4, borderRadius: r.chip, backgroundColor: c.line },
});
