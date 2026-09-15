/**
 * 동기화 재현 시나리오. 서버 세션이 코드를 읽고 짚은 A · B · C · D(문서 032 03장)와,
 * 이 테스트를 짜다 발견한 E, 서버가 035에서 짚은 F를 **수정하지 않은 코드**로 돌린다.
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
      // 덮이지 않고 남은 수정이 **다음 회차에 결국 서버로 가는지**까지 본다
      server.onPush(null);
      await syncOnce(TOKEN);
      const serverAfter2 = server.rows.get(d.id)?.title;
      return {
        reproduced: local.title !== 'v2' || serverAfter2 !== 'v2',
        detail: `1회차 뒤 로컬 제목 "${local.title}" (고친 값은 "v2") · 2회차 뒤 서버 제목 "${serverAfter2}"`,
      };
    },
  },
  {
    key: 'B2',
    title: '거절된 행 · 로컬이 더 늦게 고쳤는데 다른 기기의 옛 내용에 덮인다',
    async run(repo) {
      // 순서가 핵심이다: v1 → 다른 기기 수정(T1) → 로컬 수정(T2, 더 늦음).
      // 서버 규칙(clientUpdatedAt이 늦은 쪽이 이긴다)으로 로컬이 이겨야 하는 상황이다.
      // 로컬 수정은 제목이 255자를 넘어 서버가 거절한다 — 그래도 폰에는 남아야 한다
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      server.editAsOtherDevice(d.id, { title: '기기2가 먼저 고친 제목' }, new Date().toISOString());
      await sleep(5);
      const longTitle = '가'.repeat(300);
      await repo.update(d.id, { title: longTitle });
      await sleep(5);
      await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const kept = local.title === longTitle;
      return {
        reproduced: !kept,
        detail: `서버 판정 ${server.pushLog.filter((p) => p.id === d.id).at(-1)?.status} · 로컬 제목 ${kept ? '그대로(300자)' : `"${local.title}"로 바뀜`}`,
      };
    },
  },
  {
    key: 'B3',
    title: '100건 상한에 밀린 행 · 로컬이 더 늦게 고쳤는데 옛 서버 내용에 덮인다',
    async run(repo) {
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      server.editAsOtherDevice(d.id, { title: '기기2가 먼저 고친 제목' }, new Date().toISOString());
      await sleep(5);
      for (let i = 0; i < 100; i += 1) await repo.create({ title: `새 기록 ${i}` });
      await sleep(5);
      await repo.update(d.id, { title: '로컬에서 나중에 고친 제목' });
      await sleep(5);
      await syncOnce(TOKEN);
      const afterRound1 = (await repo.get(d.id)).title;
      // 이번 회차에 못 올린 수정이 **다음 회차들에 결국 서버로 가는지**까지 본다
      for (let round = 0; round < 2; round += 1) await syncOnce(TOKEN);
      const serverTitle = server.rows.get(d.id)?.title;
      return {
        reproduced: afterRound1 !== '로컬에서 나중에 고친 제목' || serverTitle !== '로컬에서 나중에 고친 제목',
        detail: `1회차 뒤 로컬 "${afterRound1}" · 3회차 뒤 서버 "${serverTitle}"`,
      };
    },
  },
  {
    key: 'B4',
    title: '[B 수정 뒤 확인] 기기 둘 · 서버 쪽이 더 최신이면 몇 회차 뒤 양쪽이 같아진다',
    async run(repo) {
      // B3과 같은 상황에서 **다른 기기의 수정이 더 늦다**(서버 규칙상 그쪽이 이긴다).
      // 로컬은 덮이지 않고 남았다가, 다음 회차에 올리면 서버가 skipped를 준다.
      // 그 뒤 로컬도 서버 내용으로 따라가야 한다
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      for (let i = 0; i < 100; i += 1) await repo.create({ title: `새 기록 ${i}` });
      await sleep(5);
      await repo.update(d.id, { title: '로컬에서 고친 제목' });
      await sleep(5);
      server.editAsOtherDevice(d.id, { title: '기기2가 더 늦게 고친 제목' }, new Date(Date.now() + 60_000).toISOString());
      for (let round = 0; round < 3; round += 1) await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const serverTitle = server.rows.get(d.id)?.title;
      const pending = (await pendingIds(repo)).includes(d.id);
      return {
        reproduced: local.title !== serverTitle,
        detail: `3회차 뒤 로컬 "${local.title}" · 서버 "${serverTitle}" · 로컬 대기열에 ${pending ? '있음' : '없음'}`,
      };
    },
  },
  {
    key: 'B5',
    title: '[관찰] 거절된 행 · 서버 쪽이 더 늦게 고쳤을 때 로컬 내용은 어떻게 되나',
    observe: true,
    async run(repo) {
      // 버그 판정이 아니라 설계 확인이다. 받기의 덮는 조건이 서버 규칙(늦은 쪽이 이긴다)을
      // 따르므로, 거절돼 못 올라간 로컬 내용도 서버 쪽이 더 늦으면 덮인다고 추론했다.
      // 문서 033에서 서버 쪽 의견을 묻기 전에 실제로 그런지 본다
      const d = await repo.create({ title: 'v1', text: '본문' });
      await syncOnce(TOKEN);
      await sleep(5);
      const longTitle = '가'.repeat(300);
      await repo.update(d.id, { title: longTitle });
      await sleep(5);
      server.editAsOtherDevice(d.id, { title: '기기2가 더 늦게 고친 제목' }, new Date(Date.now() + 60_000).toISOString());
      await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      return {
        reproduced: false,
        detail: `거절(${server.pushLog.filter((p) => p.id === d.id).at(-1)?.status}) 뒤 로컬 제목 ${local.title === longTitle ? '300자 그대로' : `"${local.title}"로 덮임`}`,
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
  {
    key: 'F',
    title: '[서버 035] 같은 초에 기록한 꿈 둘 · 밀리초가 000인 쪽이 목록에서 위로 뜬다',
    async run(repo) {
      // 실제 서버는 시각을 Instant로 읽었다 다시 써서 "…57.000Z"를 "…57Z"로 돌려준다(문서 035).
      // 가짜 서버는 recordedAt을 받은 문자열 그대로 돌려주므로, 실제 서버가 줄 모양을 직접 넣는다.
      // 목록은 recorded_at을 문자열로 정렬한다 — "…57Z" > "…57.300Z"('Z' > '.')라 순서가 뒤집힌다
      server.seed(2);
      const [first, second] = [...server.rows.values()];
      first.recordedAt = '2026-09-14T06:40:57Z';
      second.recordedAt = '2026-09-14T06:40:57.300Z';
      await syncOnce(TOKEN);
      const list = await repo.list({ includeDeleted: true });
      return {
        reproduced: list[0]?.id !== second.id,
        detail: `목록 순서 ${list.map((d) => `${d.recordedAt}`).join(' → ')} (늦게 기록한 …57.300Z가 위여야 한다)`,
      };
    },
  },
  {
    key: 'F0',
    title: '[대조군] 둘 다 소수부가 있으면 F는 안 생긴다',
    async run(repo) {
      server.seed(2);
      const [first, second] = [...server.rows.values()];
      first.recordedAt = '2026-09-14T06:40:57.100Z';
      second.recordedAt = '2026-09-14T06:40:57.300Z';
      await syncOnce(TOKEN);
      const list = await repo.list({ includeDeleted: true });
      return {
        reproduced: list[0]?.id !== second.id,
        detail: `목록 순서 ${list.map((d) => `${d.recordedAt}`).join(' → ')}`,
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
      results.push({ key: s.key, kind, title: s.title, observe: !!s.observe, ...r });
    } catch (e) {
      results.push({ key: s.key, kind, title: s.title, reproduced: null, detail: `테스트 오류: ${e?.message ?? e}` });
    }
  }
}

for (const r of results) {
  const mark = r.reproduced === null ? '오류    ' : r.observe ? '관찰    ' : r.reproduced ? '재현됨  ' : '재현 안 됨';
  console.log(`${r.key.padEnd(3)} ${r.kind.padEnd(6)} ${mark} ${r.title}\n            ${r.detail}`);
}
