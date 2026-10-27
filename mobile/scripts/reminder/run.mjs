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
const { nextFireAt, planReminder, parseReminderTime, reminderLabel, joinTime, splitTime, isPresetTime, toPickerTime } = await import(
  pathToFileURL(out).href
);

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
  ['망가진 저장값은 꺼짐', () => [parseReminderTime('7:30'), parseReminderTime('24:00'), parseReminderTime('12:60'), parseReminderTime(''), parseReminderTime(null)].join('|'), '||||'],
  ['직접 정한 시각도 받음(이슈 #153)', () => [parseReminderTime('07:30'), parseReminderTime('18:00'), parseReminderTime('00:00')].join('|'), '07:30|18:00|00:00'],
  ['이름 — 바로 고르는 셋', () => [reminderLabel(null), reminderLabel('09:00'), reminderLabel('12:00'), reminderLabel('18:00')].join('|'), '끔|오전 9시|정오|오후 6시'],
  ['이름 — 직접 정한 것', () => [reminderLabel('07:30'), reminderLabel('13:00'), reminderLabel('00:10'), reminderLabel('12:40')].join('|'), '오전 7시 30분|오후 1시|오전 12시 10분|오후 12시 40분'],
  ['나누고 다시 합치면 같음', () => ['00:00', '07:30', '12:00', '12:50', '23:10'].map((t) => { const x = splitTime(t); return joinTime(x.pm, x.hour12, x.minute); }).join('|'), '00:00|07:30|12:00|12:50|23:10'],
  ['오전 12시는 0시 · 오후 12시는 정오', () => [joinTime(false, 12, 0), joinTime(true, 12, 0), joinTime(true, 6, 0)].join('|'), '00:00|12:00|18:00'],
  ['바로 고르는 셋인가', () => [isPresetTime('12:00'), isPresetTime('12:10'), isPresetTime(null)].join('|'), 'true|false|false'],
  ['고르기 칸에 맞춤 — 10분 단위로 내림(PR #154 리뷰)', () => ['07:35', '12:09', '23:59', '00:00'].map(toPickerTime).join('|'), '07:30|12:00|23:50|00:00'],
  ['직접 정한 시각도 예약됨', () => show(planReminder(kst('2026-10-27T05:00'), '07:30', 1)?.at), '2026-10-27 07:30'],
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
