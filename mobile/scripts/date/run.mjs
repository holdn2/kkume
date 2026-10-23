/**
 * 기록 시각 표시 테스트(이슈 #127).
 *
 *   node scripts/date/run.mjs
 *
 * 저장된 시각은 UTC 글자라, 글자를 잘라 보여 주면 한국에서 9시간 · 하루가 어긋났다. 여기서는 시간대를 한국으로
 * 못 박고 `src/shared/date.ts`를 돌려 새벽 기록 · 연도 경계를 확인한다. 이미 설치된 esbuild 로 TypeScript 를 풀어
 * 돌린다(새 의존성 없음). 하나라도 틀리면 종료 코드 1로 끝난다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 시간대는 Date 를 처음 쓰기 전에 정한다 — 이 PC가 어디에 있든 같은 결과가 나오게
process.env.TZ = 'Asia/Seoul';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', '..', 'src', 'shared', 'date.ts');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kkume-date-')), 'date.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { when, day, dateTime } = await import(pathToFileURL(out).href);

/** 한국 시각으로 적은 "지금" */
const kst = (s) => new Date(`${s}+09:00`);

// 2026-10-21 05:12 KST 에 남긴 꿈. 저장 글자는 전날 20:12 UTC 다
const DAWN = '2026-10-20T20:12:00.000Z';

const cases = [
  ['상세 — 새벽 5:12 기록이 그날 05:12로', () => dateTime(DAWN, kst('2026-10-21T10:00')), '10월 21일 (수) 05:12'],
  ['꿈 공유 — 새벽 기록의 날짜가 전날로 밀리지 않음', () => day(DAWN, kst('2026-10-21T10:00')), '10월 21일'],
  ['목록 — 같은 날 아침에 보면 오늘', () => when(DAWN, kst('2026-10-21T10:00')), '오늘 05:12'],
  ['목록 — 다음 날 밤에 보면 어제', () => when(DAWN, kst('2026-10-22T23:59')), '어제 05:12'],
  ['목록 — 사흘 뒤', () => when(DAWN, kst('2026-10-24T09:00')), '3일 전 05:12'],
  ['목록 — 일주일이 넘으면 날짜', () => when(DAWN, kst('2026-10-30T09:00')), '10월 21일 05:12'],
  ['연도 경계 — 1월 1일 01:30 KST(UTC로는 전해 12월 31일)', () => day('2025-12-31T16:30:00.000Z', kst('2026-01-02T09:00')), '1월 1일'],
  ['연도 경계 — 해가 바뀌면 연도를 붙임', () => day('2025-12-31T16:30:00.000Z', kst('2027-01-02T09:00')), '2026년 1월 1일'],
  ['연도 경계 — 목록도 연도', () => when('2025-12-31T16:30:00.000Z', kst('2027-01-02T09:00')), '2026년 1월 1일 01:30'],
  ['밀리초 없는 서버 시각(Instant)', () => day('2026-10-20T20:12:00Z', kst('2026-10-21T10:00')), '10월 21일'],
  ['읽을 수 없는 값은 빈 글자', () => [when('x'), day(''), dateTime('nope')].join('|'), '||'],
  // 고치기 전 방식이 정말 틀렸는지 — 이 줄이 통과하면 위의 기대값이 옛 방식과 다르다는 뜻이다
  ['(반대 방향) 옛 방식은 전날 20:12를 보여 줬음', () => DAWN.slice(0, 16).replace('T', ' '), '2026-10-20 20:12'],
];

let failed = 0;
for (const [name, run, want] of cases) {
  let got;
  try {
    got = run();
  } catch (e) {
    got = `던짐: ${e.message}`;
  }
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? '통과' : '실패'}  ${name}${ok ? '' : `\n      기대 ${JSON.stringify(want)}\n      실제 ${JSON.stringify(got)}`}`);
}
console.log(`\n${cases.length}개 중 실패 ${failed}개`);
process.exit(failed ? 1 : 0);
