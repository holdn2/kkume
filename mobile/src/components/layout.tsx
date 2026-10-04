import type { ReactNode } from 'react';
import { Keyboard, Pressable, ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

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
  style,
  children,
  ...rest
}: ViewProps & {
  night?: boolean;
  scroll?: boolean;
  /** 스크롤 바깥 맨 위에 붙는 줄(`Header` · 탭 화면의 `Title`). 내용이 길어도 위에 남는다 */
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  // `SafeAreaView` 대신 값을 직접 읽는다. 전체화면 모달(`/record`)에서
  // 상단 여백이 들어가지 않아 제목이 상태바에 물리는 일이 있었다.
  // **최소값을 깔아 두면 inset이 0으로 와도 글자가 상태바에 닿지 않는다** —
  // 새벽 화면에서 제목이 시계에 겹치는 것은 그 자리에서 눈치채기 어렵다.
  const top = Math.max(insets.top, sp[6]);

  // 아래도 같다. **홈 인디케이터가 있는 기기에서는 화면 맨 아래 버튼이 그 막대에 물린다** —
  // 눌리기는 하는데 손가락이 제스처로 먹혀서 "가끔 안 눌리는 버튼"이 된다.
  // inset이 0인 기기(홈 버튼)에서도 바닥에 딱 붙지 않게 최소값을 깐다.
  const bottom = Math.max(insets.bottom, sp[4]);

  const inner = (
    <View style={[{ flex: 1, paddingHorizontal: sp[5], gap: sp[4] }, style]} {...rest}>
      {children}
    </View>
  );

  // 빈 곳을 누르면 키보드를 내린다(2026-10-03 사용자 요청). 안쪽 버튼 · 입력칸이 먼저 받으므로 그것들은 그대로다.
  // 새벽 화면(night)은 건드리지 않는다 — 기록 화면은 따로 짜여 있고, 거기서 키보드는 적기 그 자체다
  const Root = night ? View : Pressable;
  return (
    <Root
      onPress={night ? undefined : Keyboard.dismiss}
      accessible={false}
      style={{ flex: 1, paddingTop: top, paddingBottom: bottom, backgroundColor: night ? c.night : c.bg }}>
      {!!header && <View style={{ paddingHorizontal: sp[5], paddingBottom: sp[2] }}>{header}</View>}
      {/* 키보드는 여기서 한 번에 받는다(2026-09-30). 화면마다 KeyboardAvoidingView 를 ScrollView **안에** 두던 것은
          키보드 높이만큼 끝에 여백을 붙일 뿐 입력칸을 끌어올리지 못했다. iOS ScrollView 의
          `automaticallyAdjustKeyboardInsets`는 키보드만큼 안쪽 여백을 주고 **포커스된 입력칸을 보이는 곳까지 올린다**
          (RN 0.86 `RCTScrollViewComponentView` `_keyboardWillChangeFrame`). `handled`는 키보드가 떠 있을 때
          버튼을 한 번에 누르게 한다 — 없으면 첫 탭은 키보드만 내린다 */}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </Root>
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
