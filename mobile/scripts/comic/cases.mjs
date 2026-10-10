/**
 * 꿈 만화(이슈 #92). 화면 없이 규칙만 — 가짜 서버가 계약 초안(문서 081)대로 답하는가, 화면이 쓰는 계산이 맞는가.
 * 서버가 붙으면 서버 테스트와 이름을 맞춰 같은 기준으로 쓴다(커뮤니티와 같은 방식).
 */
import { isComicRunning } from '@shared/api/comic';
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
check('M19', '월 몫이 끝나면 503 comic_budget_exhausted', budget?.status === 503 && budget?.code === 'comic_budget_exhausted');
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

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
