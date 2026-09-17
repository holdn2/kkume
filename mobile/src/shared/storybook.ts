/**
 * 스토리북이 이 번들에 켜져 있는가.
 *
 * **`metro.config.js`의 `enabled`와 같은 식이어야 한다.** 둘 다 번들을 만드는 순간의
 * `EXPO_PUBLIC_STORYBOOK_ENABLED`를 읽는다 — 앱 쪽은 Expo가 이 값을 코드에 박아 넣는다.
 * `preview` 빌드와 `eas update`는 `false`로 번들을 만든다.
 *
 * **라우트와 메뉴가 이 값을 직접 본다.** 꺼졌을 때 스토리북 자리를 안내 화면으로
 * 바꿔 주는 것은 원래 `withStorybook`의 일인데, 그 판정이 경로를 `/`로 비교하는 정규식이라
 * **Windows에서 번들을 만들면(= 우리 `eas update`) 안 맞는다.** 그러면 진짜 스토리북이
 * 번들에 들어가고, 불러오는 순간 빈 모듈의 `start()`를 불러 앱이 꺼진다(2026-09-17 재현).
 */
export const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'false';
