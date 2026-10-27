/**
 * 마이 탭의 기록 통계 세 가지(계획서 001 MY-1 — 총 기록 · 연속 기록일 · 이번 달).
 * 기록 시각(`recordedAt`, UTC 글자)만 받아 **기기 시간대의 날짜**로 센다 — 새벽 5시 기록이 전날로 밀리면 안 된다(이슈 #127).
 * 네이티브를 부르지 않아 `scripts/stats`가 그대로 돌린다.
 */

export type RecordStats = { total: number; streak: number; thisMonth: number };

/** 기기 시간대의 날짜 열쇠. 읽을 수 없는 시각은 null */
function dayKey(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 연속 기록일 — 오늘(없으면 어제)부터 하루씩 거슬러 올라가며 기록이 있는 날을 센다.
 * **오늘 아직 안 적었다고 0으로 만들지 않는다.** 아침에 앱을 열자마자 이어 오던 날수가 0으로 보이면 끊긴 줄 안다.
 * 어제도 없으면 끊긴 것이다
 */
export function recordStats(recordedAt: string[], now: Date = new Date()): RecordStats {
  const days = new Set<string>();
  let thisMonth = 0;
  for (const iso of recordedAt) {
    const d = new Date(iso);
    const k = dayKey(d);
    if (!k) continue;
    days.add(k);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) thisMonth += 1;
  }

  const cur = new Date(now);
  if (!days.has(dayKey(cur) ?? '')) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cur) ?? '')) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return { total: recordedAt.length, streak, thisMonth };
}
