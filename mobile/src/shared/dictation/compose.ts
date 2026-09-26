/**
 * 녹음하면서 받아쓰기의 순수 로직 — 네이티브 없이 테스트한다(`scripts/dictation`).
 *
 * 이벤트 모양의 근거는 `expo-speech-recognition@57.1.0` iOS 소스다(문서 052 02장).
 */

/** 받아쓴 글. 확정된 구간과 지금 말하는 중인 구간 하나 */
export type DictationState = { committed: string[]; interim: string };

export const EMPTY_DICTATION: DictationState = { committed: [], interim: '' };

/**
 * `result` 이벤트 하나를 먹인다.
 *
 * - **확정된 구간은 이어 붙이고, 진행 중 구간은 매번 갈아 끼운다.** iOS 18 은 한 세션에 확정이
 *   여러 번 오고 그 뒤의 말은 새 구간으로 온다. iOS 17 이하는 끝까지 한 구간이 자라다 끝에 확정된다
 * - iOS 18 은 두 번째 구간부터 앞에 공백을 붙여 준다 — 잘라 내고 이을 때 공백 하나로 잇는다
 * - **끝의 진짜 확정이 마지막 구간을 되풀이할 수 있다**(M:502). 진행 중 구간이 비어 있을 때 온
 *   확정이 직전 확정과 같으면 버린다. 사이에 다른 구간이 있었으면 실제로 두 번 말한 것이라 둔다
 * - 빈 결과는 아무것도 바꾸지 않는다 — 진행 중 구간을 지우면 방금 한 말이 사라진다
 */
export function applyResult(s: DictationState, isFinal: boolean, transcript: string): DictationState {
  const t = transcript.trim();
  if (!t) return s;
  if (!isFinal) return { committed: s.committed, interim: t };
  const last = s.committed[s.committed.length - 1];
  if (!s.interim && last === t) return s;
  return { committed: [...s.committed, t], interim: '' };
}

/** 확정 없이 끝났을 때(abort · 예기치 않은 끝) 진행 중 구간을 확정으로 넘긴다 */
export function settle(s: DictationState): DictationState {
  if (!s.interim) return s;
  return { committed: [...s.committed, s.interim], interim: '' };
}

/** 저장할 글. 진행 중 구간까지 넣는다 — 도중에 죽어도 거기까지는 남는다(절대 규칙 1) */
export function dictatedText(s: DictationState): string {
  return [...s.committed, s.interim].filter(Boolean).join(' ');
}

export type EngineInput = {
  /** 이 빌드에 모듈이 있는가(`requireOptionalNativeModule`) */
  hasModule: boolean;
  speechGranted: boolean;
  micGranted: boolean;
  /** 기기 기본 언어가 한국어인가. `supportsOnDeviceRecognition()`이 이 언어를 보기 때문이다(052 T3) */
  localeKo: boolean;
  onDevice: boolean;
};

export type EngineReason = 'ok' | 'module' | 'speech-permission' | 'mic-permission' | 'locale' | 'on-device';

/**
 * 이번 녹음을 받아쓰기로 할지, 지금의 녹음기(`expo-audio`)로 할지.
 *
 * **하나라도 아니면 받아쓰기를 부르지 않는다.** 온디바이스를 못 하는 기기에서 부르면
 * 라이브러리가 조용히 애플 서버로 보낸다(048 · `ExpoSpeechRecognizer.swift:588`).
 * 권한은 **묻지 않고 조회만 한 값**이다 — 새벽에 권한 창을 띄우지 않는다(절대 규칙 7).
 * 떨어진 조건을 이유로 남겨 진단 화면에 보여 준다.
 */
export function pickEngine(i: EngineInput): { engine: 'dictation' | 'audio'; reason: EngineReason } {
  if (!i.hasModule) return { engine: 'audio', reason: 'module' };
  if (!i.speechGranted) return { engine: 'audio', reason: 'speech-permission' };
  if (!i.micGranted) return { engine: 'audio', reason: 'mic-permission' };
  if (!i.localeKo) return { engine: 'audio', reason: 'locale' };
  if (!i.onDevice) return { engine: 'audio', reason: 'on-device' };
  return { engine: 'dictation', reason: 'ok' };
}

const WAV_HEADER_BYTES = 44;
/** 16kHz · 16bit(2바이트) · mono */
const WAV_BYTES_PER_SECOND = 16000 * 2;

/** 라이브러리가 길이를 주지 않아 파일 크기로 잰다(052 T9). 파일이 없으면 null */
export function wavDurationMs(bytes: number | null): number | null {
  if (bytes == null) return null;
  return Math.max(0, Math.round(((bytes - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND) * 1000));
}

/** `volumechange` 값(-2~10)을 파형의 0~1로 편다 */
export function volumeToLevel(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, (v + 2) / 12));
}
