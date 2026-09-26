import { ExpoSpeechRecognitionModule as M } from 'expo-speech-recognition';
import { documentDirectory } from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fileSize } from '@shared/audio';

import { createDictationSession, type DictationSession, type SpeechModuleLike } from './session';
import type { DictationHandlers, Dictator } from './types';

/**
 * **이 파일은 모듈이 있는 빌드에서만 require된다.** `expo-speech-recognition`은 import되는 순간
 * `requireNativeModule`을 불러, 모듈이 없는 빌드에서 읽으면 앱이 통째로 죽는다(절대 규칙 10).
 * 판별은 `index.ts`가 한다.
 *
 * 흐름은 `session.ts`에 있다. 여기는 그것을 React 상태에 잇기만 한다.
 */
export function useNativeDictator(): Dictator {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  const session = useRef<DictationSession | null>(null);
  if (session.current == null) {
    session.current = createDictationSession(
      {
        module: M as unknown as SpeechModuleLike,
        fileSize,
        now: Date.now,
        setTimer: (fn, ms) => {
          setTimeout(fn, ms);
        },
        documentDirectory: documentDirectory ?? '',
      },
      {
        onRecording: (on) => {
          if (on) setDurationMs(0);
          setIsRecording(on);
        },
        onLevel: setLevel,
      },
    );
  }

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setDurationMs(Date.now() - (session.current?.startedAt() ?? Date.now())), 100);
    return () => clearInterval(t);
  }, [isRecording]);

  // 화면을 떠나면 듣기를 놓고, 아직 돌고 있으면 끊는다
  useEffect(() => () => session.current?.dispose(), []);

  const start = useCallback((h: DictationHandlers) => session.current!.start(h), []);
  const stop = useCallback(() => session.current!.stop(), []);
  const abort = useCallback(() => session.current!.abort(), []);

  return { isRecording, durationMs, level, start, stop, abort };
}

/** 묻지 않고 조회만 한다. 새벽에 창을 띄우지 않으려는 것이다(절대 규칙 7) */
export async function readPermissions() {
  const [speech, mic] = await Promise.all([M.getSpeechRecognizerPermissionsAsync(), M.getMicrophonePermissionsAsync()]);
  return { speech, mic };
}

/** 낮 화면에서만 부른다 — 온보딩 리허설 · 꿈 로그 탭의 카드 */
export async function askSpeechPermission(): Promise<boolean> {
  return (await M.requestSpeechRecognizerPermissionsAsync()).granted;
}

export function supportsOnDevice(): boolean {
  return M.supportsOnDeviceRecognition();
}
