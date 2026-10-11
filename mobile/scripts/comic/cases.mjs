/**
 * 꿈 만화(이슈 #92 · #98). 화면 없이 규칙만 — 가짜 서버가 계약(문서 081 · 서버의 답 083)대로 답하는가,
 * 진짜 서버 구현(comicHttp)이 경로 · 오류를 맞게 옮기는가, 화면이 쓰는 계산이 맞는가.
 */
import { isComicRunning } from '@shared/api/comic';
import { createHttpComic } from '@shared/api/comicHttp';
import { createFakeComicApi, fakePanels } from '@features/comic/fake';
import { explainCreateError, gridCrop, stepStates } from '@features/comic/logic';

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
    return null;
  } catch (e) {
    return e;
  }
};

// 2026-10-10 12:00 KST
const T0 = Date.parse('2026-10-10T03:00:00Z');
let t = T0;
let who = 'u-me';
let budgetOut = false;
const api = createFakeComicApi({
  now: () => t,
  me: async () => who,
  budgetExhausted: () => budgetOut,
  stepMs: { queued: 1_000, scripting: 2_000, drawing: 3_000 },
});
const input = (text, extra = {}) => ({ dreamId: 'd-1', title: '하늘을 나는 꿈', dreamText: text, style: 'soft', ...extra });
const DREAM = '학교 옥상에서 뛰어내렸다. 떨어지지 않고 날았다. 바다 위를 지나갔다. 깨어 보니 침대였다.';

// 단계가 시간에 따라 넘어가는가(081 02장)
const c1 = await api.create(input(DREAM));
check('M1', '만들면 queued 로 시작하고 그림 · 컷이 비어 있다', c1.status === 'queued' && c1.layout === null && c1.panels.length === 0);
t = T0 + 1_500;
check('M2', '시나리오 단계', (await api.get(c1.id)).status === 'scripting');
t = T0 + 3_500;
const drawing = await api.get(c1.id);
check('M3', '그림 단계에서는 네 컷 해설이 이미 있다', drawing.status === 'drawing' && drawing.panels.length === 4);
t = T0 + 6_500;
const done = await api.get(c1.id);
check('M4', '다 만들면 layout 이 정해지고 끝난 시각이 붙는다', done.status === 'done' && done.layout === 'grid2x2' && !!done.finishedAt);
t = T0 + 60_000;
check('M5a', '끝난 시각은 읽을 때마다 바뀌지 않는다(PR #93 리뷰)', (await api.get(c1.id)).finishedAt === done.finishedAt, `${done.finishedAt} → ${(await api.get(c1.id)).finishedAt}`);
check('M5', '네 컷 해설은 꿈 문장을 순서대로 나눈다', done.panels[0].caption.startsWith('학교 옥상') && done.panels[3].caption.includes('침대'));

// 하루 몫(081 01장 — 초안 1편, KST 자정)
const daily = await code(api.create(input(DREAM)));
check('M6', '같은 날 두 번째는 429 comic_daily_limit', daily?.status === 429 && daily?.code === 'comic_daily_limit');
check('M7', '다시 만들 수 있는 시각은 KST 자정', daily?.data?.resetAt === '2026-10-10T15:00:00.000Z', daily?.data?.resetAt);
await api.remove(c1.id);
const afterDelete = await code(api.create(input(DREAM)));
check('M8', '지워도 그날 몫은 돌아오지 않는다', afterDelete?.code === 'comic_daily_limit');
check('M9', '지운 만화는 보이지 않는다', (await api.get(c1.id)) === null && (await api.forDream('d-1')).length === 0);

// 다음 날 — 거절 · 실패는 몫에서 빠진다
t = Date.parse('2026-10-10T15:00:00Z');
const refusedStart = t;
const r1 = await api.create(input(`${DREAM} [거절]`));
t = refusedStart + 3_500;
const refused = await api.get(r1.id);
check('M10', '내용 정책 거절은 시나리오 뒤 refused, 그림 · 컷 없이 문구만', refused.status === 'refused' && refused.panels.length === 0 && !!refused.failMessage);
const f1 = await api.create(input(`${DREAM} [실패]`));
check('M11', '거절된 것은 하루 몫에 세지 않는다', f1.status === 'queued');

// 동시에 하나만(081 01장)
const busy = await code(api.create(input(DREAM)));
check('M12', '만드는 중이면 409 comic_in_progress 와 그 만화 id', busy?.status === 409 && busy?.data?.comicId === f1.id);
t += 7_000;
const failedOne = await api.get(f1.id);
check('M13', '그 밖의 실패는 그림 단계 뒤 failed, 해설은 남는다', failedOne.status === 'failed' && failedOne.panels.length === 4 && !!failedOne.failMessage);
const c2 = await api.create(input(DREAM));
check('M14', '실패도 몫에 세지 않는다 — 같은 날 다시 만들 수 있다', c2.status === 'queued');

// 입력 · 로그인 · 월 몫
const blank = await code(api.create(input('   ')));
check('M15', '빈 꿈은 400 invalid_comic_input', blank?.code === 'invalid_comic_input' && blank?.status === 400);
const badStyle = await code(api.create(input(DREAM, { style: 'manga' })));
check('M16', '모르는 그림체도 400', badStyle?.code === 'invalid_comic_input');
who = null;
const anon = await code(api.create(input(DREAM)));
check('M17', '로그인하지 않으면 401', anon?.status === 401);
who = 'u-other';
check('M18', '남의 만화는 보이지 않는다', (await api.get(c2.id)) === null && (await api.forDream('d-1')).length === 0);
budgetOut = true;
const budget = await code(api.create(input(DREAM)));
check(
  'M19',
  '오늘 서비스 몫이 끝나면 503 comic_budget_exhausted, 문구는 "오늘"(083)',
  budget?.status === 503 && budget?.code === 'comic_budget_exhausted' && budget?.message.startsWith('오늘'),
  budget?.message,
);
budgetOut = false;
who = 'u-me';
t += 7_000;
const list = await api.forDream('d-1');
check('M20', '꿈별 목록은 최신순', list.length === 3 && list[0].id === c2.id, list.map((x) => x.status).join(','));

// 화면이 쓰는 계산
check('M21', '체크리스트: 시나리오 중이면 첫 칸만 돈다', stepStates('scripting').join() === 'active,waiting,waiting');
check('M22', '체크리스트: 그림 중이면 첫 칸은 끝', stepStates('drawing').join() === 'done,active,waiting');
check('M23', '폴링은 끝나지 않은 셋에서만', ['queued', 'scripting', 'drawing'].every(isComicRunning) && !['done', 'failed', 'refused'].some(isComicRunning));
const crops = [0, 1, 2, 3].map((i) => gridCrop(i, 100));
check(
  'M24',
  '2×2 자르기는 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래',
  crops.every((x) => x.width === 200 && x.height === 200) &&
    crops.map((x) => `${x.left},${x.top}`).join(' ') === '0,0 -100,0 0,-100 -100,-100',
);
check('M25', '문장이 넷보다 적어도 컷은 넷', fakePanels('한 문장뿐인 꿈.').length === 4);
const inProgress = explainCreateError({ code: 'comic_in_progress', status: 409, message: '만들고 있는 만화가 있어요', data: { comicId: 'x' } });
check('M26', '만드는 중 오류는 그 만화로 보낸다', inProgress.kind === 'inProgress' && inProgress.comicId === 'x');
check('M27', '401 은 로그인 안내', explainCreateError({ code: 'unauthorized', status: 401, message: '' }).kind === 'login');
check('M28', '모르는 오류는 고정 문구', explainCreateError(new Error('boom')).message.includes('잠시 뒤'));

// 하루 시도 5회(083 01장) — 거절 · 실패는 1편 몫에서 빠지지만 시도로는 센다
{
  let tt = Date.parse('2026-10-12T03:00:00Z');
  const a = createFakeComicApi({ now: () => tt, me: async () => 'u-try', stepMs: { queued: 1, scripting: 1, drawing: 1 } });
  for (let i = 0; i < 5; i++) {
    await a.create(input('[거절] 무서운 꿈이었다.'));
    tt += 10;
  }
  const sixth = await code(a.create(input(DREAM)));
  check('M29', '거절만 다섯 번이어도 여섯 번째는 429 comic_daily_limit', sixth?.status === 429 && sixth?.code === 'comic_daily_limit', sixth?.code ?? '만들어짐');
  tt += 24 * 60 * 60 * 1000;
  check('M30', '다음 날(KST)이면 다시 만들 수 있다', (await a.create(input(DREAM))).status === 'queued');
}

// 진짜 서버 구현(comicHttp) — fetch 를 흉내 내 경로 · 메서드 · 토큰 · 오류 변환을 본다
{
  const calls = [];
  let reply = { status: 200, body: {} };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization ?? null, body: init.body ? JSON.parse(init.body) : null });
    const { status, body } = reply;
    return { ok: status < 300, status, json: async () => body, text: async () => (body == null ? '' : JSON.stringify(body)) };
  };
  let token = 'tok';
  const http = createHttpComic({ token: async () => token });
  const last = () => calls[calls.length - 1];

  reply = { status: 202, body: { id: 'c1', status: 'queued' } };
  const made = await http.create(input(DREAM, { dreamId: 'd 1' }));
  check(
    'M31',
    '만들기는 POST /api/comics, 토큰 · 꿈 복사본을 싣는다',
    made.id === 'c1' && last().method === 'POST' && last().url.endsWith('/api/comics') && last().auth === 'Bearer tok' &&
      last().body.dreamText === DREAM && last().body.style === 'soft' && last().body.dreamId === 'd 1',
  );

  reply = { status: 200, body: { items: [{ id: 'c1' }, { id: 'c0' }] } };
  const items = await http.forDream('d 1');
  check('M32', '꿈별 목록은 items 를 풀고 dreamId 를 인코딩한다', items.length === 2 && last().url.endsWith('/api/comics?dreamId=d%201'), last().url);

  reply = { status: 404, body: { code: 'comic_not_found', message: '없어요' } };
  check('M33', '남의 것 · 지운 것(404)은 null', (await http.get('c9')) === null && last().url.endsWith('/api/comics/c9'));

  reply = { status: 404, body: { code: 'not_found', message: '없는 경로입니다' } };
  const noRoute = await code(http.get('c9'));
  check('M38', '만화가 아닌 404(경로 없음 등)는 null 로 삼키지 않는다(PR #99 리뷰)', noRoute?.status === 404 && noRoute?.code === 'not_found', noRoute === null ? 'null 로 바뀜' : '');

  reply = { status: 409, body: { code: 'comic_in_progress', message: '만들고 있는 만화가 있어요', comicId: 'c1' } };
  const busy = explainCreateError(await code(http.create(input(DREAM))));
  check('M34', '409 의 comicId 는 data 로 와서 화면이 그 만화로 보낸다', busy.kind === 'inProgress' && busy.comicId === 'c1');

  reply = { status: 503, body: { code: 'comic_unavailable', message: '지금은 만화를 만들 수 없어요' } };
  const off = explainCreateError(await code(http.create(input(DREAM))));
  check('M35', '503 comic_unavailable 은 서버 문구 그대로', off.message === '지금은 만화를 만들 수 없어요');

  reply = { status: 204, body: null };
  await http.remove('c1');
  check('M36', '지우기는 DELETE /api/comics/{id}, 204 를 받는다', last().method === 'DELETE' && last().url.endsWith('/api/comics/c1'));

  token = null;
  const before = calls.length;
  const anon = await code(http.get('c1'));
  check('M37', '로그인 전에는 보내지 않고 401', anon?.status === 401 && calls.length === before && explainCreateError(anon).kind === 'login');
}

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
