import { ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { c, sp } from '@theme/token';

/**
 * 화면 루트. StyleSheet의 유일한 약점이 화면마다 create 블록이 반복되는 것인데
 * 이 셋으로 대부분 없어진다.
 *
 * `night`는 RM-1(새벽 기록 모달) 전용이다. 앱에서 가장 어두운 배경이고
 * 다른 화면에서 쓰면 깊이 단계가 무너진다.
 */
export function Screen({
  night,
  scroll,
  style,
  children,
  ...rest
}: ViewProps & { night?: boolean; scroll?: boolean }) {
  const inner = (
    <View style={[{ flex: 1, paddingHorizontal: sp[5], gap: sp[3] }, style]} {...rest}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: night ? c.night : c.bg }} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

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
