import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { queryClient } from '@features/community';
import { ensureWidgetSnapshot } from '@features/widget';
import { c } from '@theme/token';

SplashScreen.preventAutoHideAsync();

// 파일명이 아니라 이 키가 token.ts의 font 값과 짝을 이룬다.
// 여기를 바꾸면 AppText가 통째로 깨지므로 token.ts와 함께 고친다.
const FONTS = {
  Pretendard_400: require('../assets/fonts/Pretendard-Regular.otf'),
  Pretendard_500: require('../assets/fonts/Pretendard-Medium.otf'),
  Pretendard_600: require('../assets/fonts/Pretendard-SemiBold.otf'),
  Pretendard_700: require('../assets/fonts/Pretendard-Bold.otf'),
};

export default function RootLayout() {
  const [loaded, error] = useFonts(FONTS);

  // 위젯은 타임라인이 비어 있으면 아무것도 안 그린다. props가 없는 위젯이어도
  // updateSnapshot을 최초 1회 불러야 하고(절대 규칙 9), 그러지 않으면
  // 사용자에게는 "위젯을 추가했는데 빈 칸"으로 보인다.
  // 위젯이 없는 빌드에서는 안에서 그대로 돌아 나온다.
  useEffect(() => {
    ensureWidgetSnapshot();
  }, []);

  useEffect(() => {
    // 폰트 로딩이 실패해도 스플래시에 갇히면 안 된다.
    // 새벽에 앱이 안 열리는 것보다 폰트가 기본값인 편이 낫다.
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // 서버 응답 캐시. 지금은 커뮤니티만 쓴다 — 기록은 서버가 아니라 SQLite 가 원본이라 여기 두지 않는다(절대 규칙 1)
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'fade',
        }}>
        {/* 새벽 기록은 탭 밖의 전체화면 모달이다. 탭바가 보이면 결정이 생긴다.
            배경도 여기만 night(순수 검정)이고, 애니메이션은 없다 —
            새벽의 대기 시간은 곧 이탈이다(계획서 7.6). */}
        <Stack.Screen
          name="record"
          options={{
            presentation: 'fullScreenModal',
            animation: 'none',
            contentStyle: { backgroundColor: c.night },
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
