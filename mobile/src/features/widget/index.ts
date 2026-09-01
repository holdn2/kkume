import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 위젯 네이티브 모듈이 **이 빌드에** 들어 있는가 (절대 규칙 10).
 *
 * `createWidget()`은 부르는 순간 `new ExpoWidgetsModule.Widget(...)`으로
 * 네이티브를 잡는다. `RecordBoth.tsx`는 그것을 **모듈 스코프에서** 하므로,
 * 위젯이 없는 빌드에서 그 파일을 import하면 **앱이 통째로 죽는다.**
 * try/catch로도 못 막는다 — 콘솔에 빨간 ERROR가 남아 앱이 깨진 것처럼 보인다.
 */
export const HAS_NATIVE_WIDGETS = requireOptionalNativeModule('ExpoWidgets') != null;

/**
 * 위젯을 한 번 그려 둔다.
 *
 * **props가 없는 위젯이어도 `updateSnapshot({})`을 최초 1회 불러야 한다**(절대 규칙 9).
 * `reload()`만으로는 타임라인이 비어 있어 아무것도 안 그려지고,
 * 사용자에게는 "위젯을 추가했는데 빈 칸"으로 보인다.
 *
 * 여러 번 불러도 문제는 없다 — 같은 시각의 스냅샷 하나로 교체될 뿐이다.
 */
export function ensureWidgetSnapshot() {
  if (!HAS_NATIVE_WIDGETS) return;
  try {
    // 위젯이 있는 빌드에서만 읽는다. 없는 빌드에서 이 파일을 읽으면 그 자리에서 죽는다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const widget = require('./RecordBoth').default as { updateSnapshot(props: object): void };
    widget.updateSnapshot({});
  } catch {
    // 위젯이 안 그려지는 것은 기록 유실이 아니다. 앱을 세울 이유가 없다
  }
}

/** 검수 화면에 띄운다. 가짜인 줄 모르고 "위젯이 붙었네"라고 판정하면 그 판정이 거짓이다 */
export function widgetBackend() {
  return HAS_NATIVE_WIDGETS ? 'expo-widgets' : 'none';
}
