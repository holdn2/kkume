import { type ApiError, request } from './client';
import type {
  Author,
  Comment,
  CommunityApi,
  FeedSort,
  NewPost,
  Page,
  PostDetail,
  PostSummary,
  Profile,
  ReportReason,
  ReportTarget,
} from './community';

/**
 * 커뮤니티 — 진짜 서버(계약 056 03장, 서버 이슈 #60 · PR #61, 2026-09-30 배포).
 *
 * 토큰은 밖에서 받는다(`token()`). **만료된 토큰은 null 로 받아야 한다** — 서버는 토큰을 보냈으면
 * 맞아야 해서 만료 토큰을 붙이면 읽기까지 401 이 된다(056). 그래서:
 * - 읽기(피드 · 글 상세 · 프로필 · 사용자 글)는 토큰이 없으면 없는 채로 보낸다
 * - 쓰기는 토큰이 없으면 보내지 않고 서버와 같은 `401 unauthorized` 를 여기서 던진다
 *
 * 화면이 null 로 받기로 한 것(`post` · `profile` 없음, 로그인 전 `postForDream`)은 여기서 null 로 바꾼다.
 * 나머지 오류는 `request()` 가 준 `ApiError` 그대로다 — `409 already_shared` 의 `postId` 는 `data` 에 있다.
 */
export function createHttpCommunity(auth: { token: () => Promise<string | null> }): CommunityApi {
  const read = async <T>(path: string) => request<T>(path, { token: await auth.token() });

  const write = async <T>(path: string, method: string, body?: unknown) => {
    const token = await auth.token();
    if (!token) throw { code: 'unauthorized', message: '로그인이 필요합니다', status: 401 } as ApiError;
    return request<T>(path, { method, body, token });
  };

  const id = encodeURIComponent;
  const pageQuery = (sort: FeedSort, cursor?: string | null) =>
    `?sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const nullOn404 = <T>(p: Promise<T>) =>
    p.catch((e: ApiError) => {
      if (e?.status === 404) return null;
      throw e;
    });

  return {
    feed: (sort, cursor) => read<Page<PostSummary>>(`/api/community/posts${pageQuery(sort, cursor)}`),

    post: (postId) => nullOn404(read<PostDetail>(`/api/community/posts/${id(postId)}`)),

    createPost: (input: NewPost) => write<PostSummary>('/api/community/posts', 'POST', input),

    async postForDream(dreamId) {
      // 로그인이 필요한 조회다(읽기 허용 목록에 없음). 로그인 전에는 내 글이 있을 수 없다
      const token = await auth.token();
      if (!token) return null;
      const res = await request<{ postId: string | null }>(`/api/community/dreams/${id(dreamId)}/post`, { token });
      return res?.postId ?? null;
    },

    deletePost: (postId) => write<void>(`/api/community/posts/${id(postId)}`, 'DELETE'),

    setLiked: (postId, liked) =>
      write<{ likeCount: number; likedByMe: boolean }>(`/api/community/posts/${id(postId)}/like`, 'PUT', { liked }),

    addComment: (postId, body, parentId) =>
      write<Comment>(`/api/community/posts/${id(postId)}/comments`, 'POST', { body, parentId: parentId ?? null }),

    deleteComment: (commentId) => write<void>(`/api/community/comments/${id(commentId)}`, 'DELETE'),

    report: (target: ReportTarget, reason: ReportReason) =>
      write<void>('/api/community/reports', 'POST', { type: target.type, id: target.id, reason }),

    profile: (userId) => nullOn404(read<Profile>(`/api/users/${id(userId)}/profile`)),

    userPosts: (userId, sort, cursor) =>
      read<Page<PostSummary>>(`/api/users/${id(userId)}/posts${pageQuery(sort, cursor)}`),

    async blocks() {
      const res = await write<{ items: Author[] }>('/api/community/blocks', 'GET');
      return res?.items ?? [];
    },

    block: (userId) => write<void>(`/api/community/blocks/${id(userId)}`, 'PUT'),

    unblock: (userId) => write<void>(`/api/community/blocks/${id(userId)}`, 'DELETE'),

    async setNickname(nickname) {
      // 응답은 `/api/me` 모양(id · nickname · provider · createdAt). 화면은 Author 만 쓴다
      const me = await write<{ id: string; nickname: string }>('/api/me', 'PATCH', { nickname });
      return { id: me.id, nickname: me.nickname };
    },
  };
}
