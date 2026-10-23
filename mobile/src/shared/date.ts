/**
 * 기록 시각을 사람이 읽는 말로 바꾼다.
 *
 * **저장된 시각은 UTC 글자다**(`nowIso` → `toISOString`). 글자를 잘라 쓰면(`slice(0, 16)`) 한국에서 9시간이
 * 어긋나 새벽 5:12 기록이 「전날 20:12」로 보였다(이슈 #127). 꿈은 대부분 아침 9시 전에 남기므로 날짜까지
 * 하루 틀린다. 여기서는 반드시 `Date`로 읽어 기기 시간대로 쓴다 — 시각을 보여 주는 곳은 이 파일을 거친다.
 */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const read = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * 목록에서 쓰는 "언제쯤". 새벽 기록이라 **날짜보다 어젯밤 것인지 지난주 것인지가 먼저 읽혀야 한다** —
 * 오늘 05:12 · 어제 05:12 · 3일 전 05:12 · 10월 2일 05:12
 */
export function when(iso: string, now = new Date()): string {
  const d = read(iso);
  if (!d) return '';
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(d)) / 86_400_000);
  if (days === 0) return `오늘 ${hm(d)}`;
  if (days === 1) return `어제 ${hm(d)}`;
  if (days > 1 && days < 7) return `${days}일 전 ${hm(d)}`;
  return `${day(iso, now)} ${hm(d)}`;
}

/** 날짜만 — 10월 21일. 올해가 아니면 연도를 붙인다(2025년 12월 31일) */
export function day(iso: string, now = new Date()): string {
  const d = read(iso);
  if (!d) return '';
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

/** 한 건을 열어 볼 때 — 10월 21일 (수) 05:12 */
export function dateTime(iso: string, now = new Date()): string {
  const d = read(iso);
  if (!d) return '';
  return `${day(iso, now)} (${WEEKDAY[d.getDay()]}) ${hm(d)}`;
}
