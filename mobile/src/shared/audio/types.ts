export type RecordingResult = {
  /** 저장된 파일 경로. 가짜 구현에서는 null이다 */
  uri: string | null;
  durationMs: number;
};

/**
 * 재생기. 녹음기와 같은 이유로 인터페이스를 먼저 두고 구현을 갈아끼운다 —
 * `expo-audio`가 없는 빌드에서도 화면과 흐름을 검증할 수 있어야 한다.
 */
export type Player = {
  playing: boolean;
  /** 0~1. 막대가 이것만 본다 */
  progress: number;
  positionMs: number;
  /** 파일에서 읽은 길이. 못 읽으면 기록에 저장된 값으로 물러선다 */
  durationMs: number;
  toggle: () => void;
  /** 0~1 */
  seek: (ratio: number) => void;
};

export type Recorder = {
  isRecording: boolean;
  durationMs: number;
  /** 0~1로 정규화한 입력 크기. 파형이 이것만 본다 */
  level: number;
  /** 권한이 없으면 던진다. 부르는 쪽이 화면에 남겨야 한다 */
  start: () => Promise<void>;
  stop: () => Promise<RecordingResult>;
};

/**
 * 마이크 레벨은 dB로 온다(대략 -160 ~ 0). 그대로 쓰면 파형이 거의 안 움직인다 —
 * 조용한 방의 말소리가 -40 근처에 몰려 있기 때문이다.
 * **-60을 바닥으로 잘라** 그 위를 0~1로 편다.
 */
export function dbToLevel(db?: number) {
  if (db == null || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/**
 * 녹음 길이를 `mm:ss`로. 길이를 모르면(v2 이전 기록·텍스트 기록) `--:--`다.
 *
 * **0으로 대신 그리지 않는다** — "0초짜리 녹음"과 "길이를 모르는 녹음"은
 * 사용자에게 전혀 다른 것이고, 앞의 것은 녹음이 실패했다는 뜻으로 읽힌다.
 */
export function mmss(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms)) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
