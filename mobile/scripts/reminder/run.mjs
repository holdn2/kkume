/**
 * 낮 확인 알림 예약 테스트(이슈 #145).
 *
 *   node scripts/reminder/run.mjs
 *
 * `src/features/reminder/logic.ts`의 다음 예약 시각 · 켜고 끄기 판단을 한국 시간대로 돌린다. 이미 설치된 esbuild 로
 * TypeScript 를 풀어 돌린다(새 의존성 없음). 하나라도 틀리면 종료 코드 1로 끝난다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Asia/Seoul';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', '..', 'src', 'features', 'reminder', 'logic.ts');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kkume-reminder-')), 'logic.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
const { nextFireAt, planReminder, parseReminderTime, reminderLabel } = await import(pathToFileURL(out).href);

const kst = (s) => new Date(`${s}+09:00`);
/** 한국 시각 글자로 */
const show = (d) =>
  d ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : 'null';

const cases = [
  ['새벽 5시 기록 → 그날 정오', () => show(nextFireAt(kst('2026-10-27T05:12'), '12:00')), '2026-10-27 12:00'],
  ['정오가 지나면 → 다음 날 정오', () => show(nextFireAt(kst('2026-10-27T12:01'), '12:00')), '2026-10-28 12:00'],
  ['정확히 그 시각이면 다음 날(방금 울린 것을 다시 예약하지 않음)', () => show(nextFireAt(kst('2026-10-27T12:00'), '12:00')), '2026-10-28 12:00'],
  ['오후 6시 — 달이 바뀌는 날', () => show(nextFireAt(kst('2026-10-31T19:00'), '18:00')), '2026-11-01 18:00'],
  ['오전 9시 — 해가 바뀌는 날', () => show(nextFireAt(kst('2026-12-31T23:30'), '09:00')), '2027-01-01 09:00'],
  ['확인할 기록이 없으면 예약 없음', () => planReminder(kst('2026-10-27T05:00'), '12:00', 0), null],
  ['꺼져 있으면 예약 없음', () => planReminder(kst('2026-10-27T05:00'), null, 3), null],
  ['켜져 있고 기록이 있으면 그 수를 문구에', () => planReminder(kst('2026-10-27T05:00'), '12:00', 3)?.body.includes('3건'), true],
  ['예약 시각도 함께', () => show(planReminder(kst('2026-10-27T05:00'), '09:00', 1)?.at), '2026-10-27 09:00'],
  ['알 수 없는 저장값은 꺼짐', () => [parseReminderTime('07:30'), parseReminderTime(''), parseReminderTime(null)].join('|'), '||'],
  ['아는 값은 그대로', () => parseReminderTime('18:00'), '18:00'],
  ['이름', () => [reminderLabel(null), reminderLabel('12:00')].join('|'), '끔|정오'],
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
