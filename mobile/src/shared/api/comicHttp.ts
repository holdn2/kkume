import { type ApiError, request } from './client';
import type { Comic, ComicApi, NewComic } from './comic';

/**
 * 꿈 만화 — 진짜 서버(계약 081 01 · 02장, 서버 이슈 #96 · PR #97, 2026-10-11 배포 · 문서 083).
 *
 * 전부 로그인이 필요한 요청이다. 토큰이 없으면 보내지 않고 서버와 같은 `401 unauthorized` 를 여기서 던진다 —
 * 만료된 토큰을 붙이면 어차피 401 이다(커뮤니티 `communityHttp` 와 같은 규칙).
 *
 * - `GET /api/comics/{id}` 의 `404 comic_not_found`(남의 것 · 지운 것 · 없는 것)는 화면이 쓰는 null 로 바꾼다
 * - 나머지 오류는 `request()` 가 준 `ApiError` 그대로다 — `409 comic_in_progress` 의 `comicId`,
 *   `429 comic_daily_limit` 의 `resetAt` 은 `data` 에 있다
 */
export function createHttpComic(auth: { token: () => Promise<string | null> }): ComicApi {
  const call = async <T>(path: string, method = 'GET', body?: unknown) => {
    const token = await auth.token();
    if (!token) throw { code: 'unauthorized', message: '로그인이 필요합니다', status: 401 } as ApiError;
    return request<T>(path, { method, body, token });
  };
  const id = encodeURIComponent;

  return {
    create: (input: NewComic) =>
      call<Comic>('/api/comics', 'POST', {
        dreamId: input.dreamId,
        title: input.title,
        dreamText: input.dreamText,
        style: input.style,
      }),

    get: (comicId) =>
      call<Comic>(`/api/comics/${id(comicId)}`).catch((e: ApiError) => {
        if (e?.status === 404) return null;
        throw e;
      }),

    async forDream(dreamId) {
      const res = await call<{ items: Comic[] }>(`/api/comics?dreamId=${id(dreamId)}`);
      return res?.items ?? [];
    },

    remove: (comicId) => call<void>(`/api/comics/${id(comicId)}`, 'DELETE'),
  };
}
