import { request } from './client';

/**
 * 서버의 `SyncController`와 1:1로 맞춘 계약이다.
 *
 * **`audioUrl`은 여기서 안 받는다.** 서버가 주기는 하는데 로컬의 `audioPath`와
 * 같은 자리가 아니다 — 저쪽은 S3 주소, 이쪽은 이 기기의 파일 경로다.
 * 섞으면 원본 오디오 참조가 사라진다(절대 규칙 2). S3 업로드가 붙는 날 따로 다룬다.
 */

/** 한 번에 보낼 수 있는 최대. 서버의 `SyncService.MAX_BATCH`와 같아야 한다 */
export const MAX_BATCH = 100;

export type DreamPayload = {
  id: string;
  recordedAt: string;
  title: string | null;
  text: string | null;
  durationMs: number | null;
  reviewedAt: string | null;
  deletedAt: string | null;
  /**
   * **이것이 없으면 서버가 거절한다**(`missing_updated_at`).
   * 어느 쪽이 최신인지 판정하는 유일한 근거라, 서버는 추측해서 덮어쓰지 않는다.
   */
  updatedAt: string;
};

export type DreamView = {
  id: string;
  recordedAt: string;
  title: string | null;
  text: string | null;
  audioUrl: string | null;
  sttStatus: string;
  durationMs: number | null;
  reviewedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * 그 버전을 만든 **기기의** 시각. 운영 스키마에서 NOT NULL이다(서버 문서 032).
   * **보낸 문자열 그대로 돌아오지는 않는다** — 서버가 Instant로 다시 써서 `…57.000Z`가
   * `…57Z`로 온다(서버 문서 035). 로컬에 적을 때 `toMillisIso`로 모양을 맞춘다.
   * `updatedAt`은 서버 시계라 커서용이고, 로컬에 적는 것은 이 값이다
   */
  clientUpdatedAt: string;
};

/** `saved` · `skipped` · `rejected`. 거절이면 `reason`이 붙는다 */
export type SyncResult = { id: string; status: string; reason: string | null };

export type PullResponse = {
  dreams: DreamView[];
  nextSince: string | null;
  nextCursor: string | null;
  hasMore: boolean;
};

export function pullDreams(
  token: string,
  opts: { since?: string | null; cursor?: string | null; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.cursor) q.set('cursor', opts.cursor);
  q.set('limit', String(opts.limit ?? MAX_BATCH));
  return request<PullResponse>(`/api/sync/dreams?${q.toString()}`, { token });
}

export function pushDreams(token: string, dreams: DreamPayload[]) {
  return request<{ results: SyncResult[] }>('/api/sync/dreams', {
    method: 'POST',
    token,
    body: { dreams },
  });
}
