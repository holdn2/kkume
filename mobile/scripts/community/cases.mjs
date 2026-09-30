/**
 * 커뮤니티 가짜 서버 규칙 — 계약 초안(문서 049)과 화면 재구성(문서 055).
 *
 * C1~C15 는 9/24 화면을 만들며 스크래치패드에서 돌리던 스모크를 옮긴 것이다.
 * N1~N9 는 055 의 새 규칙이고 **구현보다 먼저 넣었다** — 꿈 공유 · 꿈당 한 글 · 정렬 두 가지.
 */
import { fakeCommunity as api } from '@features/community/fake';
import { mergePage, migrateLocalBlocks, shareDream } from '@features/community/logic';
import { request } from '@shared/api/client';
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
// 서버 계약(056)처럼 덧붙는 필드는 ApiError.data 로 온다 — 진짜 request() 와 같은 모양
check('N4', '같은 꿈을 두 번 공유하면 409 already_shared 와 data.postId', dup?.code === 'already_shared' && dup?.status === 409 && dup?.data?.postId === shared.id, JSON.stringify(dup));
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

// ---- 서버 계약 056 확정본(2026-09-30)의 규칙 — 구현보다 먼저 넣었다 ----
const asUser = (id, nickname) =>
  saveSession({ accessToken: 't', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), user: { id, nickname } });

// postForDream: 서버에 없는 꿈 · 남의 꿈이어도 null(057 03장 1)
check('F1', '남의 꿈 id 로 물어도 null', (await api.postForDream('seed-p-teeth')) === null);

// 가려진 글은 작성자에게만 hidden: true 로 보인다(056 04장 2). p-fall 은 C6 에서 세 번째 신고로 가려졌다
await asUser('u-star', '느린별 5580');
const starPosts = (await api.userPosts('u-star', 'latest', null)).items;
const fallMine = starPosts.find((p) => p.id === 'p-fall');
const fallDetail = await api.post('p-fall');
check('F2', '가려진 내 글은 내 글 목록 · 상세에 hidden: true', fallMine?.hidden === true && fallDetail?.hidden === true);
check('F3', '가려진 글은 작성자라도 공감 · 댓글이 404', (await code(api.setLiked('p-fall', true))) === 'post_not_found' && (await code(api.addComment('p-fall', 'x'))) === 'post_not_found');
check('F4', '가려진 글이 있는 꿈은 postForDream 이 그 글', (await api.postForDream('seed-p-fall')) === 'p-fall');
check('F5', '가려진 글도 지울 수 있다', (await code(api.deletePost('p-fall'))) === 'ok');
await asUser('u-me', '나 0001');
check('F6', '남에게는 가려진 글이 피드 · 사용자 글에서 빠지고 상세는 null', !(await api.userPosts('u-star', 'latest', null)).items.some((p) => p.id === 'p-fall') && (await api.post('p-fall')) === null);
check('F7', '보이는 글은 hidden: false', (await api.feed('latest', null)).items.every((p) => p.hidden === false));

// 만료된 로그인: 앱은 만료 토큰을 붙이지 않으므로 읽기는 되고(로그인 안 한 것처럼) 쓰기는 401(056 04장 6)
await saveSession({ accessToken: 't', expiresAt: new Date(Date.now() - 60_000).toISOString(), user: { id: 'u-me', nickname: '나 0001' } });
const expiredFeed = await api.feed('latest', null);
check('F8', '만료되면 읽기는 되고 likedByMe 는 false, 쓰기는 401', expiredFeed.items.length > 0 && expiredFeed.items.every((p) => !p.likedByMe) && (await code(api.addComment('p-teeth', 'x'))) === 'unauthorized');
await asUser('u-me', '나 0001');

// 차단은 서버에(056 04장 1) — 피드와 댓글을 서버가 거르고, 프로필 · 사용자 글 · 글 상세는 거르지 않는다
check('F9', '나를 차단하면 400 self_block', (await code(api.block('u-me'))) === 'self_block');
await api.block('u-owl');
const feedB = (await api.feed('latest', null)).items;
const teethB = await api.post('p-teeth');
const c1 = teethB?.comments.find((x) => x.id === 'c-1');
check('F10', '차단하면 피드에서 그 사람 글이 빠진다', !feedB.some((p) => p.author.id === 'u-owl'));
check('F11', '답글 달린 차단한 사람 댓글은 자리만(deleted)', c1?.deleted === true && c1?.body === '' && teethB.comments.some((x) => x.parentId === 'c-1'));
check('F12', '프로필 · 사용자 글 · 글 상세는 거르지 않는다', (await api.userPosts('u-owl', 'latest', null)).items.length > 0 && (await api.post('p-sea')) !== null);
check('F13', '차단 목록', (await api.blocks()).map((a) => a.id).join() === 'u-owl');
await api.unblock('u-owl');
check('F14', '풀면 다시 보인다', (await api.feed('latest', null)).items.some((p) => p.author.id === 'u-owl') && (await api.blocks()).length === 0);
await asUser('u-cloud', '구름사탕 0356');
check('F15', '차단은 나에게만 — 다른 사람 목록은 그대로', (await api.blocks()).length === 0);
await asUser('u-me', '나 0001');

// 닉네임 바꾸기(056 04장 4) — 2~16자, 글에 복사하지 않아 지난 글 작성자 이름도 바뀐다
check('F16', '1자 · 17자 · 줄바꿈은 400 nickname_invalid', (await code(api.setNickname('가'))) === 'nickname_invalid' && (await code(api.setNickname('가'.repeat(17)))) === 'nickname_invalid' && (await code(api.setNickname('가\n나'))) === 'nickname_invalid');
const renamed = await api.setNickname('  새 이름  ');
const myPostNow = (await api.userPosts('u-me', 'latest', null)).items[0];
check('F17', '앞뒤 공백을 자르고, 지난 글 작성자 이름도 새 이름', renamed.nickname === '새 이름' && myPostNow?.author.nickname === '새 이름', `${renamed.nickname} / ${myPostNow?.author.nickname}`);

// ---- 화면 곁의 순수 도우미 ----
const ids = mergePage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((p) => p.id).join();
check('H1', '다음 쪽을 붙일 때 이미 있는 id 는 버린다(공감순 순서가 움직임, 056)', ids === 'a,b,c', ids);

{
  const calls = [];
  const fakeApi = (fails) => ({
    createPost: async () => {
      calls.push('post');
      if (fails-- > 0) throw { code: 'dream_not_found', status: 404, message: '' };
      return { id: 'p-ok' };
    },
  });
  const sync = async () => {
    calls.push('sync');
  };
  const ok = await shareDream(fakeApi(1), sync, newPost());
  check('H2', '공유는 동기화 뒤에 보내고, dream_not_found 면 한 번 더 동기화하고 다시', ok.id === 'p-ok' && calls.join() === 'sync,post,sync,post', calls.join());
  calls.length = 0;
  const e2 = await shareDream(fakeApi(2), sync, newPost()).then(() => null, (e) => e);
  check('H3', '두 번째도 dream_not_found 면 그 오류로 끝난다', e2?.code === 'dream_not_found' && calls.join() === 'sync,post,sync,post', calls.join());
}

{
  const store = new Map([['blocked_users', JSON.stringify([{ id: 'u-owl', nickname: 'a' }, { id: 'u-cloud', nickname: 'b' }])]]);
  const settings = { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
  const failing = { block: async (id) => { if (id === 'u-cloud') throw { code: 'network', status: 0 }; } };
  const r1 = await migrateLocalBlocks(failing, settings);
  check('H4', '하나라도 못 올리면 로컬 차단을 비우지 않는다', r1.moved === 1 && r1.failed === 1 && JSON.parse(store.get('blocked_users')).length === 2, JSON.stringify(r1));
  const okApi = { block: async () => {} };
  const r2 = await migrateLocalBlocks(okApi, settings);
  check('H5', '전부 올리면 비운다', r2.moved === 2 && r2.failed === 0 && JSON.parse(store.get('blocked_users')).length === 0, JSON.stringify(r2));
  const r3 = await migrateLocalBlocks(okApi, settings);
  check('H6', '비어 있으면 아무것도 하지 않는다', r3.moved === 0 && r3.failed === 0);
}

// ---- 진짜 request() 가 오류 본문의 덧붙은 필드를 넘기는가(서버 계약 056 01장) ----
// 서버는 409 already_shared 에 postId 를 싣는다. code · message 만 남기면 화면이 그 글로 안내하지 못한다
const realFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(JSON.stringify({ code: 'already_shared', message: '이미 공유한 꿈입니다', postId: 'p-42' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
const apiErr = await request('/api/community/posts', { method: 'POST', body: {} }).then(
  () => null,
  (e) => e,
);
globalThis.fetch = realFetch;
check(
  'A1',
  'request() 오류에 본문의 나머지 필드가 data 로 온다',
  apiErr?.code === 'already_shared' && apiErr?.status === 409 && apiErr?.data?.postId === 'p-42',
  JSON.stringify(apiErr),
);

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
