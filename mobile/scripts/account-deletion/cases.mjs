/**
 * 계정 삭제(이슈 #65 · 서버 계약 064 · 모바일 검토 065).
 *
 * D1~D3 — "올렸음" 표시 지우기: 진짜 SQLite 저장소 코드(`sqlite.ts`)를 Node 내장 `node:sqlite`로, 메모리 저장소도 같은 경우로.
 * D4~D9 — 삭제 흐름(`deleteAccount`): 응답마다 무엇을 하고 무엇을 남기는가, 동기화를 멈추고 기다린 뒤에 부르는가.
 * D10~D11 — 모든 요청의 `account_deleted`를 한 곳에서 잡는가(`request()`), 정리는 한 번만 도는가.
 * 구현보다 먼저 넣었다.
 */
import { DatabaseSync } from 'node:sqlite';

import { deleteAccount, onceAtATime } from '@shared/auth/deletion';
import { request, setAccountDeletedHandler } from '@shared/api/client';
import { createMemoryRepo } from '@shared/db/memory';
import { createSqliteRepo } from '@shared/db/sqlite';

let failed = 0;
let total = 0;
const check = (key, name, ok, detail = '') => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${key}  ${ok ? '정상' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function nodeDb() {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
  };
}

// ---- "올렸음" 표시 지우기 ----
for (const [label, repo] of [
  ['sqlite', createSqliteRepo(nodeDb())],
  ['memory', createMemoryRepo()],
]) {
  await repo.init?.();
  const a = await repo.create({ title: '올린 꿈', text: '바다', audioPath: 'file:///a.wav', durationMs: 1000 });
  const b = await repo.create({ title: '올린 꿈 둘', text: '산' });
  const gone = await repo.create({ title: '지운 꿈', text: '' });
  // 서버에 올렸고 녹음도 올린 상태로 만든다
  await repo.markSynced([a, b, gone].map((d) => ({ id: d.id, updatedAt: d.updatedAt })));
  await repo.markAudioUploaded(a.id, new Date().toISOString());
  await repo.softDelete(gone.id);
  await repo.markSynced([{ id: gone.id, updatedAt: (await repo.get(gone.id)).updatedAt }]);
  const before = (await repo.listUnsynced()).length;

  await repo.clearUploadMarks();
  const unsynced = await repo.listUnsynced();
  const ids = new Set(unsynced.map((d) => d.id));
  check(`D1·${label}`, '살아 있는 기록은 다시 "올릴 것"이 된다', before === 0 && ids.has(a.id) && ids.has(b.id), `전 ${before} · 후 ${unsynced.length}`);
  check(`D2·${label}`, '폰에서 지운 기록은 새 계정에 올리지 않는다', !ids.has(gone.id));
  const a2 = await repo.get(a.id);
  check(`D3·${label}`, '녹음 "올렸음"도 지워져, 다시 올린 뒤 녹음도 다시 올라간다', a2.audioUploadedAt == null && a2.audioPath === 'file:///a.wav' && a2.text === '바다');
}

// ---- 삭제 흐름 ----
const apiError = (status, code, message = '') => ({ status, code, message });
function harness(callDelete) {
  const log = [];
  const deps = {
    pauseSync: async () => {
      log.push('pause');
      return () => log.push('resume');
    },
    callDelete: async () => {
      log.push('delete');
      await callDelete();
    },
    forget: async () => {
      log.push('forget');
    },
  };
  return { log, deps };
}

{
  const { log, deps } = harness(async () => {});
  const r = await deleteAccount(deps);
  check('D4', '204 → 지웠음 · 정리 · 동기화는 멈춘 뒤에 부름', r.result === 'deleted' && log.join() === 'pause,delete,forget,resume', log.join());
}
{
  const { log, deps } = harness(async () => {
    throw apiError(401, 'account_deleted', '삭제된 계정입니다');
  });
  const r = await deleteAccount(deps);
  check('D5', '401 account_deleted → 204와 똑같이(다시 누른 경우)', r.result === 'deleted' && log.includes('forget'), log.join());
}
{
  const { log, deps } = harness(async () => {
    throw apiError(401, 'unauthorized', '로그인이 필요합니다');
  });
  const r = await deleteAccount(deps);
  check('D6', '401 unauthorized → 다시 로그인 안내 · 아무것도 지우지 않음', r.result === 'relogin' && !log.includes('forget') && log.includes('resume'), log.join());
}
{
  const { log, deps } = harness(async () => {
    throw apiError(503, 'deletion_failed', '녹음 파일을 지우지 못했습니다');
  });
  const r = await deleteAccount(deps);
  check('D7', '503 deletion_failed → 서버 문구 · 세션 유지 · 동기화 다시 켬', r.result === 'failed' && r.message === '녹음 파일을 지우지 못했습니다' && !log.includes('forget') && log.at(-1) === 'resume', log.join());
}
{
  const { log, deps } = harness(async () => {
    throw apiError(0, 'network', '네트워크에 연결할 수 없습니다');
  });
  const r = await deleteAccount(deps);
  check('D8', '연결 실패 → 실패로 · 세션 유지', r.result === 'failed' && !log.includes('forget'), log.join());
}
{
  // 돌던 동기화 회차가 끝나기 전에는 DELETE 를 보내지 않는다(065 02장)
  const log = [];
  let release;
  const running = new Promise((res) => (release = res));
  const deps = {
    pauseSync: async () => {
      log.push('pause');
      await running;
      log.push('sync-done');
      return () => log.push('resume');
    },
    callDelete: async () => log.push('delete'),
    forget: async () => log.push('forget'),
  };
  const p = deleteAccount(deps);
  await new Promise((r) => setTimeout(r, 10));
  const before = log.join();
  release();
  await p;
  check('D9', '돌던 동기화가 끝난 뒤에야 DELETE', before === 'pause' && log.join() === 'pause,sync-done,delete,forget,resume', `${before} → ${log.join()}`);
}

// ---- 모든 요청의 account_deleted 를 한 곳에서 ----
{
  let calls = 0;
  const forgetOnce = onceAtATime(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
  });
  setAccountDeletedHandler(() => void forgetOnce());
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 'account_deleted', message: '삭제된 계정입니다' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  const codes = await Promise.all([
    request('/api/community/posts', { token: 't' }).catch((e) => e.code),
    request('/api/dreams', { token: 't' }).catch((e) => e.code),
  ]);
  await new Promise((r) => setTimeout(r, 50));
  check('D10', '어느 요청이든 account_deleted 면 정리를 부르고, 오류는 그대로 던진다', codes.every((c) => c === 'account_deleted') && calls >= 1, codes.join());
  check('D11', '동시에 두 요청이 받아도 정리는 한 번만', calls === 1, `${calls}번`);
  globalThis.fetch = realFetch;
  setAccountDeletedHandler(null);
}

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
