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
  // 꺼도 app/storybook 라우트는 안 깨진다 — 안내 화면으로 대체된다.
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'false',
  configPath: './.rnstorybook',
});
