/** 받아쓰기 녹음이 끝났을 때 남는 것 */
export type DictationEnd = {
  /** WAV 파일 경로(`file://…`) */
  uri: string | null;
  durationMs: number;
  /** 받아쓴 글 전부. 진행 중이던 구간까지 확정으로 넘긴 것이다 */
  text: string;
};

export type DictationHandlers = {
  /** 글이 바뀔 때마다. `isFinal`이면 확정 구간이 하나 늘었다 — 부르는 쪽이 곧바로 저장한다 */
  onText: (text: string, isFinal: boolean) => void;
  /**
   * 부르는 쪽이 멈추지 않았는데 세션이 끝났다(인터럽션 · 경로 변경 · 인식 오류).
   * 파일은 멀쩡히 닫혀 있다(`ExpoSpeechRecognizer.swift:554`). `reason`은 마지막 오류 코드
   */
  onEnded: (end: DictationEnd, reason: string) => void;
  /**
   * 시작 직후 받아쓰기를 못 하는 기기로 드러났다(한국어 모델 없음 · 받아쓰기 꺼짐 · 권한 거절).
   * 부르는 쪽은 **같은 기록에** 지금의 녹음기로 넘어간다 — 사용자에게 묻지 않는다(절대 규칙 7)
   */
  onFallback: (reason: string) => void;
};

/**
 * 녹음하면서 받아쓰는 녹음기. `Recorder`(`@shared/audio`)와 같은 자리에 쓰려고 모양을 맞췄다.
 *
 * 구현이 둘이다 — 모듈이 있는 빌드의 진짜(`native.ts`)와, 흐름을 빌드 없이 보려는 가짜(`fake.ts`).
 */
export type Dictator = {
  isRecording: boolean;
  durationMs: number;
  /** 0~1. 파형이 이것만 본다 */
  level: number;
  /**
   * 녹음 파일 경로를 돌려준다 — 받자마자 DB에 못 박아야 한다(절대 규칙 2).
   * **파일을 못 만들면 던진다.** 받아쓰기만 되고 원본이 없는 기록을 만들지 않는다
   */
  start: (handlers: DictationHandlers) => Promise<string>;
  /** 마지막 결과를 기다린 뒤 멈춘다. 오래 걸리면 끊는다 */
  stop: () => Promise<DictationEnd>;
  /** 곧바로 멈추고 파일을 닫는다. 백그라운드로 갈 때 쓴다(문서 052 T7) */
  abort: () => Promise<DictationEnd>;
};
