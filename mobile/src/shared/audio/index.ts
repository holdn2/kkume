import { requireOptionalNativeModule } from 'expo-modules-core';

import { useFakeRecorder } from './fake';
import type { Recorder } from './types';

export * from './types';

/**
 * 네이티브 오디오 모듈이 **이 빌드에** 들어 있는가.
 *
 * `package.json`에 있는 것과 빌드에 들어 있는 것은 다르다 — `expo-haptics`가
 * 정확히 그 차이에서 물렸다. `requireOptionalNativeModule`은 없으면 null을 주므로
 * 던지지 않고 물어볼 수 있는 유일한 방법이다.
 *
 * 앱이 도는 동안 값이 바뀌지 않으므로, 이걸로 훅을 골라도 훅 순서는 안정적이다.
 */
export const HAS_NATIVE_AUDIO = requireOptionalNativeModule('ExpoAudio') != null;

// 네이티브가 있을 때만 native.ts를 읽는다. 저 파일은 import되는 순간
// requireNativeModule을 불러서, 모듈이 없으면 앱이 통째로 죽는다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const useImpl: () => Recorder = HAS_NATIVE_AUDIO ? require('./native').useNativeRecorder : useFakeRecorder;

export function useRecorder(): Recorder {
  return useImpl();
}

/** 검수 화면에 띄운다. 가짜인 줄 모르고 "녹음이 되네"라고 판정하면 그 판정이 거짓이다 */
export function audioBackend() {
  return HAS_NATIVE_AUDIO ? 'expo-audio' : 'fake';
}
