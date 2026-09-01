/**
 * 로컬 기록 스키마.
 *
 * 계획서 09장의 서버 `dreams`를 미러링하고 `syncedAt` 하나를 더한 것이다.
 * **서버와 컬럼 이름을 어긋나게 두지 않는다** — 5주차에 동기화를 붙일 때
 * 매핑 표를 따로 들고 다니게 되고, 그 표가 틀리면 기록이 조용히 사라진다.
 */

export type SttStatus = 'pending' | 'done' | 'failed';

export type Dream = {
  id: string;
  /** 로그인 전에는 null이다. 서버에 올라갈 때 채워진다 */
  userId: string | null;
  /** 실제로 꿈을 적은 시각. `createdAt`과 다를 수 있다(나중에 손으로 고칠 때) */
  recordedAt: string;
  title: string | null;
  text: string | null;
  /**
   * 로컬 오디오 파일 경로. 서버의 `audio_url`에 대응한다.
   *
   * **선택이 아니라 필수다.** STT가 틀려도 원본이 있으면 복원되고,
   * 없으면 STT 실패가 곧 기록 소실이 된다 (절대 규칙 2).
   */
  audioPath: string | null;
  /**
   * 녹음 길이(ms). 텍스트 기록이거나 v2 이전에 저장된 것은 null이다.
   *
   * **0으로 채우지 않는다.** 이미 저장된 기록의 길이는 되찾을 방법이 없어서,
   * 0을 넣으면 "0초짜리 녹음"이라는 거짓이 남는다. null은 `길이 모름`으로 그린다.
   */
  durationMs: number | null;
  sttStatus: SttStatus;
  /** 태깅 기능은 보류다. 컬럼만 확보해 두고 전부 null로 둔다 */
  emotion: string | null;
  keywords: string | null;
  characters: string | null;
  createdAt: string;
  updatedAt: string;
  /** soft delete. 실제로 지우지 않는다 — 커뮤니티 참조가 남아 있을 수 있다 */
  deletedAt: string | null;
  /** null이면 아직 서버에 안 올라갔다는 뜻이다 */
  syncedAt: string | null;
};

export type DreamDraft = {
  recordedAt?: string;
  title?: string | null;
  text?: string | null;
  audioPath?: string | null;
  durationMs?: number | null;
  sttStatus?: SttStatus;
};

export type DreamPatch = Partial<Omit<Dream, 'id' | 'createdAt'>>;

/**
 * 화면에 보여주는 동기화 상태.
 *
 * `실패`는 아직 없다. 동기화 자체가 5주차에 붙으므로, 실패를 지금 만들면
 * **한 번도 나지 않는 상태를 화면에 그리게 된다.** 그때 마이그레이션으로 추가한다.
 */
export type SyncState = 'synced' | 'pending';

export function syncStateOf(d: Dream): SyncState {
  return d.syncedAt ? 'synced' : 'pending';
}

export type ListOptions = {
  /** 기본은 지워진 것을 뺀다 */
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * 저장소 인터페이스.
 *
 * SQL이 아니라 **이 모양**을 화면이 쓴다. 그래서 네이티브 모듈이 없는 빌드에서는
 * 메모리 구현으로 갈아끼워 화면과 흐름을 그대로 검증할 수 있다.
 */
export interface DreamRepo {
  init(): Promise<void>;
  create(draft: DreamDraft): Promise<Dream>;
  update(id: string, patch: DreamPatch): Promise<Dream | null>;
  get(id: string): Promise<Dream | null>;
  list(options?: ListOptions): Promise<Dream[]>;
  softDelete(id: string): Promise<void>;
  /** 검수용. 화면에서 부르지 않는다 */
  clear(): Promise<void>;
}

/**
 * 시간순으로 정렬되는 id. 앞이 시각이라 정렬 키로 그대로 쓸 수 있고,
 * 뒤 난수가 같은 밀리초에 두 건이 생기는 경우를 막는다.
 */
export function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function nowIso() {
  return new Date().toISOString();
}
