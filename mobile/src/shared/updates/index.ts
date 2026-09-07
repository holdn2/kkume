import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 지금 도는 번들이 **빌드에 박힌 것인지 무선으로 받은 것인지** 알려준다.
 *
 * 이게 없으면 OTA가 도착했는지 판정할 방법이 없다. 코드가 안 바뀐 업데이트는
 * 화면이 똑같아서, "새 번들이 왔다"와 "안 와서 옛 번들이 그대로 돈다"가
 * 눈으로는 구분되지 않는다. 2026-09-06 첫 OTA에서 실제로 이 구멍에 걸렸다.
 *
 * 절대 규칙 10대로 네이티브가 있는지 먼저 묻는다. `expo-updates`는 dev 클라이언트나
 * Expo Go에는 없을 수 있는데, 없는 채로 `Updates.updateId`를 읽으면 콘솔에
 * 빨간 ERROR가 남아 앱이 깨진 것처럼 보인다.
 */
export const HAS_NATIVE_UPDATES = requireOptionalNativeModule('ExpoUpdates') != null;

export type UpdateInfo = {
  /** 켜져 있나. 개발 빌드에서는 꺼져 있다 */
  enabled: boolean;
  /** true면 빌드에 박힌 번들. **OTA가 아직 안 왔다는 뜻이다** */
  embedded: boolean;
  updateId: string | null;
  createdAt: Date | null;
  channel: string | null;
  runtimeVersion: string | null;
};

export function updatesBackend(): 'expo-updates' | 'none' {
  return HAS_NATIVE_UPDATES ? 'expo-updates' : 'none';
}

export function updateInfo(): UpdateInfo | null {
  if (!HAS_NATIVE_UPDATES) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const U = require('expo-updates');
  return {
    enabled: U.isEnabled,
    embedded: U.isEmbeddedLaunch,
    updateId: U.updateId,
    createdAt: U.createdAt,
    channel: U.channel,
    runtimeVersion: U.runtimeVersion,
  };
}
