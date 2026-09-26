import { ExpoSpeechRecognitionModule as M } from 'expo-speech-recognition';
import { documentDirectory } from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fileSize } from '@shared/audio';

import {
  applyResult,
  dictatedText,
  EMPTY_DICTATION,
  settle,
  volumeToLevel,
  wavDurationMs,
  type DictationState,
} from './compose';
import type { DictationEnd, DictationHandlers, Dictator } from './types';

/**
 * **이 파일은 모듈이 있는 빌드에서만 require된다.** `expo-speech-recognition`은 import되는 순간
 * `requireNativeModule`을 불러, 모듈이 없는 빌드에서 읽으면 앱이 통째로 죽는다(절대 규칙 10).
 * 판별은 `index.ts`가 한다.
 */

/**
 * 시작 직후에 이 오류로 끝나면 받아쓰기를 못 하는 기기다 — 모델 없음(102) · 받아쓰기 꺼짐(201)은
 * `service-not-allowed`, 권한 거절은 `not-allowed`(`ExpoSpeechRecognitionModule.swift:576`).
 * **시작 직후로 한정한다.** 한참 말한 뒤의 오류에서 녹음기를 바꾸면 그 WAV가 기록에서 떨어진다
 */
const FALLBACK_ERRORS = new Set(['service-not-allowed', 'not-allowed', 'language-not-supported']);
const FALLBACK_WINDOW_MS = 3000;

/** 마지막 결과를 이만큼 기다린다. 넘으면 abort로 끊는다 — 파일은 그때 닫힌다 */
const STOP_GRACE_MS = 2000;
/** `end`가 끝내 안 오면 이만큼 뒤에 있는 것으로 끝낸다. 정지 버튼이 멈춘 채로 남지 않게 */
const END_TIMEOUT_MS = 4000;

export function useNativeDictator(): Dictator {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  const text = useRef<DictationState>(EMPTY_DICTATION);
  const uri = useRef<string | null>(null);
  const startedAt = useRef(0);
  const lastError = useRef<string | null>(null);
  const subs = useRef<{ remove: () => void }[]>([]);
  /** 부르는 쪽이 멈춘 경우 `end`를 기다리는 자리. 없으면 예기치 않은 끝이다 */
  const waiter = useRef<((end: DictationEnd) => void) | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setDurationMs(Date.now() - startedAt.current), 100);
    return () => clearInterval(t);
  }, [isRecording]);

  // 화면을 떠나면 듣기를 놓고, **아직 돌고 있으면 끊는다.** 녹음은 화면이 먼저 마무리했어야 하지만,
  // 시작이 끝나기 전에 나가면(파일 경로를 받기 전) 마이크가 켜진 채 남는다
  useEffect(
    () => () => {
      const live = subs.current.length > 0;
      subs.current.forEach((s) => s.remove());
      subs.current = [];
      if (live) M.abort();
    },
    [],
  );

  /** 파일 크기로 길이를 잰다(052 T9). 못 재면 JS 시계로 물러선다 */
  const wrapUp = useCallback(async (): Promise<DictationEnd> => {
    text.current = settle(text.current);
    const clock = startedAt.current ? Date.now() - startedAt.current : 0;
    const bytes = uri.current ? await fileSize(uri.current) : null;
    return { uri: uri.current, durationMs: wavDurationMs(bytes) || clock, text: dictatedText(text.current) };
  }, []);

  const start = useCallback(
    (handlers: DictationHandlers) =>
      new Promise<string>((resolve, reject) => {
        subs.current.forEach((s) => s.remove());
        text.current = EMPTY_DICTATION;
        uri.current = null;
        lastError.current = null;
        waiter.current = null;
        startedAt.current = Date.now();
        let opened = false;

        subs.current = [
          M.addListener('audiostart', (e) => {
            // 파일을 못 만들면 라이브러리는 오류 없이 경로만 비운다(052 T2). 원본 없는 기록은 만들지 않는다
            if (!e.uri) {
              M.abort();
              reject(new Error('녹음 파일을 만들지 못했습니다'));
              return;
            }
            opened = true;
            uri.current = e.uri;
            setDurationMs(0);
            setIsRecording(true);
            resolve(e.uri);
          }),
          M.addListener('result', (e) => {
            text.current = applyResult(text.current, e.isFinal, e.results[0]?.transcript ?? '');
            handlers.onText(dictatedText(text.current), e.isFinal);
          }),
          M.addListener('volumechange', (e) => setLevel(volumeToLevel(e.value))),
          M.addListener('error', (e) => {
            lastError.current = e.error;
            if (!opened) reject(new Error(`${e.error}: ${e.message}`));
          }),
          M.addListener('end', () => {
            subs.current.forEach((s) => s.remove());
            subs.current = [];
            setIsRecording(false);
            setLevel(0);
            if (!opened) return;
            void wrapUp().then((end) => {
              const w = waiter.current;
              waiter.current = null;
              if (w) return w(end);
              const early = Date.now() - startedAt.current < FALLBACK_WINDOW_MS;
              const reason = lastError.current ?? 'ended';
              if (early && !end.text && FALLBACK_ERRORS.has(reason)) handlers.onFallback(reason);
              else handlers.onEnded(end, reason);
            });
          }),
        ];

        M.start({
          lang: 'ko-KR',
          // 부르기 전에 기기가 되는지 이미 확인했다(index.ts). 못 하는 기기에서는 이 값이
          // 조용히 무시되고 애플 서버로 간다(ExpoSpeechRecognizer.swift:588)
          requiresOnDeviceRecognition: true,
          continuous: true,
          interimResults: true,
          addsPunctuation: true,
          recordingOptions: {
            persist: true,
            // 기본값은 캐시 폴더다(052 T1). expo-audio 녹음과 같은 폴더에 둬서 경로 정리가 그대로 걸리게
            outputDirectory: `${documentDirectory}ExpoAudio`,
            // 안 주면 48kHz float32 — 분당 약 11MB. 이 값으로 분당 1.92MB
            outputSampleRate: 16000,
            outputEncoding: 'pcmFormatInt16',
          },
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        });
      }),
    [wrapUp],
  );

  const finishWith = useCallback(
    (kind: 'stop' | 'abort') =>
      new Promise<DictationEnd>((resolve) => {
        if (!uri.current) {
          void wrapUp().then(resolve);
          return;
        }
        let done = false;
        const settleOnce = (end: DictationEnd) => {
          if (done) return;
          done = true;
          resolve(end);
        };
        waiter.current = settleOnce;
        if (kind === 'stop') {
          M.stop();
          setTimeout(() => {
            if (!done) M.abort();
          }, STOP_GRACE_MS);
        } else {
          M.abort();
        }
        setTimeout(() => {
          if (!done) void wrapUp().then(settleOnce);
        }, END_TIMEOUT_MS);
      }),
    [wrapUp],
  );

  const stop = useCallback(() => finishWith('stop'), [finishWith]);
  const abort = useCallback(() => finishWith('abort'), [finishWith]);

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
