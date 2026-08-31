import { useCallback, useEffect, useState } from 'react';

import { type Recorder, type RecordingResult } from './types';

/**
 * 마이크가 없는 빌드에서 쓰는 가짜 녹음기.
 *
 * **파형과 화면을 지금 확정하기 위한 것이다.** 계획서가 파형을
 * "이 앱에서 유일하게 살아 있는 모션 · 듣고 있다는 유일한 시각 증거"로 못박아 뒀는데,
 * 진짜 마이크를 기다리면 그 모양을 빌드 뒤에나 보게 된다.
 * 빌드가 플랫폼당 월 15회뿐이라 그 대기가 비싸다.
 *
 * 파일을 만들지 않으므로 `uri`는 null이다. **저장 경로가 이걸 그대로 받아
 * 오디오 없는 기록으로 남긴다** — 그것도 실제로 일어나는 경우다(텍스트만 적을 때).
 */
export function useFakeRecorder(): Recorder {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const started = Date.now();
    const t = setInterval(() => {
      setDurationMs(Date.now() - started);
      // 말소리처럼 보이게 한다 — 큰 흐름 위에 잔떨림을 얹는다.
      // 완전한 난수는 파형이 아니라 노이즈로 보인다
      const slow = (Math.sin(Date.now() / 420) + 1) / 2;
      setLevel(Math.max(0, Math.min(1, slow * 0.7 + Math.random() * 0.3)));
    }, 100);
    return () => clearInterval(t);
  }, [isRecording]);

  const start = useCallback(async () => {
    setDurationMs(0);
    setIsRecording(true);
  }, []);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    setIsRecording(false);
    setLevel(0);
    return { uri: null, durationMs };
  }, [durationMs]);

  return { isRecording, durationMs, level, start, stop };
}
