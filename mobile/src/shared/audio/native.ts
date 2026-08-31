import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { dbToLevel, type Recorder, type RecordingResult } from './types';

/**
 * **이 파일은 네이티브 모듈이 있을 때만 require된다.** `expo-audio`는 import되는
 * 순간 `requireNativeModule('ExpoAudio')`를 부르므로, 모듈이 없는 빌드에서
 * 이 파일을 읽으면 앱이 통째로 죽는다. 판별은 `index.ts`가 한다.
 */

// 프리셋에는 metering이 꺼져 있다. 파형에 쓸 값이 이것뿐이라 켜 준다
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** 상태를 100ms마다 읽는다. 파형이 12칸쯤 흐르는 속도라 눈에 자연스럽다 */
const POLL_MS = 100;

export function useNativeRecorder(): Recorder {
  const rec = useAudioRecorder(OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      const s = rec.getStatus();
      setDurationMs(s.durationMillis ?? 0);
      setLevel(dbToLevel(s.metering));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isRecording, rec]);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('마이크 권한이 없습니다');

    // iOS는 이걸 켜지 않으면 녹음 세션이 열리지 않는다.
    // 무음 스위치가 켜진 채 자는 사람이 많아 playsInSilentMode도 같이 준다
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    await rec.prepareToRecordAsync();
    rec.record();
    setDurationMs(0);
    setIsRecording(true);
  }, [rec]);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    await rec.stop();
    setIsRecording(false);
    setLevel(0);
    const s = rec.getStatus();
    return { uri: rec.uri, durationMs: s.durationMillis ?? durationMs };
  }, [rec, durationMs]);

  return { isRecording, durationMs, level, start, stop };
}
