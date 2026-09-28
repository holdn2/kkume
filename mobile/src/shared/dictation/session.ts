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
 * **시작 직후로 한정한다.** 한참 말한 뒤의 오류에서 녹음기를 바꾸면 그 WAV가 기록에서 떨어진다.
 *
 * **넘어갈 때 그 짧은 WAV(최대 3초)는 기록에서 떨어진다** — 새 m4a가 `audio_path`를 차지한다.
 * 파일은 폰에 남는다. 절대 규칙 2의 예외로 **사용자가 허용했다**(2026-09-26, 문서 052 06장 D):
 * 기기 언어 · 기기 안 인식을 먼저 확인한 뒤에도 모델이 없을 때만 생기는 드문 경우이고,
 * 대개 말하기 전의 소리다. 기록을 둘로 가르거나 녹음을 끊는 쪽보다 낫다고 판단했다
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
    // 안 주면 playAndRecord · **measurement**로 연다(ExpoSpeechRecognizer.swift:625-628). measurement 는
    // 입력 처리를 최소로 해 마이크 자동 음량 보정이 꺼지고, WAV 가 옛 m4a(expo-audio, default 모드)보다
    // 훨씬 작게 녹음됐다(2026-09-26 기기, S22). 스피커로 재생 · 블루투스 입력은 라이브러리 기본과 같게 둔다
    iosCategory: {
      category: 'playAndRecord',
      categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
      mode: 'default',
    },
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
  /**
   * `starting` = `start()`를 불렀고 파일이 아직 안 열렸다. **이 사이에 부른 stop · abort는 라이브러리에
   * 닿지 않는다** — 라이브러리의 start는 여러 번 await 하는 Task라, 인식기가 아직 없으면 멈출 것이 없어
   * 그냥 지나가고 그 뒤에 녹음이 시작된다(`ExpoSpeechRecognitionModule.swift:180~240 · :366~384`).
   * 그래서 요청을 `pending`에 적어 두고 파일이 열리는 순간 끊는다(검증 레인 C 지적 1, 테스트 S16~S19)
   */
  let phase: 'idle' | 'starting' | 'open' | 'ended' = 'idle';
  let pending: 'stop' | 'abort' | null = null;
  /** 정지를 두 번 눌러도 같은 끝을 준다(S20) */
  let finishing: Promise<DictationEnd> | null = null;

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

  /** 돌고 있는 인식을 멈춘다. stop 은 마지막 결과를 기다리고, 오래 걸리면 abort 로 끊는다 */
  const halt = (kind: 'stop' | 'abort') => {
    if (kind === 'abort') {
      M.abort();
      return;
    }
    M.stop();
    deps.setTimer(() => {
      if (phase === 'open') M.abort();
    }, STOP_GRACE_MS);
  };

  const start = (handlers: DictationHandlers) =>
    new Promise<string>((resolve, reject) => {
      drop();
      text = EMPTY_DICTATION;
      uri = null;
      lastError = null;
      waiter = null;
      pending = null;
      finishing = null;
      phase = 'starting';
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
          phase = 'open';
          view.onRecording(true);
          // 경로는 멈추라는 요청이 있었어도 돌려준다 — 파일은 이미 생겼고, 기록이 그것을 가리켜야 한다(절대 규칙 2)
          resolve(e.uri);
          // 기다리는 쪽이 이미 시간이 다 돼 떠났으면 마지막 결과를 기다릴 이유가 없다 — 곧바로 끊는다
          if (pending) halt(waiter ? pending : 'abort');
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
          phase = 'ended';
          view.onRecording(false);
          view.onLevel(0);
          // 파일도 오류도 없이 끝났으면 부르는 쪽이 녹음기로 넘어가도록 알린다
          if (!opened) fail(new Error('받아쓰기가 시작되지 못했습니다'));
          void wrapUp().then((end) => {
            const w = waiter;
            waiter = null;
            if (w) return w(end);
            // 멈추라고 해 둔 끝이다(기다리던 쪽은 시간이 다 돼 먼저 끝났다). 예기치 않은 끝이 아니다
            if (!opened || pending) return;
            const early = deps.now() - startedAt < FALLBACK_WINDOW_MS;
            const reason = lastError ?? 'ended';
            if (early && !end.text && FALLBACK_ERRORS.has(reason)) handlers.onFallback(reason);
            else handlers.onEnded(end, reason);
          });
        }),
      ];

      M.start(startOptions(deps.documentDirectory));
    });

  const finishWith = (kind: 'stop' | 'abort'): Promise<DictationEnd> => {
    if (finishing) {
      // 정지 중에 abort 가 오면(정지 직후 잠금 · 홈) 마지막 결과를 기다리지 않고 곧바로 끊는다.
      // 앱이 정지되면 유예 타이머도 돌지 않아 WAV 헤더를 못 쓴다(052 T7, 검증 레인 C 2차 B-1 · S21)
      if (kind === 'abort') {
        if (phase === 'open') M.abort();
        else if (phase === 'starting') pending = 'abort';
      }
      return finishing;
    }
    if (phase === 'idle' || phase === 'ended') return wrapUp();
    finishing = new Promise<DictationEnd>((resolve) => {
      let done = false;
      const once = (end: DictationEnd) => {
        if (done) return;
        done = true;
        resolve(end);
      };
      waiter = once;
      if (phase === 'open') halt(kind);
      else pending = kind;
      // `end`가 끝내 안 오면 있는 것으로 끝낸다. 정지 버튼이 멈춘 채 남지 않게.
      // 파일이 열리기 전이었으면 `pending`이 남아 있어, 나중에 열려도 그때 끊는다(S19)
      deps.setTimer(() => {
        if (done) return;
        waiter = null;
        void wrapUp().then(once);
      }, END_TIMEOUT_MS);
    });
    return finishing;
  };

  return {
    start,
    stop: () => finishWith('stop'),
    abort: () => finishWith('abort'),
    /**
     * 화면을 떠날 때. **돌고 있으면 끊는다.** 파일이 열리기 전이면 듣기를 놓지 않고 남겨 두었다가
     * 열리는 순간 끊는다 — 지금 놓으면 그 뒤에 시작된 녹음을 멈출 길이 없다(S17)
     */
    dispose: () => {
      if (phase === 'starting') {
        pending = 'abort';
        return;
      }
      const live = phase === 'open';
      drop();
      if (live) M.abort();
    },
    startedAt: () => startedAt,
  };
}

export type DictationSession = ReturnType<typeof createDictationSession>;
