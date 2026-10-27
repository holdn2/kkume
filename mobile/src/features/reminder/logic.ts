/**
 * 낮 확인 알림(LOG-3 유도, 이슈 #145)의 순수한 부분 — 시각 고르기 · 다음 예약 시각 · 문구.
 * 네이티브를 부르지 않아 `scripts/reminder`가 그대로 돌린다.
 */

/** 저장값은 `HH:MM`(기기 시간대). 비어 있으면 꺼 둔 것이다 */
export type ReminderTime = string;

/**
 * 고를 수 있는 시각. 계획서 001이 미뤄 둔 「낮 확인 알림 시각」(고정값 / 기상 시각 + N / 사용자 설정)을
 * **몇 개 중에서 고르기**로 정했다 — 기상 시각은 지웠고(문서 022), 시각을 분 단위로 고르게 하면 시계 휠이 필요한데
 * 그 정밀도가 쓸모없다
 */
export const REMINDER_TIMES: { value: ReminderTime; label: string }[] = [
  { value: '09:00', label: '오전 9시' },
  { value: '12:00', label: '정오' },
  { value: '18:00', label: '오후 6시' },
];

/** 저장값을 읽는다. 알 수 없는 값은 꺼진 것으로 본다 — 옛 값이 남아도 엉뚱한 시각에 울리지 않게 */
export function parseReminderTime(v: string | null | undefined): ReminderTime | null {
  return REMINDER_TIMES.some((t) => t.value === v) ? (v as ReminderTime) : null;
}

export function reminderLabel(v: ReminderTime | null): string {
  return REMINDER_TIMES.find((t) => t.value === v)?.label ?? '끔';
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
