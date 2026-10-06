import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking } from 'react-native';

/**
 * 공개 페이지(GitHub Pages, 저장소의 `site/`). 이용약관 · 개인정보처리방침 — 앱 심사에 적는 주소와 같다.
 * JS 상수로 둔다 — `app.json`에 두면 런타임 지문에 들어가 바꿀 때 빌드를 먹는다(CLAUDE.md)
 */
export const SITE_URL = 'https://holdn2.github.io/kkume';
export const TERMS_URL = `${SITE_URL}/terms/`;
export const PRIVACY_URL = `${SITE_URL}/privacy/`;

// `expo-web-browser`는 package.json 에 있지만 깔린 빌드에 들어 있는지는 따로다(절대 규칙 10) — 먼저 묻는다
const HAS_WEB_BROWSER = requireOptionalNativeModule('ExpoWebBrowser') != null;

/** 앱 안 브라우저(Safari 보기)로 연다. 그 모듈이 없는 빌드면 Safari 로 */
export async function openWebPage(url: string): Promise<void> {
  if (HAS_WEB_BROWSER) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  await Linking.openURL(url);
}
