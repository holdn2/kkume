/**
 * 꿈 로그 검색 — `DreamRepo.list({ query })`. 진짜 SQLite 저장소 코드(`sqlite.ts`)를 Node 내장 `node:sqlite`로,
 * 메모리 저장소(`memory.ts`)도 같은 경우로 돌린다. 두 저장소가 같은 답을 내야 한다(웹 · 스토리북은 메모리를 쓴다).
 *
 * L1~L8 은 구현보다 먼저 넣었다(이슈 #63 묶음).
 */
import { DatabaseSync } from 'node:sqlite';

import { appendDreams } from '@features/log/paging';
import { createMemoryRepo } from '@shared/db/memory';
import { createSqliteRepo } from '@shared/db/sqlite';

let failed = 0;
let total = 0;
const check = (key, name, ok, detail = '') => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${key}  ${ok ? '정상' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** expo-sqlite 의 비동기 모양을 node:sqlite 위에 얹는다 */
function nodeDb() {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
  };
}

async function seed(repo) {
  await repo.init?.();
  const at = (h) => new Date(Date.UTC(2026, 8, 30, h)).toISOString();
  await repo.create({ recordedAt: at(1), title: '바다 위를 걸었다', text: '밤바다가 유리처럼 단단했다' });
  await repo.create({ recordedAt: at(2), title: null, text: '시험 꿈. 답안지가 백지였다' });
  await repo.create({ recordedAt: at(3), title: '고래', text: '멀리서 고래 소리가 들렸다' });
  await repo.create({ recordedAt: at(4), title: '할인 100%', text: 'under_score 가 든 꿈' });
  const gone = await repo.create({ recordedAt: at(5), title: '지운 바다 꿈', text: '' });
  await repo.softDelete(gone.id);
  await repo.create({ recordedAt: at(6), title: null, text: null, audioPath: 'file:///a.m4a', durationMs: 1000 });
}

const titles = (list) => list.map((d) => d.title ?? d.text ?? '(음성)').join(' | ');

for (const [label, repo] of [
  ['sqlite', createSqliteRepo(nodeDb())],
  ['memory', createMemoryRepo()],
]) {
  await seed(repo);
  const all = await repo.list();
  const q = (query) => repo.list({ query });

  const sea = await q('바다');
  check(`L1·${label}`, '제목에 든 말로 찾는다(지운 것은 빼고)', sea.length === 1 && sea[0].title === '바다 위를 걸었다', titles(sea));
  const blank = await q('백지');
  check(`L2·${label}`, '본문에 든 말로도 찾는다', blank.length === 1 && blank[0].text?.includes('백지'), titles(blank));
  const whale = await q('고래');
  check(`L3·${label}`, '제목 · 본문 둘 다 맞아도 한 번만', whale.length === 1, titles(whale));
  check(`L4·${label}`, '빈 검색어 · 공백뿐이면 전체', (await q('')).length === all.length && (await q('   ')).length === all.length);
  const pct = await q('100%');
  check(`L5·${label}`, '% 는 글자 그대로(와일드카드 아님)', pct.length === 1 && pct[0].title === '할인 100%', titles(pct));
  const us = await q('_');
  check(`L6·${label}`, '_ 도 글자 그대로', us.length === 1, titles(us));
  check(`L7·${label}`, '없는 말이면 빈 목록', (await q('우주선')).length === 0);
  const trimmed = await q('  바다  ');
  check(`L8·${label}`, '검색어 앞뒤 공백은 자른다', trimmed.length === 1, titles(trimmed));
  // 목록 제목의 「N건 · 미확인 N건」 — 쪽으로 나눠 읽으면 읽은 만큼만 세게 되어 저장소가 따로 센다
  const n = await repo.counts();
  check(`L9·${label}`, '지운 것을 뺀 전체 · 미확인 개수', n.total === 5 && n.unread === 5, JSON.stringify(n));
  const nq = await repo.counts('바다');
  check(`L10·${label}`, '검색어가 있으면 그 결과만 센다', nq.total === 1 && nq.unread === 1, JSON.stringify(nq));
  const first = (await repo.list())[0];
  await repo.update(first.id, { reviewedAt: new Date().toISOString() });
  const after = await repo.counts();
  check(`L11·${label}`, '확인함으로 표시하면 미확인이 준다', after.total === 5 && after.unread === 4, JSON.stringify(after));
}

// ---- 쪽으로 나눠 읽기(P) — 100건에서 멈추던 목록 · 30건만 보이던 꿈 고르기를 고친다 ----
{
  const repo = createSqliteRepo(nodeDb());
  await repo.init();
  for (let i = 0; i < 70; i += 1) {
    await repo.create({ recordedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), title: `꿈 ${i}`, text: i % 2 ? '바다' : '산' });
  }
  const size = 30;
  let state = { rows: [], hasMore: true };
  let rounds = 0;
  while (state.hasMore && rounds < 10) {
    state = appendDreams(state.rows, await repo.list({ limit: size, offset: state.rows.length }), size);
    rounds += 1;
  }
  check('P1', '30건씩 끝까지 읽으면 70건 전부, 세 번에', state.rows.length === 70 && rounds === 3 && !state.hasMore, `${state.rows.length}건 · ${rounds}번`);

  // 첫 쪽을 읽은 뒤 새 기록이 생기면 offset 이 밀려 앞 쪽 마지막이 다음 쪽 첫 줄로 또 온다
  const first = appendDreams([], await repo.list({ limit: size, offset: 0 }), size);
  await repo.create({ recordedAt: new Date(Date.UTC(2026, 5, 1)).toISOString(), title: '새 꿈', text: '' });
  const second = appendDreams(first.rows, await repo.list({ limit: size, offset: first.rows.length }), size);
  const ids = second.rows.map((d) => d.id);
  check('P2', '쪽 사이에 새 기록이 생겨도 같은 기록이 두 번 오지 않는다', new Set(ids).size === ids.length, `${ids.length}건`);

  const searched = appendDreams([], await repo.list({ limit: size, offset: 0, query: '바다' }), size);
  check('P3', '검색도 쪽으로 — 꽉 찬 첫 쪽이면 더 있다', searched.rows.length === 30 && searched.hasMore);
  const searched2 = appendDreams(searched.rows, await repo.list({ limit: size, offset: 30, query: '바다' }), size);
  check('P4', '검색 마지막 쪽이 짧으면 끝(바다 35건)', searched2.rows.length === 35 && !searched2.hasMore, `${searched2.rows.length}건`);
}

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
