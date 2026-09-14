/**
 * 동기화 재현 시나리오. 서버 세션이 코드를 읽고 짚은 A · B · C · D(문서 032 03장)와,
 * 이 테스트를 짜다 발견한 E를 **수정하지 않은 코드**로 돌린다.
 *
 * 각 시나리오는 "제대로 동작하면 참이어야 하는 것"을 확인한다.
 * 그게 거짓이면 **재현됨**이다. 고친 뒤에는 같은 시나리오가 **재현 안 됨**으로 바뀌어야 한다.
 *
 * 저장소는 두 구현(SQLite · 메모리)을 모두 돌린다. 인터페이스를 같이 쓰므로 둘이 같아야 한다.
 */
import { createMemoryRepo } from '@shared/db/memory';
import { createSqliteRepo } from '@shared/db/sqlite';
import { formatInstant, server } from '@shared/api/sync';
import { syncOnce } from '@shared/sync';

import { openNodeDb } from './support.mjs';

const TOKEN = 'test-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshRepo(kind) {
  const repo = kind === 'sqlite' ? createSqliteRepo(openNodeDb()) : createMemoryRepo();
  await repo.init();
  globalThis.__reproRepo = repo;
  server.reset();
  return repo;
}

const pendingIds = async (repo) => (await repo.listUnsynced(1000)).map((d) => d.id);

const scenarios = [
  {
    key: 'A',
    title: '올리는 도중 고친 제목이 대기열에서 빠진다',
    async run(repo) {
      // 받기를 끈다 — B가 같은 회차에 끼어들어 A를 가리지 않게
      server.disablePull(true);
      const d = await repo.create({ title: 'v1', text: '본문' });
      await sleep(5);
      server.onPush(async () => {
        await sleep(5);
        await repo.update(d.id, { title: 'v2' });
        await sleep(5);
      });
      await syncOnce(TOKEN);
      const stillPending = (await pendingIds(repo)).includes(d.id);
      server.onPush(null);
      await syncOnce(TOKEN);
      const serverTitle = server.rows.get(d.id)?.title;
      return {
        reproduced: !stillPending && serverTitle !== 'v2',
        detail: `1회차 뒤 대기열에 ${stillPending ? '있음' : '없음'} · 2회차 뒤 서버 제목 "${serverTitle}" (로컬은 "v2")`,
      };
    },
  },
  {
    key: 'B1',
    title: '올리는 도중 고친 제목이 같은 회차 받기에 덮인다',
    async run(repo) {
      const d = await repo.create({ title: 'v1', text: '본문' });
      await sleep(5);
      server.onPush(async () => {
        await sleep(5);
        await repo.update(d.id, { title: 'v2' });
        await sleep(5);
      });
      await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      return {
        reproduced: local.title !== 'v2',
        detail: `로컬 제목 "${local.title}" (고친 값은 "v2") · 서버 제목 "${server.rows.get(d.id)?.title}"`,
      };
    },
  },
  {
    key: 'B2',
    title: '거절된 행의 로컬 수정이 다른 기기의 서버 내용에 덮인다',
    async run(repo) {
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      server.editAsOtherDevice(d.id, { title: '기기2가 고친 제목' }, new Date(Date.now() + 1000).toISOString());
      const longTitle = '가'.repeat(300);
      await repo.update(d.id, { title: longTitle });
      await sleep(5);
      await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const kept = local.title === longTitle;
      return {
        reproduced: !kept,
        detail: `거절 이유 ${server.pushLog.filter((p) => p.id === d.id).at(-1)?.status} · 로컬 제목 ${kept ? '그대로(300자)' : `"${local.title}"로 바뀜`}`,
      };
    },
  },
  {
    key: 'B3',
    title: '100건 상한에 밀린 행의 로컬 수정이 서버 내용에 덮인다',
    async run(repo) {
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      for (let i = 0; i < 100; i += 1) await repo.create({ title: `새 기록 ${i}` });
      await sleep(5);
      await repo.update(d.id, { title: '로컬에서 고친 제목' });
      server.editAsOtherDevice(d.id, { title: '기기2가 고친 제목' }, new Date(Date.now() + 1000).toISOString());
      await sleep(5);
      await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const pushedD = server.pushLog.filter((p) => p.id === d.id).length;
      return {
        reproduced: local.title !== '로컬에서 고친 제목',
        detail: `이번 회차에 d 전송 ${pushedD - 1}건 · 로컬 제목 "${local.title}"`,
      };
    },
  },
  {
    key: 'C',
    title: '서버 시계가 5초 빠르면 같은 기록이 계속 오간다',
    async run(repo) {
      server.setSkew(5000);
      const d = await repo.create({ title: 'v1', text: '본문' });
      const original = d.updatedAt;
      await syncOnce(TOKEN);
      const pendingAfter1 = (await pendingIds(repo)).includes(d.id);
      const pushes = [];
      for (let round = 2; round <= 4; round += 1) {
        const before = server.pushLog.filter((p) => p.id === d.id).length;
        await syncOnce(TOKEN);
        pushes.push(server.pushLog.filter((p) => p.id === d.id).length - before);
      }
      const cua = formatInstant(server.rows.get(d.id).clientUpdatedAt);
      return {
        reproduced: pendingAfter1 || pushes.some((n) => n > 0),
        detail: `1회차 뒤 대기열에 ${pendingAfter1 ? '있음' : '없음'} · 고친 것 없이 2~4회차 재전송 ${pushes.join('/')}건 · 서버 clientUpdatedAt ${cua} (기기가 처음 보낸 값 ${original})`,
      };
    },
  },
  {
    key: 'C0',
    title: '[대조군] 시계가 같으면 C는 안 생긴다',
    async run(repo) {
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(20);
      const before = server.pushLog.filter((p) => p.id === d.id).length;
      await syncOnce(TOKEN);
      const again = server.pushLog.filter((p) => p.id === d.id).length - before;
      return { reproduced: again > 0, detail: `2회차 재전송 ${again}건` };
    },
  },
  {
    key: 'C2',
    title: '받아온 행의 updated_at · synced_at 이 한 형식이 아니다 (문자열 비교가 뒤집히는 원인)',
    async run(repo) {
      // listUnsynced는 두 칸을 **문자열로** 비교한다. 자릿수가 섞이면 순서가 뒤집힌다 —
      // "…03.024900Z" > "…03.024Z" 는 시각으로는 참인데 문자열로는 거짓이다('9' < 'Z').
      // 그래서 확인할 것은 받아온 뒤 두 칸이 **기기 형식(밀리초 3자리) 하나로 같은가**다.
      // 실제 동기화 경로(syncOnce)로 받는다. 서버는 updatedAt을 6자리로 준다
      server.seed(1);
      await syncOnce(TOKEN);
      const [row] = await repo.list({ includeDeleted: true });
      const iso3 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const uniform = iso3.test(row.updatedAt) && row.syncedAt === row.updatedAt;
      return {
        reproduced: !uniform,
        detail: `받아온 뒤 updated_at ${row.updatedAt} · synced_at ${row.syncedAt}`,
      };
    },
  },
  {
    key: 'D',
    title: '같은 시각 행 사이에서 끊긴 채 회차가 끝나면 나머지를 못 받는다',
    async run(repo) {
      server.seed(101, { sameInstant: true });
      server.failPullOnCall(2);
      await syncOnce(TOKEN);
      server.failPullOnCall(null);
      await syncOnce(TOKEN);
      const got = (await repo.list({ includeDeleted: true })).length;
      return { reproduced: got < 101, detail: `서버 101건 중 로컬 ${got}건` };
    },
  },
  {
    key: 'E',
    title: '[새로 발견] 한 회차에서 두 번째 페이지부터 같은 페이지만 되풀이한다',
    async run(repo) {
      server.seed(150);
      const r = await syncOnce(TOKEN);
      const got = (await repo.list({ includeDeleted: true })).length;
      return {
        reproduced: got < 150,
        detail: `서버 150건 중 로컬 ${got}건 · 받기 요청 ${server.pullCalls}번 · 보고된 받은 수 ${r.pulled}`,
      };
    },
  },
];

const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const results = [];
for (const s of scenarios) {
  if (only && !only.includes(s.key)) continue;
  for (const kind of ['sqlite', 'memory']) {
    const repo = await freshRepo(kind);
    try {
      const r = await s.run(repo);
      results.push({ key: s.key, kind, title: s.title, ...r });
    } catch (e) {
      results.push({ key: s.key, kind, title: s.title, reproduced: null, detail: `테스트 오류: ${e?.message ?? e}` });
    }
  }
}

for (const r of results) {
  const mark = r.reproduced === null ? '오류    ' : r.reproduced ? '재현됨  ' : '재현 안 됨';
  console.log(`${r.key.padEnd(3)} ${r.kind.padEnd(6)} ${mark} ${r.title}\n            ${r.detail}`);
}
