import { request } from './client';

/**
 * 오디오 업로드와 변환 상태 — 서버 계약은 문서 039(모바일 040에서 수용)이고
 * 응답 모양의 원본은 `server/README.md`의 "오디오와 변환" 절이다.
 *
 * ```
 * ① 기록 행을 동기화로 올린다        (없으면 404 dream_not_found)
 * ② POST /api/dreams/{id}/audio/upload    → 업로드 자리
 * ③ 앱이 uploadUrl 에 파일을 PUT          (headers 를 그대로 붙인다)
 * ④ POST /api/dreams/{id}/audio/complete  → { sttStatus: "pending" }
 * ⑦ GET  /api/dreams/{id}/stt             → 변환 상태와 원문
 * ```
 *
 * **`audioUrl` 은 URL 이 아니다.** `s3://…` 모양의 저장 위치라 열어도 재생되지 않는다.
 * 앱은 `null` 인지만 본다. 재생은 폰에 남아 있는 원본으로 한다(절대 규칙 2).
 */

/** ② 업로드 자리. `headers` 는 서명에 들어가 있어 **그대로** 붙여야 한다 — 다르면 S3 가 403 */
export type UploadSlot = {
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  key: string;
  /** 15분짜리다. 지나면 ②부터 다시 */
  expiresAt: string;
};

/** ⑦ 변환 상태. `text` 는 `done` 일 때만, `error` 는 `failed` 일 때만 채워진다 */
export type SttView = {
  status: string;
  text: string | null;
  error: string | null;
  attempts: number;
  updatedAt: string;
};

const path = (dreamId: string, tail: string) => `/api/dreams/${encodeURIComponent(dreamId)}${tail}`;

/** 녹음 파일 형식(서버 #52 · PR #53). 고르는 규칙은 `@shared/audio/format` */
export type AudioFormat = 'wav';

/**
 * `bytes` 는 올릴 파일의 크기다. 서버가 그 크기로 서명해 다른 크기의 PUT 을 S3 가 거절한다 — 큰 파일을 올려 두고
 * `complete` 를 안 부르는 길을 막는다(서버 #177 · 문서 109). 25MB 를 넘으면 `413 audio_too_large`, 0 이하는
 * `400 invalid_size`. **`Content-Length` 는 직접 붙이지 않는다** — `uploadAsync` 가 붙인다
 */
export function requestUploadSlot(token: string, dreamId: string, format?: AudioFormat, bytes?: number) {
  const body = { ...(format ? { format } : {}), ...(bytes != null ? { bytes } : {}) };
  return request<UploadSlot>(path(dreamId, '/audio/upload'), {
    method: 'POST',
    token,
    ...(Object.keys(body).length > 0 ? { body } : {}),
  });
}

/** **두 번 보내도 된다.** 응답을 못 받았으면 같은 `key` 로 다시 보내면 같은 답이 온다 */
export function completeUpload(token: string, dreamId: string, key: string) {
  return request<{ sttStatus: string }>(path(dreamId, '/audio/complete'), {
    method: 'POST',
    token,
    body: { key },
  });
}

export function fetchStt(token: string, dreamId: string) {
  return request<SttView>(path(dreamId, '/stt'), { token });
}
