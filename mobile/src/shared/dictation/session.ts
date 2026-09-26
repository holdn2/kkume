import {
  applyResult,
  dictatedText,
  EMPTY_DICTATION,
  settle,
  volumeToLevel,
  wavDurationMs,
  type DictationState,
} from './compose';
import type { DictationEnd, DictationHandlers } from './types';

/**
 * 받아쓰기 한 번의 흐름 — 라이브러리 이벤트를 받아 시작 · 저장 · 끝을 정한다.
 *
 * **훅(`native.ts`)에서 떼어 낸 이유는 테스트다.** 이 흐름이 틀리면 원본 없는 기록이 생기거나
 * 마이크가 켜진 채 남는데, 네이티브 모듈은 빌드에서만 돈다. 모듈 · 파일 크기 · 시계 · 타이머를
 * 바꿔 끼울 수 있게 두고 `scripts/dictation`이 이벤트 순서를 대본으로 흘려 확인한다.
 *
 * 이벤트 모양과 순서는 `expo-speech-recognition@57.1.0` iOS 소스에서 가져왔다(문서 052 02장).
 */

type Sub = { remove: () => void };

/** 라이브러리 모듈 중 쓰는 부분만 */
export type SpeechModuleLike = {
  addListener: (event: string, listener: (e: never) => void) => Sub;
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
};

export type SessionDeps = {
  module: SpeechModuleLike;
  fileSize: (uri: string) => Promise<number | null>;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => void;
  /** `file:///…/Documents/` 처럼 `/`로 끝나는 앱 문서 폴더 */
  documentDirectory: string;
};

export type SessionView = {
  onRecording: (on: boolean) => void;
  onLevel: (level: number) => void;
};

/**
 * 시작 직후에 이 오류로 끝나면 받아쓰기를 못 하는 기기다 — 모델 없음(102) · 받아쓰기 꺼짐(201)은
 * `service-not-allowed`, 권한 거절은 `not-allowed`(`ExpoSpeechRecognitionModule.swift:576`).
 * **시작 직후로 한정한다.** 한참 말한 뒤의 오류에서 녹음기를 바꾸면 그 WAV가 기록에서 떨어진다
 */
export const FALLBACK_ERRORS = new Set(['service-not-allowed', 'not-allowed', 'language-not-supported']);
export const FALLBACK_WINDOW_MS = 3000;
/** 마지막 결과를 이만큼 기다린다. 넘으면 abort로 끊는다 — 파일은 그때 닫힌다 */
export const STOP_GRACE_MS = 2000;
/** `end`가 끝내 안 오면 이만큼 뒤에 있는 것으로 끝낸다. 정지 버튼이 멈춘 채로 남지 않게 */
export const END_TIMEOUT_MS = 4000;

export function startOptions(documentDirectory: string) {
  return {
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
  };
}

export function createDictationSession(deps: SessionDeps, view: SessionView) {
  const M = deps.module;
  let text: DictationState = EMPTY_DICTATION;
  let uri: string | null = null;
  let startedAt = 0;
  let lastError: string | null = null;
  let subs: Sub[] = [];
  /** 부르는 쪽이 멈춘 경우 `end`를 기다리는 자리. 없으면 예기치 않은 끝이다 */
  let waiter: ((end: DictationEnd) => void) | null = null;

  const drop = () => {
    subs.forEach((s) => s.remove());
    subs = [];
  };

  /** 파일 크기로 길이를 잰다(052 T9). 못 재면 시계로 물러선다 */
  const wrapUp = async (): Promise<DictationEnd> => {
    text = settle(text);
    const clock = startedAt ? deps.now() - startedAt : 0;
    const bytes = uri ? await deps.fileSize(uri) : null;
    return { uri, durationMs: wavDurationMs(bytes) || clock, text: dictatedText(text) };
  };

  const start = (handlers: DictationHandlers) =>
    new Promise<string>((resolve, reject) => {
      drop();
      text = EMPTY_DICTATION;
      uri = null;
      lastError = null;
      waiter = null;
      startedAt = deps.now();
      let opened = false;
      let failed = false;
      const fail = (e: Error) => {
        if (failed || opened) return;
        failed = true;
        reject(e);
      };

      subs = [
        M.addListener('audiostart', (e: { uri: string | null }) => {
          // 파일을 못 만들면 라이브러리는 오류 없이 경로만 비운다(052 T2). 원본 없는 기록은 만들지 않는다
          if (!e.uri) {
            fail(new Error('녹음 파일을 만들지 못했습니다'));
            M.abort();
            return;
          }
          if (failed) return;
          opened = true;
          uri = e.uri;
          view.onRecording(true);
          resolve(e.uri);
        }),
        M.addListener('result', (e: { isFinal: boolean; results: { transcript: string }[] }) => {
          text = applyResult(text, e.isFinal, e.results[0]?.transcript ?? '');
          handlers.onText(dictatedText(text), e.isFinal);
        }),
        M.addListener('volumechange', (e: { value: number }) => view.onLevel(volumeToLevel(e.value))),
        M.addListener('error', (e: { error: string; message: string }) => {
          lastError = e.error;
          fail(new Error(`${e.error}: ${e.message}`));
        }),
        M.addListener('end', () => {
          drop();
          view.onRecording(false);
          view.onLevel(0);
          if (!opened) {
            // 파일도 오류도 없이 끝났다. 부르는 쪽이 녹음기로 넘어가도록 알린다
            fail(new Error('받아쓰기가 시작되지 못했습니다'));
            return;
          }
          void wrapUp().then((end) => {
            const w = waiter;
            waiter = null;
            if (w) return w(end);
            const early = deps.now() - startedAt < FALLBACK_WINDOW_MS;
            const reason = lastError ?? 'ended';
            if (early && !end.text && FALLBACK_ERRORS.has(reason)) handlers.onFallback(reason);
            else handlers.onEnded(end, reason);
          });
        }),
      ];

      M.start(startOptions(deps.documentDirectory));
    });

  const finishWith = (kind: 'stop' | 'abort') =>
    new Promise<DictationEnd>((resolve) => {
      if (!uri || subs.length === 0) {
        void wrapUp().then(resolve);
        return;
      }
      let done = false;
      const once = (end: DictationEnd) => {
        if (done) return;
        done = true;
        resolve(end);
      };
      waiter = once;
      if (kind === 'stop') {
        M.stop();
        deps.setTimer(() => {
          if (!done) M.abort();
        }, STOP_GRACE_MS);
      } else {
        M.abort();
      }
      deps.setTimer(() => {
        if (done) return;
        waiter = null;
        void wrapUp().then(once);
      }, END_TIMEOUT_MS);
    });

  return {
    start,
    stop: () => finishWith('stop'),
    abort: () => finishWith('abort'),
    /** 화면을 떠날 때. **아직 돌고 있으면 끊는다** — 시작이 끝나기 전에 나가면 마이크가 켜진 채 남는다 */
    dispose: () => {
      const live = subs.length > 0;
      drop();
      if (live) M.abort();
    },
    startedAt: () => startedAt,
  };
}

export type DictationSession = ReturnType<typeof createDictationSession>;
