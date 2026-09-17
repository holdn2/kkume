// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// withStorybook이 metro 기동 시 .rnstorybook/storybook.requires.ts를 자동 생성한다.
// 그 파일은 생성물이라 git에 올리지 않고, EAS에서는 eas-build-post-install로 만든다.
module.exports = withStorybook(config, {
  // 스토리북은 번들을 2.4MB -> 7.1MB로 불린다. 개발 중에는 켜두되
  // 진입점 검증용 release 빌드에서는 끈다 (eas.json의 preview 프로필).
  //
  // **이 식은 src/shared/storybook.ts의 STORYBOOK_ENABLED와 같아야 한다.**
  //
  // 끄면 withStorybook이 .rnstorybook/index.ts를 안내 화면으로 바꿔 준다고 되어 있지만,
  // 그 판정이 경로를 '/'로 비교하는 정규식이라 **Windows에서 번들을 만들면 안 맞는다**
  // (경로가 '\'). 우리 eas update가 바로 Windows 번들이라, 진짜 스토리북이 들어가
  // 누르는 순간 앱이 꺼졌다(2026-09-17). 그래서 라우트와 메뉴가 직접 막는다 —
  // 이 바꿔치기에 기대지 않는다.
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'false',
  configPath: './.rnstorybook',
});
