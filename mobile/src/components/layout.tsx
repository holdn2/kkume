import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * 스크롤 끝에 남기는 여백(2026-10-08 사용자 요청 — "아래쪽 요소가 약간 가려지거나 하단 고정 요소와의 여백이 너무 없어서 답답하다").
 * 마지막 줄이 탭바 · 고정된 줄 · 떠 있는 버튼에 바짝 붙지 않게 한다. 목록 화면(`FlatList`)도 이 값을 쓴다
 */
export const SCROLL_TAIL = sp[8];

/**
 * 키보드가 화면 아래에서 차지한 높이(iOS). `liftFooter`가 footer 를 그만큼 올린다.
 *
 * **`KeyboardAvoidingView`를 쓰지 않는다**(2026-10-08 기기 확인). 그것은 바뀐 여백을 레이아웃 애니메이션으로 옮기는데,
 * 입력칸은 바로 올라가고 그 위 구분선과 버튼은 늦게 따라와 고정 줄이 찢어져 보였다. 여기서는 키보드가 움직이기
 * 시작할 때 값을 한 번에 바꿔 줄 전체가 함께 오른다. Android 는 창 자체가 줄어 따로 할 것이 없다
 */
function useKeyboardHeight(enabled: boolean) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') return;
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) =>
      setHeight(Math.max(0, Dimensions.get('window').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      change.remove();
      hide.remove();
    };
  }, [enabled]);
  return enabled ? height : 0;
}

/**
 * `bleedBottom` 화면에서 내용이 탭바 뒤로 내려가 있는 높이. 목록 끝 여백 · 떠 있는 버튼이 그만큼을 더해
 * 탭바 위에 놓인다. 그 밖의 화면에서는 0이다
 */
const BottomUnder = createContext(0);

/**
 * 탭바가 떠 있는 유리(iOS 26)일 때만 내용을 그 뒤로 내린다. iOS 18 이하의 탭바는 스크롤 끝 모양이 투명이라,
 * 그 뒤로 카드 글자가 지나가면 탭 이름과 겹쳐 둘 다 읽기 어렵다(PR #154 리뷰). Android의 탭바는 내용 위에 겹치지 않아
 * 얻는 것이 없다
 */
const CAN_BLEED = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;
export const useScreenBottom = () => useContext(BottomUnder);

/**
 * 화면 아래 여백 — 안전 영역(탭 화면이면 탭바 · 진행 줄 높이가 들어 있다). `Screen`과 같은 값이다.
 * `bleedBottom` 화면을 그리는 쪽(목록 끝 여백)은 `Screen` 바깥이라 컨텍스트 대신 이것을 읽는다
 */
export function useBottomInset() {
  // inset이 0인 기기(홈 버튼)에서도 바닥에 딱 붙지 않게 최소값을 깐다
  return Math.max(useSafeAreaInsets().bottom, sp[4]);
}

/**
 * `bleedBottom` 화면의 목록 끝에 더할 높이 — 내용이 탭바 뒤로 내려가는 기기(iOS 26 이상)에서만 아래 여백, 아니면 0.
 * `Screen` 바깥(목록을 그리는 화면)에서 읽는다
 */
export function useBleedBottom() {
  const bottom = useBottomInset();
  return CAN_BLEED ? bottom : 0;
}

/**
 * 화면 루트. StyleSheet의 유일한 약점이 화면마다 create 블록이 반복되는 것인데
 * 이 넷으로 대부분 없어진다.
 *
 * `night`는 RM-1(새벽 기록 모달) 전용이다. 앱에서 가장 어두운 배경이고
 * 다른 화면에서 쓰면 깊이 단계가 무너진다.
 */
export function Screen({
  night,
  scroll,
  header,
  footer,
  liftFooter,
  bleedBottom,
  style,
  children,
  ...rest
}: ViewProps & {
  night?: boolean;
  /**
   * 내용이 탭바(와 그 위 만화 진행 줄) **뒤까지** 내려가게 한다 — 목록 탭 화면(꿈 로그 · 꿈 나눔 · 마이).
   * 아래 여백을 바깥에 두면 목록이 탭바 위에서 끊기고 그 사이가 바탕색 띠로 남는다. iOS 26의 유리 탭바 · 진행 줄은
   * 뒤에 내용이 비쳐야 떠 있어 보이는데, 띠가 꿈 카드를 가렸다(101 C1 사용자 — "좌우로 배경이 쭉 이어서 있는데
   * 그 부분이 마음에 안드는거야", 이슈 #153). 그 높이는 `useScreenBottom()`으로 목록 끝 · 떠 있는 버튼에 더한다.
   * 빠른기록처럼 화면 아래에 버튼이 붙는 곳에는 쓰지 않는다 — 탭바 뒤로 숨는다
   */
  bleedBottom?: boolean;
  scroll?: boolean;
  /** 스크롤 바깥 맨 위에 붙는 줄(`Header` · 탭 화면의 `Title`). 내용이 길어도 위에 남는다 */
  header?: ReactNode;
  /** 스크롤 바깥 맨 아래에 붙는 줄 — 화면의 주된 버튼(꿈 공유의 「공유하기」). 내용이 길어도 아래에 남는다 */
  footer?: ReactNode;
  /**
   * 키보드가 오르면 `footer`가 그 위로 따라 오른다 — 입력칸이 `footer`에 있는 화면(글 상세의 댓글).
   * 끄면 `footer`는 키보드 뒤에 남고, 스크롤 안의 입력칸만 보이는 곳까지 올라간다(꿈 공유처럼 입력이 위에 있는 화면)
   */
  liftFooter?: boolean;
}) {
  const insets = useSafeAreaInsets();

  // `SafeAreaView` 대신 값을 직접 읽는다. 전체화면 모달(`/record`)에서
  // 상단 여백이 들어가지 않아 제목이 상태바에 물리는 일이 있었다.
  // **최소값을 깔아 두면 inset이 0으로 와도 글자가 상태바에 닿지 않는다** —
  // 새벽 화면에서 제목이 시계에 겹치는 것은 그 자리에서 눈치채기 어렵다.
  const top = Math.max(insets.top, sp[6]);

  // 아래도 같다. **홈 인디케이터가 있는 기기에서는 화면 맨 아래 버튼이 그 막대에 물린다** —
  // 눌리기는 하는데 손가락이 제스처로 먹혀서 "가끔 안 눌리는 버튼"이 된다.
  const bottom = useBottomInset();
  const bleed = !!bleedBottom && CAN_BLEED;
  // 키보드가 떠 있으면 그 높이가 곧 아래 여백이다 — 키보드 높이에 홈 인디케이터 자리가 이미 들어 있다
  const keyboard = useKeyboardHeight(!!liftFooter);

  const inner = (
    <View
      style={[
        { flex: 1, paddingHorizontal: sp[5], gap: sp[4] },
        scroll && { paddingBottom: SCROLL_TAIL + (bleed ? bottom : 0) },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );

  // 키보드는 여기서 한 번에 받는다(2026-09-30). 화면마다 KeyboardAvoidingView 를 ScrollView **안에** 두던 것은
  // 키보드 높이만큼 끝에 여백을 붙일 뿐 입력칸을 끌어올리지 못했다. iOS ScrollView 의
  // `automaticallyAdjustKeyboardInsets`는 키보드만큼 안쪽 여백을 주고 **포커스된 입력칸을 보이는 곳까지 올린다**
  // (RN 0.86 `RCTScrollViewComponentView` `_keyboardWillChangeFrame`). `handled`는 키보드가 떠 있을 때
  // 버튼을 한 번에 누르게 한다 — 없으면 첫 탭은 키보드만 내린다.
  // `liftFooter`면 바깥이 키보드만큼 줄어든다 — 안쪽까지 여백을 더하면 두 번 비우므로 끈다
  const main = (
    <>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          automaticallyAdjustKeyboardInsets={!liftFooter}
          // 내용은 탭바 뒤까지 내려가도 스크롤 표시줄은 탭바 위에서 끝나게
          scrollIndicatorInsets={bleed ? { bottom } : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {/* 위쪽에 머리카락 굵기의 선 하나 — 스크롤되는 내용과 고정된 줄을 가른다(2026-10-05 사용자 요청).
          화면 끝에서 끝까지, 색은 경계용 line. 그림자는 무채색 화면에서 번져 보여 쓰지 않는다.
          아래로도 한 칸 띄운다 — 버튼이 화면 끝(홈 인디케이터)에 바짝 붙어 답답했다(2026-10-08) */}
      {!!footer && (
        <View
          style={{
            paddingHorizontal: sp[5],
            paddingTop: sp[3],
            paddingBottom: sp[2],
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.line,
          }}>
          {footer}
        </View>
      )}
    </>
  );

  // 빈 곳을 누르면 키보드를 내린다(2026-10-03 사용자 요청).
  // **화면 전체를 누르는 영역으로 감싸지 않는다.** b82b801 에서 그렇게 했더니 "들어갔을 때 간혹 스크롤이 안 된다"는
  // 확인이 왔다(2026-10-05) — 모든 터치를 먼저 받는 층이 스크롤과 다툰다. 스크롤 영역은 아래 ScrollView 의
  // `keyboardShouldPersistTaps="handled"`가 이미 빈 곳 탭에 키보드를 내리므로, 스크롤 바깥인 헤더 줄에만 단다
  return (
    <View
      style={{
        flex: 1,
        paddingTop: top,
        paddingBottom: bleed ? keyboard : Math.max(bottom, keyboard),
        backgroundColor: night ? c.night : c.bg,
      }}>
      {!!header && (
        // onTouchEnd 는 안쪽 버튼(뒤로 · ⋯)이 받은 탭에도 온다 — 응답자가 되지 않아 버튼을 막지 않는다.
        // 응답자로 받으면 버튼 탭에는 안 와서, 댓글을 치다 ⋯ 를 누르면 키보드가 남은 채 메뉴가 떴다(PR #64 리뷰)
        <View style={{ paddingHorizontal: sp[5], paddingBottom: sp[2] }} onTouchEnd={() => Keyboard.dismiss()}>
          {header}
        </View>
      )}
      <BottomUnder.Provider value={bleed ? bottom : 0}>{main}</BottomUnder.Provider>
    </View>
  );
}

/**
 * 화면 맨 위의 큰 제목. 두 줄까지 쓴다.
 *
 * 모든 화면이 같은 자리에서 같은 크기로 시작하는 것이 통일성의 대부분이다.
 * 제목이 곧 그 화면의 질문이므로 문장으로 쓴다 — "제목" 말고 "어떤 꿈이었나요".
 */
export const Title = ({ children, sub }: { children: string; sub?: string }) => (
  <View style={{ gap: sp[2], paddingTop: sp[4], paddingBottom: sp[2] }}>
    <AppText size="title" weight="bold">
      {children}
    </AppText>
    {!!sub && (
      <AppText color={c.fgMuted}>
        {sub}
      </AppText>
    )}
  </View>
);

/** 가로 배치. 세로 가운데 정렬이 기본이다 */
export const Row = ({ gap = sp[2], style, ...rest }: ViewProps & { gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} {...rest} />
);

/** 세로 배치 */
export const Stack = ({ gap = sp[3], style, ...rest }: ViewProps & { gap?: number }) => (
  <View style={[{ gap }, style]} {...rest} />
);

/** 남은 공간을 밀어낸다 */
export const Spacer = () => <View style={{ flex: 1 }} />;
