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
  /**
   * 녹음 파일을 서버(S3)에 올린 시각. null이면 아직이다.
   * 서버 `audioUrl`을 받아 적는 대신 "올렸는가"만 둔다 — 저쪽은 S3 위치, 이쪽은 기기 경로다
   */
  audioUploadedAt: string | null;
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
  /**
   * 꿈 로그 검색. 제목이나 본문에 이 말이 든 기록만. 앞뒤 공백은 자르고, 비면 거르지 않는다.
   * **글자 그대로 찾는다** — `%` · `_`도 와일드카드가 아니다(그래서 LIKE 가 아니라 instr)
   */
  query?: string;
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
  /**
   * 지운 것을 뺀 개수와 그중 미확인(`reviewed_at` 없음). 검색어가 있으면 그 결과만 센다.
   * 목록을 쪽으로 나눠 읽으므로 「N건 · 미확인 N건」은 읽은 행이 아니라 이것으로 센다
   */
  counts(query?: string): Promise<{ total: number; unread: number }>;
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
   * 녹음 파일을 아직 서버에 안 올린 기록. **네 조건을 모두** 만족해야 한다 —
   * 녹음이 있고(`audioPath`), 끝난 녹음이고(`durationMs`, 없으면 서버가 `recording_unfinished`),
   * 지워지지 않았고, **행이 서버에 이미 올라가 있어야** 한다(`syncedAt` — 없으면 `dream_not_found`).
   * 문서 039 ②는 ①(행 올리기) 뒤에만 된다.
   */
  listAudioPending(limit?: number): Promise<Dream[]>;

  /** 녹음 파일이 서버에 있다고 표시한다. 이 기기가 올렸든 받기에서 `audioUrl`을 봤든 같다 */
  markAudioUploaded(id: string, at: string): Promise<void>;

  /**
   * 계정을 지운 뒤 — **"올렸음" 표시(`syncedAt` · `audioUploadedAt`)를 지운다**(이슈 #65 · 서버 계약 064).
   * 서버의 기록은 실제로 지워졌는데 폰에 "이미 올렸다"가 남으면, 새 계정으로 로그인했을 때 그 기록들이
   * 영영 안 올라간다. 지우면 처음부터 다시 올라간다(서버에 하나도 없으므로 겹치지 않음).
   * **폰에서 지운 기록은 건드리지 않는다** — 새 계정에 지운 기록을 올릴 까닭이 없다. 내용 · 녹음 경로는 그대로다
   */
  clearUploadMarks(): Promise<void>;

  /**
   * 변환 상태만 바꾼다. **`updatedAt`을 올리지 않는다** — 로컬 `sttStatus`는 "이 폰에서
   * 합쳤음" 표시라 서버로 올릴 변경이 아니다(문서 039 C3). 본문을 합친 경우는 `update`로
   * 올려서 다음 회차에 나가게 한다
   */
  setSttStatus(id: string, status: SttStatus): Promise<void>;

  /**
   * 녹음 파일 경로만 바꾼다. **`updatedAt`을 올리지 않는다** — 서버는 `audioPath`를 받지 않아
   * 올릴 변경이 아니다. 캐시 폴더에서 옮기거나 바뀐 앱 컨테이너 경로를 고칠 때 쓴다(`audio/relocate.ts`)
   */
  setAudioPath(id: string, path: string): Promise<void>;

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
  /**
   * 커뮤니티에서 차단한 사람. `[{ id, nickname }]` JSON. 앱에서 그들의 글 · 댓글을 거른다
   * (계획서 001). 닉네임을 같이 두는 이유는 차단 목록 화면에서 서버 없이 이름을 보이려는 것이다
   */
  blockedUsers: 'blocked_users',
  /**
   * 꿈 로그 탭에서 「받아쓰기 켜기」를 한 번 물었는가. 값이 있으면 다시 띄우지 않는다 —
   * 거절한 사람에게 매번 띄우면 그것도 결정이 된다(문서 052 03장)
   */
  dictationAsked: 'dictation_asked',
  /**
   * 가입 동의(이슈 #71). `{ version, at }` JSON — 어느 버전 문서에 언제 동의했는가.
   * 버전이 바뀌면 다시 묻는다(`@features/consent`). **로그아웃 · 계정 삭제 때 지운다** — 동의는 계정의 것이라,
   * 같은 폰에서 다른 계정(또는 지운 뒤 새 계정)으로 로그인하면 그 계정이 다시 동의해야 한다
   */
  consent: 'consent',
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
 * `now`가 `floors`의 어느 것보다도 뒤가 아니면 그 뒤로 1ms씩 민다.
 *
 * **같은 밀리초 안의 수정도 "더 늦다"가 되게 한다.** 동기화가 `updated_at ≤ synced_at`을
 * "깨끗하다"로 읽는데, 받기가 `synced_at`을 쓴 직후 같은 밀리초에 고치면(변환문 합치기가
 * 정확히 그렇다) 두 값이 같아져 그 수정이 올릴 목록에서 빠진다. 메모리 저장소로 돌린
 * 재현 테스트 H6에서 잡혔고, SQLite는 4ms 차이로 지나갔을 뿐이었다(2026-09-19)
 */
export function afterIso(now: string, ...floors: (string | null | undefined)[]): string {
  let t = now;
  for (const f of floors) {
    if (f != null && t <= f) t = new Date(Date.parse(f) + 1).toISOString();
  }
  return t;
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
