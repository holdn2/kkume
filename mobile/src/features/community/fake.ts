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
} from '@shared/api/community';
import { loadSession } from '@shared/auth/session';

/**
 * 가짜 커뮤니티 서버. **서버 API 가 생기기 전에 화면과 필드를 확정하려고 둔다.**
 *
 * 앱이 떠 있는 동안만 기억한다 — 껐다 켜면 처음 상태로 돌아간다. 저장하지 않는 이유는 이것이
 * 진짜 데이터가 아니라서다. 진짜 서버가 생기면 이 파일을 통째로 걷어 낸다.
 *
 * 흉내 내는 규칙(계약 초안 `@shared/api/community` 주석과 같다):
 * - 신고 3회(서로 다른 사람) → 자동으로 가림. 가린 글 · 댓글은 목록에 안 나온다
 * - 답글의 답글은 `reply_depth` 로 거절
 * - 쓰기(글 · 댓글 · 공감 · 신고)는 로그인해야 한다
 * - 같은 꿈은 한 번만 공유한다 — 지우지 않은 내 글이 있으면 `409 already_shared`(그 글 id 포함). 지우면 다시 된다
 * - 피드는 최신순 · 공감 많은 순(같으면 최신)
 *
 * 규칙은 `scripts/community`(C1~C15 · N1~N10)가 고정한다.
 */

type UserRow = { id: string; nickname: string; joinedAt: string };
type PostRow = {
  id: string;
  authorId: string;
  /** 어느 꿈에서 왔는가. 꿈당 한 글을 가르는 데만 쓴다 — 내용은 아래 복사본이다 */
  dreamId: string;
  title: string | null;
  dreamText: string;
  body: string;
  dreamRecordedAt: string;
  createdAt: string;
  likes: Set<string>;
  reporters: Set<string>;
  deleted: boolean;
};
type CommentRow = {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
  reporters: Set<string>;
  deleted: boolean;
};

const BLIND_AT = 3;
const PAGE = 20;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const err = (status: number, code: string, message: string) => ({ status, code, message });
const wait = () => new Promise((r) => setTimeout(r, 120));

const users = new Map<string, UserRow>();
const posts = new Map<string, PostRow>();
const comments = new Map<string, CommentRow>();
let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq += 1)}`;

function seed() {
  const u = (id: string, nickname: string, days: number) =>
    users.set(id, { id, nickname, joinedAt: hoursAgo(days * 24) });
  u('u-whale', '새벽고래 2041', 40);
  u('u-owl', '밤고양이 7713', 25);
  u('u-cloud', '구름사탕 0356', 12);
  u('u-star', '느린별 5580', 3);

  const p = (id: string, authorId: string, title: string | null, dreamText: string, body: string, h: number, likes: string[] = [], reporters: string[] = []) =>
    posts.set(id, {
      id,
      authorId,
      dreamId: `seed-${id}`,
      title,
      dreamText,
      body,
      dreamRecordedAt: hoursAgo(h + 5),
      createdAt: hoursAgo(h),
      likes: new Set(likes),
      reporters: new Set(reporters),
      deleted: false,
    });
  p('p-teeth', 'u-whale', '이빨이 다 빠지는 꿈', '거울을 보는데 앞니부터 하나씩 빠졌다. 아프지는 않았는데 손바닥에 이빨이 가득했다.', '요즘 이 꿈을 세 번째 꿨어요. 무슨 뜻일까요?', 3, ['u-owl', 'u-cloud']);
  p('p-sea', 'u-owl', '바다 위를 걸었다', '밤바다였는데 발밑이 유리처럼 단단했다. 멀리서 고래 소리가 들렸다.', '무서운 꿈은 아니었는데 깨고 나서 이상하게 울컥했어요.', 9, ['u-whale']);
  p('p-exam', 'u-cloud', null, '졸업했는데 시험을 다시 봐야 한다는 연락을 받았다. 답안지가 전부 백지였다.', '시험 꿈 해몽 부탁드립니다. 졸업한 지 오래됐어요.', 20);
  p('p-fall', 'u-star', '끝없이 떨어지는 꿈', '엘리베이터 줄이 끊어졌다. 떨어지는데 바닥이 안 나왔다.', '떨어지다가 몸이 움찔하면서 깼어요.', 30, [], ['u-whale', 'u-owl']);

  const cm = (id: string, postId: string, parentId: string | null, authorId: string, body: string, h: number) =>
    comments.set(id, { id, postId, parentId, authorId, body, createdAt: hoursAgo(h), reporters: new Set(), deleted: false });
  cm('c-1', 'p-teeth', null, 'u-owl', '이빨 빠지는 꿈은 불안할 때 많이 꾼대요. 요즘 걱정거리 있으세요?', 2);
  cm('c-2', 'p-teeth', 'c-1', 'u-whale', '이직 준비 중이라 그런가 봐요 ㅠ', 1.5);
  cm('c-3', 'p-teeth', null, 'u-cloud', '저도 같은 꿈 자주 꿔요', 1);
  cm('c-4', 'p-sea', null, 'u-star', '고래 소리 부분이 너무 좋네요', 5);
}
seed();

async function me(): Promise<UserRow | null> {
  const s = await loadSession();
  if (!s) return null;
  if (!users.has(s.user.id)) {
    users.set(s.user.id, { id: s.user.id, nickname: s.user.nickname, joinedAt: new Date().toISOString() });
  }
  return users.get(s.user.id) ?? null;
}

async function requireMe(): Promise<UserRow> {
  const m = await me();
  if (!m) throw err(401, 'unauthorized', '로그인이 필요합니다');
  return m;
}

const author = (id: string): Author => ({ id, nickname: users.get(id)?.nickname ?? '알 수 없음' });
const visible = (p: PostRow) => !p.deleted && p.reporters.size < BLIND_AT;
const liveComments = (postId: string) =>
  [...comments.values()].filter((c) => c.postId === postId && !c.deleted && c.reporters.size < BLIND_AT);

function summary(p: PostRow, myId: string | null): PostSummary {
  return {
    id: p.id,
    author: author(p.authorId),
    title: p.title,
    // 목록은 꿈 내용을 보여 준다 — 한마디는 선택이라 비어 있을 수 있다(문서 055)
    excerpt: p.dreamText.slice(0, 120),
    dreamRecordedAt: p.dreamRecordedAt,
    hasComic: false,
    likeCount: p.likes.size,
    commentCount: liveComments(p.id).length,
    likedByMe: myId != null && p.likes.has(myId),
    createdAt: p.createdAt,
  };
}

const newest = (a: PostRow, b: PostRow) => b.createdAt.localeCompare(a.createdAt);
const ORDER: Record<FeedSort, (a: PostRow, b: PostRow) => number> = {
  latest: newest,
  empathy: (a, b) => b.likes.size - a.likes.size || newest(a, b),
};

function page(
  rows: PostRow[],
  sort: FeedSort,
  cursor: string | null | undefined,
  myId: string | null,
): Page<PostSummary> {
  const sorted = rows.filter(visible).sort(ORDER[sort]);
  const start = cursor ? Number(cursor) : 0;
  const slice = sorted.slice(start, start + PAGE);
  return {
    items: slice.map((p) => summary(p, myId)),
    nextCursor: start + PAGE < sorted.length ? String(start + PAGE) : null,
  };
}

/** 부모 바로 뒤에 답글을 둔다. 가려지거나 지운 부모에 살아 있는 답글이 있으면 자리를 남긴다 */
function threaded(postId: string): Comment[] {
  const all = [...comments.values()].filter((c) => c.postId === postId);
  const alive = (c: CommentRow) => !c.deleted && c.reporters.size < BLIND_AT;
  const out: Comment[] = [];
  const tops = all.filter((c) => c.parentId == null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const t of tops) {
    const replies = all
      .filter((c) => c.parentId === t.id && alive(c))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!alive(t) && replies.length === 0) continue;
    out.push({
      id: t.id,
      postId,
      parentId: null,
      author: author(t.authorId),
      body: alive(t) ? t.body : '',
      createdAt: t.createdAt,
      deleted: !alive(t),
    });
    for (const r of replies) {
      out.push({ id: r.id, postId, parentId: t.id, author: author(r.authorId), body: r.body, createdAt: r.createdAt, deleted: false });
    }
  }
  return out;
}

/**
 * 이 꿈을 공유한, 지우지 않은 내 글. 신고로 가려진 글도 센다 — 가려졌다고 다시 올리게 하면
 * 같은 꿈이 두 번 남는다
 */
const mineFor = (userId: string, dreamId: string) =>
  [...posts.values()].find((p) => p.authorId === userId && p.dreamId === dreamId && !p.deleted) ?? null;

export const fakeCommunity: CommunityApi = {
  async feed(sort, cursor) {
    await wait();
    const m = await me();
    return page([...posts.values()], sort, cursor, m?.id ?? null);
  },

  async post(id) {
    await wait();
    const p = posts.get(id);
    if (!p || !visible(p)) return null;
    const m = await me();
    const detail: PostDetail = {
      ...summary(p, m?.id ?? null),
      dreamText: p.dreamText,
      body: p.body,
      comicUrl: null,
      comments: threaded(id),
    };
    return detail;
  },

  async createPost(input: NewPost) {
    await wait();
    const m = await requireMe();
    const existing = mineFor(m.id, input.dreamId);
    if (existing) throw { ...err(409, 'already_shared', '이미 공유한 꿈입니다'), postId: existing.id };
    const row: PostRow = {
      id: nextId('p'),
      authorId: m.id,
      dreamId: input.dreamId,
      title: input.title,
      dreamText: input.dreamText,
      body: input.body,
      dreamRecordedAt: input.dreamRecordedAt,
      createdAt: new Date().toISOString(),
      likes: new Set(),
      reporters: new Set(),
      deleted: false,
    };
    posts.set(row.id, row);
    return summary(row, m.id);
  },

  async postForDream(dreamId) {
    await wait();
    const m = await me();
    if (!m) return null;
    return mineFor(m.id, dreamId)?.id ?? null;
  },

  async deletePost(id) {
    await wait();
    const m = await requireMe();
    const p = posts.get(id);
    if (!p) throw err(404, 'post_not_found', '글을 찾을 수 없습니다');
    if (p.authorId !== m.id) throw err(403, 'not_owner', '내 글만 지울 수 있습니다');
    p.deleted = true;
  },

  async setLiked(postId, liked) {
    await wait();
    const m = await requireMe();
    const p = posts.get(postId);
    if (!p || !visible(p)) throw err(404, 'post_not_found', '글을 찾을 수 없습니다');
    if (liked) p.likes.add(m.id);
    else p.likes.delete(m.id);
    return { likeCount: p.likes.size, likedByMe: p.likes.has(m.id) };
  },

  async addComment(postId, body, parentId) {
    await wait();
    const m = await requireMe();
    const p = posts.get(postId);
    if (!p || !visible(p)) throw err(404, 'post_not_found', '글을 찾을 수 없습니다');
    if (parentId) {
      const parent = comments.get(parentId);
      if (!parent || parent.postId !== postId) throw err(404, 'comment_not_found', '댓글을 찾을 수 없습니다');
      if (parent.parentId != null) throw err(400, 'reply_depth', '답글에는 답글을 달 수 없습니다');
    }
    const row: CommentRow = {
      id: nextId('c'),
      postId,
      parentId: parentId ?? null,
      authorId: m.id,
      body,
      createdAt: new Date().toISOString(),
      reporters: new Set(),
      deleted: false,
    };
    comments.set(row.id, row);
    return { id: row.id, postId, parentId: row.parentId, author: author(m.id), body, createdAt: row.createdAt, deleted: false };
  },

  async deleteComment(id) {
    await wait();
    const m = await requireMe();
    const c = comments.get(id);
    if (!c) throw err(404, 'comment_not_found', '댓글을 찾을 수 없습니다');
    if (c.authorId !== m.id) throw err(403, 'not_owner', '내 댓글만 지울 수 있습니다');
    c.deleted = true;
  },

  async report(target: ReportTarget, _reason: ReportReason) {
    await wait();
    const m = await requireMe();
    const row = target.type === 'post' ? posts.get(target.id) : comments.get(target.id);
    if (!row) throw err(404, 'not_found', '대상을 찾을 수 없습니다');
    if (row.authorId === m.id) throw err(400, 'self_report', '내 글은 신고할 수 없습니다');
    row.reporters.add(m.id);
  },

  async profile(userId) {
    await wait();
    const u = users.get(userId) ?? (await me());
    if (!u || u.id !== userId) return null;
    const postCount = [...posts.values()].filter((p) => p.authorId === userId && visible(p)).length;
    const result: Profile = { id: u.id, nickname: u.nickname, joinedAt: u.joinedAt, postCount };
    return result;
  },

  async userPosts(userId, sort, cursor) {
    await wait();
    const m = await me();
    return page([...posts.values()].filter((p) => p.authorId === userId), sort, cursor, m?.id ?? null);
  },
};
