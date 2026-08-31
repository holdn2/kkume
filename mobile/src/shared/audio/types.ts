export type RecordingResult = {
  /** 저장된 파일 경로. 가짜 구현에서는 null이다 */
  uri: string | null;
  durationMs: number;
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
