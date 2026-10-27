/**
 * 낮 확인 알림(LOG-3 유도, 이슈 #145)의 순수한 부분 — 시각 고르기 · 다음 예약 시각 · 문구.
 * 네이티브를 부르지 않아 `scripts/reminder`가 그대로 돌린다.
 */

/** 저장값은 `HH:MM`(기기 시간대). 비어 있으면 꺼 둔 것이다 */
export type ReminderTime = string;

/**
 * 바로 고르는 시각 세 개. 계획서 001이 미뤄 둔 「낮 확인 알림 시각」을 몇 개 중에서 고르기로 시작했고(이슈 #145),
 * 101 기기 확인에서 사용자가 직접 정하기를 더 원했다(이슈 #153 — "기존 3가지는 그대로 두고"). 그래서 이 셋은 그대로 두고
 * 그 밖의 시각도 받는다
 */
export const REMINDER_TIMES: { value: ReminderTime; label: string }[] = [
  { value: '09:00', label: '오전 9시' },
  { value: '12:00', label: '정오' },
  { value: '18:00', label: '오후 6시' },
];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 저장값을 읽는다. `HH:MM`이 아니면 꺼진 것으로 본다 — 망가진 값으로 엉뚱한 시각에 울리지 않게 */
export function parseReminderTime(v: string | null | undefined): ReminderTime | null {
  return v && HHMM.test(v) ? v : null;
}

/** 바로 고르는 세 개 중 하나인가 — 아니면 「직접 정하기」로 정한 것이다 */
export function isPresetTime(v: ReminderTime | null): boolean {
  return REMINDER_TIMES.some((t) => t.value === v);
}

/** 시각을 오전/오후 · 1~12시 · 분으로 나눈다 */
export function splitTime(v: ReminderTime): { pm: boolean; hour12: number; minute: number } {
  const [h, m] = v.split(':').map(Number);
  return { pm: h >= 12, hour12: h % 12 === 0 ? 12 : h % 12, minute: m };
}

/** 오전/오후 · 1~12시 · 분을 저장값으로. 오전 12시는 0시, 오후 12시는 정오다 */
export function joinTime(pm: boolean, hour12: number, minute: number): ReminderTime {
  const h = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 「직접 정하기」가 고를 수 있는 시각(10분 단위)으로 내린다. 저장값은 아무 분이나 받으므로(손으로 고친 값 등)
 * 고르기를 열 때 맞춘다 — 그대로 두면 칸은 30분을 가리키는데 저장은 35분으로 되는 어긋남이 생긴다(PR #154 리뷰)
 */
export function toPickerTime(v: ReminderTime): ReminderTime {
  const { pm, hour12, minute } = splitTime(v);
  return joinTime(pm, hour12, minute - (minute % 10));
}

export function reminderLabel(v: ReminderTime | null): string {
  if (!v) return '끔';
  const preset = REMINDER_TIMES.find((t) => t.value === v);
  if (preset) return preset.label;
  const { pm, hour12, minute } = splitTime(v);
  return `${pm ? '오후' : '오전'} ${hour12}시${minute ? ` ${minute}분` : ''}`;
}

/**
 * `now` 뒤에 처음 오는 그 시각. 정확히 그 시각이면 다음 날로 넘긴다 — 지금 막 울린 것을 다시 예약하지 않게.
 * 날짜 계산은 기기 시간대의 달력으로 한다(`setDate`) — 서머타임이 있는 곳에서도 「다음 날 정오」가 정오다
 */
export function nextFireAt(now: Date, time: ReminderTime): Date {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** 알림 문구. 몇 건인지는 예약하는 순간의 수다 — 앱이 뒤로 갈 때마다 다시 맞추므로 크게 어긋나지 않는다 */
export function reminderContent(unread: number): { title: string; body: string } {
  return {
    title: '꿈 기록을 확인해 볼까요',
    body: `확인 안 한 기록이 ${unread}건 있어요. 기억이 남아 있을 때 다듬어 두세요.`,
  };
}

/**
 * 무엇을 예약할지. 꺼져 있거나 확인할 기록이 없으면 아무것도 없다 — 그때는 이미 예약된 것도 지운다.
 * 결과가 같으면 같은 id로 다시 예약해 제자리에서 바뀐다
 */
export function planReminder(
  now: Date,
  time: ReminderTime | null,
  unread: number,
): { at: Date; title: string; body: string } | null {
  if (!time || unread <= 0) return null;
  return { at: nextFireAt(now, time), ...reminderContent(unread) };
}
