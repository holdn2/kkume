import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

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

  useEffect(() => {
    // 폰트 로딩이 실패해도 스플래시에 갇히면 안 된다.
    // 새벽에 앱이 안 열리는 것보다 폰트가 기본값인 편이 낫다.
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
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
    </>
  );
}
