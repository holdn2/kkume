/**
 * 커뮤니티 가짜 서버 규칙 — 계약 초안(문서 049)과 화면 재구성(문서 055).
 *
 * C1~C15 는 9/24 화면을 만들며 스크래치패드에서 돌리던 스모크를 옮긴 것이다.
 * N1~N9 는 055 의 새 규칙이고 **구현보다 먼저 넣었다** — 꿈 공유 · 꿈당 한 글 · 정렬 두 가지.
 */
import { fakeCommunity as api } from '@features/community/fake';
import { clearSession, saveSession } from '@shared/auth/session';

let failed = 0;
let total = 0;
const check = (key, name, ok, detail = '') => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${key}  ${ok ? '정상' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const code = async (p) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e?.code ?? String(e);
  }
};
const newPost = (over = {}) => ({
  dreamId: 'd-1',
  title: '내 꿈',
  dreamText: '꿈 내용 첫 줄. 둘째 줄.',
  dreamRecordedAt: new Date().toISOString(),
  body: '',
  ...over,
});

// ---- 로그인 전: 읽기는 되고 쓰기는 막힌다 ----
await clearSession();
const feed0 = await api.feed('latest', null);
check('C1', '로그인 전 피드 읽기', feed0.items.length > 0, `${feed0.items.length}건`);
check('C2', '로그인 전 댓글 쓰기는 401', (await code(api.addComment('p-teeth', 'x'))) === 'unauthorized');

await saveSession({
  accessToken: 't',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: { id: 'u-me', nickname: '나 0001' },
});

// ---- 답글은 한 단계 ----
const top = await api.addComment('p-teeth', '댓글');
const reply = await api.addComment('p-teeth', '답글', top.id);
check('C3', '댓글에 답글', reply.parentId === top.id);
check('C4', '답글에 답글은 reply_depth', (await code(api.addComment('p-teeth', '답글의 답글', reply.id))) === 'reply_depth');
const detail = await api.post('p-teeth');
const iTop = detail.comments.findIndex((c) => c.id === top.id);
check('C5', '답글이 부모 바로 뒤에 온다', detail.comments[iTop + 1]?.id === reply.id);

// ---- 신고 3회 → 가림 (p-fall 은 이미 2명이 신고해 둠) ----
const beforeFeed = (await api.feed('latest', null)).items.some((p) => p.id === 'p-fall');
await api.report({ type: 'post', id: 'p-fall' }, 'spam');
const afterFeed = (await api.feed('latest', null)).items.some((p) => p.id === 'p-fall');
check('C6', '신고 3회면 피드에서 사라짐', beforeFeed && !afterFeed);
check('C7', '가려진 글 상세는 null', (await api.post('p-fall')) === null);
await api.report({ type: 'post', id: 'p-sea' }, 'spam');
await api.report({ type: 'post', id: 'p-sea' }, 'spam');
check('C8', '같은 사람 중복 신고는 한 번', (await api.feed('latest', null)).items.some((p) => p.id === 'p-sea'));

// ---- 글 · 공감 · 지우기 ----
const mine = await api.createPost(newPost());
check('C9', '공유 뒤 최신순 피드 맨 위', (await api.feed('latest', null)).items[0]?.id === mine.id);
const liked = await api.setLiked(mine.id, true);
check('C10', '공감', liked.likedByMe && liked.likeCount === 1);
check('C11', '내 글 신고는 self_report', (await code(api.report({ type: 'post', id: mine.id }, 'spam'))) === 'self_report');
check('C12', '남의 글 지우기는 not_owner', (await code(api.deletePost('p-teeth'))) === 'not_owner');
await api.deletePost(mine.id);
check('C13', '지운 글은 피드에서 사라짐', !(await api.feed('latest', null)).items.some((p) => p.id === mine.id));
await api.deleteComment(top.id);
const after = await api.post('p-teeth');
const ph = after.comments.find((c) => c.id === top.id);
check('C14', '답글 달린 댓글을 지우면 자리만 남음', ph?.deleted === true && after.comments.some((c) => c.id === reply.id));
const prof = await api.profile('u-whale');
check('C15', '프로필', prof?.nickname === '새벽고래 2041' && prof.postCount === 1, `글 ${prof?.postCount}`);

// ---- 055: 꿈 공유 ----
const shared = await api.createPost(newPost({ dreamId: 'd-share', title: '고친 제목', dreamText: '고친 꿈 내용이 목록에 보인다', body: '' }));
check('N1', '한마디 없이(빈 body) 공유된다', !!shared.id);
check('N2', '목록 발췌는 꿈 내용에서 온다', shared.excerpt.startsWith('고친 꿈 내용'), shared.excerpt);
const d = await api.post(shared.id);
check('N3', '상세에 고친 제목 · 꿈 내용이 그대로', d?.title === '고친 제목' && d?.dreamText === '고친 꿈 내용이 목록에 보인다');
const dup = await (async () => {
  try {
    await api.createPost(newPost({ dreamId: 'd-share' }));
    return null;
  } catch (e) {
    return e;
  }
})();
check('N4', '같은 꿈을 두 번 공유하면 409 already_shared 와 그 글 id', dup?.code === 'already_shared' && dup?.status === 409 && dup?.postId === shared.id, JSON.stringify(dup));
check('N5', 'postForDream 은 공유한 글 id', (await api.postForDream('d-share')) === shared.id);
check('N6', '공유하지 않은 꿈은 null', (await api.postForDream('d-none')) === null);
await api.deletePost(shared.id);
check('N7', '글을 지우면 postForDream 은 null, 다시 공유할 수 있다', (await api.postForDream('d-share')) === null && (await code(api.createPost(newPost({ dreamId: 'd-share' })))) === 'ok');

// ---- 055: 정렬 ----
const latest = (await api.feed('latest', null)).items;
const byTime = [...latest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
check('N8', '최신순은 올린 시각 내림차순', latest.map((p) => p.id).join() === byTime.map((p) => p.id).join());
const empathy = (await api.feed('empathy', null)).items;
const byLikes = [...empathy].sort((a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt));
check(
  'N9',
  '공감순은 공감 수 내림차순(같으면 최신)',
  empathy.map((p) => p.id).join() === byLikes.map((p) => p.id).join() && empathy[0]?.id === 'p-teeth',
  empathy.map((p) => `${p.id}:${p.likeCount}`).join(' '),
);
const myList = (await api.userPosts('u-me', 'latest', null)).items;
check('N10', '내 글 목록도 정렬을 받는다', myList.every((p) => p.author.id === 'u-me') && myList.length >= 1);

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
