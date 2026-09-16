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
  /**
   * 낮에 확인을 마친 시각. null이면 아직 안 본 기록이다.
   *
   * 새벽에는 교정을 시키지 않는다(절대 규칙 7). 받아만 두고 낮에 LOG-3에서 다듬게
   * 미루는데, **무엇이 아직 안 다듬어졌는지**를 알려면 이 값이 필요하다.
   */
  reviewedAt: string | null;
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
 * 서버에서 내려온 기록 중 **로컬이 받아 적는 부분**.
 *
 * 서버의 `DreamView`에는 `audioUrl`·`sttStatus`·`clientUpdatedAt`도 있지만
 * 여기 없다. 앞의 둘은 로컬의 같은 이름 칸과 뜻이 달라 덮으면 안 되고,
 * 마지막은 서버가 충돌 판정에 쓰는 값이라 기기가 되받을 이유가 없다.
 */
export type ServerDream = {
  id: string;
  recordedAt: string;
  title: string | null;
  text: string | null;
  durationMs: number | null;
  reviewedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  /**
   * **그 버전을 만든 기기의 시각**(서버 응답의 `clientUpdatedAt`). 로컬 `updated_at`과
   * `synced_at` 둘 다에 이 값이 들어간다.
   *
   * 서버 응답의 `updatedAt`(서버 시계)을 쓰지 않는다. 한때 그걸 `updated_at`에 넣고
   * `synced_at`에는 기기 시각을 넣었는데, **두 시계를 섞어 비교하는 순간** 서버 시계가
   * 조금만 빨라도 같은 기록이 매 회차 오갔다(재현 테스트 C). 서버 시각은 마이크로초
   * 6자리라 기기의 3자리와 문자열로 비교하면 순서까지 뒤집혔다(C2).
   */
  clientUpdatedAt: string;
};

/** 올린 기록 한 건 — **보낸 그 버전의** `updatedAt`까지 들고 다닌다 */
export type SentVersion = { id: string; updatedAt: string };

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

  /**
   * 서버에 아직 못 올린 것. `syncedAt`이 없거나 **그 뒤에 고쳐진** 것이다.
   *
   * 지워진 것도 포함한다 — soft delete는 서버에도 가야 하는 변경이라,
   * 빼면 한쪽에서 지운 기록이 다른 기기에 영영 남는다.
   */
  listUnsynced(limit?: number): Promise<Dream[]>;

  /**
   * 올린 것이 받아들여졌다고 표시한다. **보낸 그 버전일 때만** 표시한다.
   *
   * `synced_at`에는 표시한 순간의 시각이 아니라 **보낸 `updatedAt`을** 넣는다.
   * 그러면 "깨끗하다"가 `updated_at = synced_at`이 되고, 요청이 떠 있는 동안 사용자가
   * 고쳐서 `updated_at`이 바뀌었으면 조건에 안 맞아 표시되지 않고 다음 회차에 다시 나간다.
   * 표시 시각을 넣었을 때는 그 수정이 "올라간 것"으로 묻혔다(재현 테스트 A).
   */
  markSynced(sent: SentVersion[]): Promise<void>;

  /**
   * 서버에서 받은 기록을 반영한다. 없으면 만들고, 있으면 **로컬이 깨끗하거나
   * 서버 쪽 버전이 로컬 수정보다 늦을 때만** 덮는다 — 서버가 올리기를 판정하는 규칙
   * (`clientUpdatedAt`이 늦은 쪽이 이긴다)과 같다.
   *
   * 조건 없이 덮었을 때는 로컬이 더 늦게 고친 것(요청이 떠 있는 동안 고친 것 · 거절된 것 ·
   * 100건 상한에 밀린 것)이 서버의 옛 내용으로 조용히 사라졌다(재현 테스트 B1 · B2 · B3).
   * 반대로 "깨끗할 때만"으로 막으면 기기 둘에서 서버 쪽이 이겼을 때 영영 안 맞춰졌다 —
   * 남긴 행은 다음 올리기에서 `skipped`로 깨끗해지지만 이미 `since`를 지나 다시 내려오지
   * 않는다(B4).
   *
   * **`audioPath`와 `sttStatus`는 건드리지 않는다.** 서버의 `audioUrl`은 S3 주소이고
   * 로컬 `audioPath`는 이 기기의 파일 경로라 **같은 자리가 아니다.** 덮으면
   * 원본 오디오 참조가 사라진다(절대 규칙 2). 서버도 같은 이유로 반대 방향을 막아 뒀다.
   */
  upsertFromServer(d: ServerDream): Promise<void>;

  /**
   * 한 줄짜리 설정. 없으면 null.
   *
   * 꿈 기록과 같은 저장소에 두는 이유는 하나다 — **네이티브 모듈을 늘리지 않으려고.**
   * 값 하나 때문에 AsyncStorage를 들이면 빌드를 한 번 먹는다.
   */
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

/** 설정 키는 여기서만 만든다. 문자열을 화면에 흩뿌리면 오타가 조용히 새 키가 된다 */
export const SETTINGS = {
  /** 온보딩을 끝냈는가. 값이 있으면 끝낸 것이고, 담긴 것은 끝낸 시각이다 */
  onboardedAt: 'onboarded_at',
  /**
   * 서버에서 마지막으로 받아간 지점. `{ since, cursor }`를 JSON 하나로 둔다 —
   * 다음 `pull`에 둘을 그대로 넘긴다.
   *
   * **둘을 따로 저장하지 않는다.** 서버는 `since`와 `cursor`를 짝으로 읽으므로,
   * 한쪽만 쓰고 앱이 죽으면 새 `since`에 옛 `cursor`가 붙어 같은 시각의 행 일부를
   * 영영 못 받는다. 설정 한 줄은 한 번에 쓰인다.
   *
   * **비어 있으면 처음부터 받는다** — 기기를 바꿨거나 앱을 다시 깐 경우다.
   * 값을 함부로 앞당기면 그 사이 변경을 영영 못 받으므로,
   * **한 페이지를 다 반영한 뒤에만** 옮긴다.
   */
  syncPosition: 'sync_position',
} as const;

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

/**
 * 시각 문자열을 `nowIso()`와 같은 모양(밀리초 3자리)으로 맞춘다.
 *
 * **로컬 `updated_at` · `synced_at`은 문자열로 비교된다**(`listUnsynced`). 자릿수가 섞이면
 * `"…03.024900Z" > "…03.024Z"`처럼 시각으로는 참인 것이 문자열로는 거짓이 된다.
 * 서버는 소수부를 0 · 3 · 6자리로 주므로(Java `Instant`) 들어올 때 한 모양으로 맞춘다.
 *
 * `Date.parse`를 쓰지 않는다. 6자리 소수부를 받아 주는지는 JS 엔진마다 다르다.
 */
export function toMillisIso(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${(m[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`;
}
