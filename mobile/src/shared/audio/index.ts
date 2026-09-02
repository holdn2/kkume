import { requireOptionalNativeModule } from 'expo-modules-core';

import { useFakePlayer, useFakeRecorder } from './fake';
import type { Player, Recorder } from './types';

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
const usePlayerImpl: (uri: string | null, fallbackMs?: number | null) => Player = HAS_NATIVE_AUDIO
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./native').useNativePlayer
  : useFakePlayer;

export function useRecorder(): Recorder {
  return useImpl();
}

/**
 * 원본 오디오를 듣는다. **가짜 구현에서는 소리가 안 나고 시간만 흐른다** —
 * 막대가 움직이는 것과 소리가 나는 것은 다른 문제이고, 뒤의 것은 빌드에서만 판정된다.
 *
 * `fallbackMs`는 기록에 저장해 둔 길이다. 파일에서 못 읽을 때 이걸로 물러선다.
 */
export function usePlayer(uri: string | null, fallbackMs?: number | null): Player {
  return usePlayerImpl(uri, fallbackMs);
}

/** 검수 화면에 띄운다. 가짜인 줄 모르고 "녹음이 되네"라고 판정하면 그 판정이 거짓이다 */
export function audioBackend() {
  return HAS_NATIVE_AUDIO ? 'expo-audio' : 'fake';
}
