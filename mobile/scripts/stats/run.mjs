/**
 * 마이 탭 기록 통계 테스트(총 기록 · 연속 기록일 · 이번 달).
 *
 *   node scripts/stats/run.mjs
 *
 * `src/features/log/stats.ts`를 한국 시간대로 돌린다. 저장 시각은 UTC 글자라 새벽 기록이 전날로 밀리지 않는지가 핵심이다.
 * 이미 설치된 esbuild 로 TypeScript 를 풀어 돌린다(새 의존성 없음). 하나라도 틀리면 종료 코드 1로 끝난다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Asia/Seoul';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', '..', 'src', 'features', 'log', 'stats.ts');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kkume-stats-')), 'stats.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { recordStats } = await import(pathToFileURL(out).href);

/** 한국 시각 → 저장되는 UTC 글자 */
const at = (s) => new Date(`${s}+09:00`).toISOString();
const kst = (s) => new Date(`${s}+09:00`);
const s = (times, now) => {
  const r = recordStats(times, kst(now));
  return `${r.total}/${r.streak}/${r.thisMonth}`;
};

const cases = [
  ['기록 없음', () => s([], '2026-10-27T10:00'), '0/0/0'],
  ['오늘 새벽 5시 하나(UTC로는 전날 20시)', () => s([at('2026-10-27T05:00')], '2026-10-27T10:00'), '1/1/1'],
  ['사흘 연속(오늘 포함)', () => s([at('2026-10-25T04:00'), at('2026-10-26T06:00'), at('2026-10-27T05:00')], '2026-10-27T10:00'), '3/3/3'],
  ['오늘은 아직 — 어제까지 이틀이면 2', () => s([at('2026-10-25T04:00'), at('2026-10-26T06:00')], '2026-10-27T10:00'), '2/2/2'],
  ['어제도 없으면 끊김', () => s([at('2026-10-24T04:00'), at('2026-10-25T06:00')], '2026-10-27T10:00'), '2/0/2'],
  ['하루에 여러 건은 하루', () => s([at('2026-10-27T03:00'), at('2026-10-27T05:00'), at('2026-10-26T05:00')], '2026-10-27T10:00'), '3/2/3'],
  ['달 경계 — 지난달은 이번 달에 안 셈, 연속은 이어짐', () => s([at('2026-09-30T05:00'), at('2026-10-01T05:00')], '2026-10-01T10:00'), '2/2/1'],
  ['10월 1일 새벽 1시(UTC 9월 30일)는 10월', () => s([at('2026-10-01T01:00')], '2026-10-01T10:00'), '1/1/1'],
  ['해 경계 — 작년 같은 달은 이번 달 아님', () => s([at('2025-10-27T05:00')], '2026-10-27T10:00'), '1/0/0'],
  ['읽을 수 없는 시각은 날짜에서 빠짐(총수에는 듦)', () => s(['x', at('2026-10-27T05:00')], '2026-10-27T10:00'), '2/1/1'],
];

let failed = 0;
for (const [name, run, want] of cases) {
  let got;
  try {
    got = run();
  } catch (e) {
    got = `throw ${e}`;
  }
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`}`);
}
console.log(failed ? `\n${failed}건 실패` : `\n${cases.length}건 모두 통과`);
process.exit(failed ? 1 : 0);
