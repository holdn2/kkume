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
import { resetSyncPosition, syncOnce } from '@shared/sync';
import { TRANSCRIPT_MARKER } from '@shared/stt/merge';

import { resetUpload, uploadControl } from './fake-upload.mjs';
import { openNodeDb } from './support.mjs';

const TOKEN = 'test-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshRepo(kind) {
  const repo = kind === 'sqlite' ? createSqliteRepo(openNodeDb()) : createMemoryRepo();
  await repo.init();
  globalThis.__reproRepo = repo;
  server.reset();
  resetUpload();
  return repo;
}

/** 끝난 음성 기록. 길이가 있어야 서버가 업로드 자리를 준다 */
const voiceDream = (repo, extra = {}) =>
  repo.create({ title: '음성 기록', audioPath: 'file:///rec.m4a', durationMs: 3000, ...extra });

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
    key: 'G',
    title: '로그아웃하고 다른 계정으로 로그인하면 그 계정의 예전 기록을 못 받는다',
    async run(repo) {
      // 로그아웃이 받기 위치(sync_position)를 안 지우면, 다음 계정이 앞 계정의 위치를 물려받아
      // 그 계정이 예전에 남긴 서버 기록은 since를 이미 지나 안 내려온다.
      // 앱의 로그아웃(useAuth().signOut)이 부르는 resetSyncPosition을 같은 자리에서 부른다.
      // **수정 전(1b9bd8c)에는 이 호출이 없었고, 같은 순서에서 B의 기록 2건 중 0건이 왔다**
      server.setUser('u2');
      server.seed(2, { prefix: 'b' }); // B가 전에 다른 기기에서 남긴 기록
      server.setUser('u1');

      await repo.create({ title: 'A의 기록 1', text: 'x' });
      await repo.create({ title: 'A의 기록 2', text: 'x' });
      await syncOnce('토큰A');

      await resetSyncPosition(); // 로그아웃

      server.setUser('u2'); // 계정 B로 로그인
      await syncOnce('토큰B');

      // 이미 올린 A의 기록은 동기화됨으로 표시돼 있어 B 계정으로 올라가면 안 된다
      const leakedSynced = [...server.rows.values()].filter(
        (r) => r.userId === 'u2' && (r.title ?? '').startsWith('A의 기록'),
      ).length;
      const local = await repo.list({ includeDeleted: true });
      const gotB = local.filter((d) => d.id.startsWith('b-')).length;
      return {
        reproduced: gotB < 2 || leakedSynced > 0,
        detail: `B의 서버 기록 2건 중 로컬에 ${gotB}건 · 이미 올린 A 기록이 B 계정으로 ${leakedSynced}건 올라감`,
      };
    },
  },
  {
    key: 'G2',
    title: '[관찰] 로그아웃 중에 남긴 기록은 다음에 로그인한 계정으로 올라간다',
    observe: true,
    async run(repo) {
      // 로그인 없이도 기록은 된다(절대 규칙 1). 로그아웃 중 기록은 안 올라간 상태로 남고,
      // 소유자는 서버가 토큰에서 정하므로 다음에 로그인한 계정 것이 된다.
      // 받기 위치를 지우는 것(G)으로는 안 풀린다 — 기록에 주인을 적어야 한다(문서 038 05장 2번).
      // 사용자 결정으로 커뮤니티(7~8주차) 때 본다
      await repo.create({ title: 'A의 기록', text: 'x' });
      await syncOnce('토큰A');
      await resetSyncPosition(); // 로그아웃
      const orphan = await repo.create({ title: '로그아웃 중에 남긴 기록', text: 'x' });
      server.setUser('u2'); // 계정 B로 로그인
      await syncOnce('토큰B');
      const leaked = [...server.rows.values()].some((r) => r.userId === 'u2' && r.id === orphan.id);
      return {
        reproduced: false,
        detail: `로그아웃 중 남긴 기록이 B 계정으로 ${leaked ? '올라감' : '안 올라감'}`,
      };
    },
  },
  // ---- H: 녹음 파일 업로드와 변환문 합치기 (문서 039 · 040 · 044, 이슈 #48) ----
  {
    key: 'H1',
    title: '끝난 음성 기록은 동기화 회차에서 올라가고, 다음 회차에 다시 올리지 않는다',
    async run(repo) {
      const d = await voiceDream(repo);
      const r1 = await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const serverUrl = server.rows.get(d.id)?.audioUrl ?? null;
      const slotsAfter1 = server.uploadSlots;
      await syncOnce(TOKEN);
      return {
        reproduced: !(r1.uploaded === 1 && local.audioUploadedAt && serverUrl && server.uploadSlots === slotsAfter1),
        detail: `1회차 올린 파일 ${r1.uploaded} · 로컬 표시 ${local.audioUploadedAt ? '있음' : '없음'} · 서버 audioUrl ${serverUrl ?? '없음'} · 2회차 업로드 자리 요청 ${server.uploadSlots - slotsAfter1}건`,
      };
    },
  },
  {
    key: 'H2',
    title: '끝나지 않은 녹음(길이 없음)은 올리지 않는다',
    async run(repo) {
      await voiceDream(repo, { durationMs: null });
      const r = await syncOnce(TOKEN);
      return {
        reproduced: r.uploaded !== 0 || server.uploadSlots !== 0 || r.uploadIssues.length !== 0,
        detail: `올린 파일 ${r.uploaded} · 업로드 자리 요청 ${server.uploadSlots}건 · 문제 ${r.uploadIssues.length}건`,
      };
    },
  },
  {
    key: 'H3',
    title: '행이 아직 서버에 없으면(올리기 거절) 파일을 안 올리고, 행이 올라간 다음 회차에 올린다',
    async run(repo) {
      const d = await voiceDream(repo, { title: '가'.repeat(300) }); // 서버가 title_too_long 으로 거절
      const r1 = await syncOnce(TOKEN);
      const slots1 = server.uploadSlots;
      await repo.update(d.id, { title: '고친 제목' });
      const r2 = await syncOnce(TOKEN);
      return {
        reproduced: !(r1.rejected.length === 1 && slots1 === 0 && r2.uploaded === 1),
        detail: `1회차 거절 ${r1.rejected.length} · 업로드 자리 요청 ${slots1}건 → 2회차 올린 파일 ${r2.uploaded}`,
      };
    },
  },
  {
    key: 'H4',
    title: '다른 기기가 이미 올린 녹음은 받기에서 표시만 하고 PUT 하지 않는다',
    async run(repo) {
      const d = await voiceDream(repo);
      // 이 기기의 업로드가 먼저 돌지 않게, 행만 올리고 파일은 아직인 상태를 만든다
      uploadControl.putStatus = 500;
      await syncOnce(TOKEN);
      uploadControl.putStatus = 200;
      const putsBefore = uploadControl.putCalls;
      server.attachAudio(d.id); // 다른 기기가 올림 → updatedAt 이 올라 받기에 내려온다
      const r = await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      return {
        reproduced: !(local.audioUploadedAt && uploadControl.putCalls === putsBefore && r.uploaded === 0),
        detail: `로컬 표시 ${local.audioUploadedAt ? '있음' : '없음'} · 이번 회차 PUT ${uploadControl.putCalls - putsBefore}건 · 올린 파일 ${r.uploaded}`,
      };
    },
  },
  {
    key: 'H4b',
    title: '서버에 이미 있는데 받기에 안 내려온 경우, 409 audio_exists 를 올라간 것으로 본다',
    async run(repo) {
      const d = await voiceDream(repo);
      uploadControl.putStatus = 500;
      await syncOnce(TOKEN);
      uploadControl.putStatus = 200;
      server.attachAudio(d.id, { bump: false });
      const putsBefore = uploadControl.putCalls;
      const r = await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      return {
        reproduced: !(local.audioUploadedAt && uploadControl.putCalls === putsBefore && r.uploadIssues.length === 0),
        detail: `로컬 표시 ${local.audioUploadedAt ? '있음' : '없음'} · PUT ${uploadControl.putCalls - putsBefore}건 · 문제 ${r.uploadIssues.map((i) => i.reason).join(',') || '없음'}`,
      };
    },
  },
  {
    key: 'H5',
    title: 'PUT 이 거절되면(403) 표시하지 않고 다음 회차에 다시 올린다',
    async run(repo) {
      const d = await voiceDream(repo);
      uploadControl.putStatus = 403;
      const r1 = await syncOnce(TOKEN);
      const local1 = await repo.get(d.id);
      uploadControl.putStatus = 200;
      const r2 = await syncOnce(TOKEN);
      return {
        reproduced: !(r1.uploaded === 0 && r1.uploadIssues[0]?.reason === 'put_403' && !local1.audioUploadedAt && r2.uploaded === 1),
        detail: `1회차 ${r1.uploadIssues[0]?.reason ?? '문제 없음'} · 표시 ${local1.audioUploadedAt ? '있음' : '없음'} → 2회차 올린 파일 ${r2.uploaded}`,
      };
    },
  },
  {
    key: 'H6',
    title: '변환이 끝나면 받기에서 [녹음 변환] 규칙대로 본문에 합치고, 합친 본문이 다음 회차에 올라간다',
    async run(repo) {
      const d = await voiceDream(repo, { text: '내가 적은 메모' });
      await syncOnce(TOKEN); // 행 + 파일
      server.finishStt(d.id, '바다 위를 걸었다');
      const r2 = await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      const want = `내가 적은 메모\n\n${TRANSCRIPT_MARKER}\n바다 위를 걸었다`;
      const callsAfter2 = server.sttCalls;
      const pendingBefore3 = (await pendingIds(repo)).includes(d.id);
      const r3 = await syncOnce(TOKEN);
      const serverText = server.rows.get(d.id)?.text;
      return {
        reproduced: !(r2.merged === 1 && local.text === want && local.sttStatus === 'done' && r3.pushed === 1 && serverText === want && server.sttCalls === callsAfter2),
        detail:
          `합침 ${r2.merged} · 로컬 ${local.text === want ? '기대대로' : JSON.stringify(local.text)} · 로컬 stt ${local.sttStatus} · ` +
          `3회차 전 대기열 ${pendingBefore3 ? '있음' : '없음'}(updated ${local.updatedAt} / synced ${local.syncedAt}) · ` +
          `3회차 올림 ${r3.pushed} 건너뜀 ${r3.skipped} 거절 ${r3.rejected.length} · 서버 본문 ${serverText === want ? '같음' : '다름'} · 3회차 원문 조회 ${server.sttCalls - callsAfter2}번`,
      };
    },
  },
  {
    key: 'H7',
    title: '받은 본문에 마커가 이미 있으면(다른 기기가 합침) 다시 합치지 않고 done 만 표시한다',
    async run(repo) {
      const d = await voiceDream(repo, { text: '메모' });
      await syncOnce(TOKEN);
      const mergedElsewhere = `메모\n\n${TRANSCRIPT_MARKER}\n바다`;
      server.editAsOtherDevice(d.id, { text: mergedElsewhere }, new Date(Date.now() + 60_000).toISOString());
      server.finishStt(d.id, '바다');
      const r = await syncOnce(TOKEN);
      const local = await repo.get(d.id);
      return {
        reproduced: !(r.merged === 0 && local.text === mergedElsewhere && local.sttStatus === 'done' && server.sttCalls === 0),
        detail: `합침 ${r.merged} · 로컬 본문 ${local.text === mergedElsewhere ? '그대로' : JSON.stringify(local.text)} · 로컬 stt ${local.sttStatus} · 원문 조회 ${server.sttCalls}번`,
      };
    },
  },
  {
    key: 'H8',
    title: '변환이 pending · failed 인 동안은 원문을 조회하지 않고 로컬 stt 도 그대로다',
    async run(repo) {
      const a = await voiceDream(repo, { text: 'a' });
      const b = await voiceDream(repo, { text: 'b' });
      await syncOnce(TOKEN);
      server.failStt(b.id);
      await syncOnce(TOKEN);
      const la = await repo.get(a.id);
      const lb = await repo.get(b.id);
      return {
        reproduced: !(server.sttCalls === 0 && la.sttStatus === 'pending' && lb.sttStatus === 'pending' && la.text === 'a' && lb.text === 'b'),
        detail: `원문 조회 ${server.sttCalls}번 · 로컬 stt ${la.sttStatus}/${lb.sttStatus}`,
      };
    },
  },
  {
    key: 'H9',
    title: '파일이 사라진 옛 녹음 하나가 뒤의 녹음 업로드를 막지 않고, 이유가 network 로 뭉뚱그려지지 않는다',
    async run(repo) {
      // 2026-09-21 기기에서 본 것: 녹음 올림 0 · 녹음 못 올림 mu3o… network. 옛 기록부터 올리다
      // 그 파일에서 막히자 회차가 멈춰 새 녹음까지 못 올라갔다. 원본이 없는 파일은 올릴 수 없으니
      // 건너뛰되 이유를 그대로 남기고, 다음 파일은 올라가야 한다
      const gone = await voiceDream(repo, { recordedAt: '2026-09-15T00:00:00.000Z', audioPath: 'file:///gone.m4a' });
      const fresh = await voiceDream(repo, { recordedAt: '2026-09-21T00:00:00.000Z' });
      uploadControl.missingFiles.add('file:///gone.m4a');
      const r = await syncOnce(TOKEN);
      const freshLocal = await repo.get(fresh.id);
      const goneIssue = r.uploadIssues.find((i) => i.id === gone.id);
      return {
        reproduced: !(r.uploaded === 1 && freshLocal.audioUploadedAt && goneIssue && goneIssue.reason !== 'network'),
        detail: `올린 파일 ${r.uploaded} · 새 녹음 표시 ${freshLocal.audioUploadedAt ? '있음' : '없음'} · 옛 녹음 이유 "${goneIssue?.reason ?? '없음'}"`,
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
