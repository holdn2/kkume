/**
 * 커뮤니티 화면의 표시 도우미. 폴더 안의 파일은 배럴(`./index`)이 아니라 이 파일을 직접 부른다 —
 * 폴더 안에서 배럴을 거치면 순환이 생기고, RN 에서 순환은 에러가 아니라 `undefined`로 나타난다(CLAUDE.md).
 */

/** "3시간 전"처럼. 일주일이 넘으면 날짜로 쓴다 */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const t = new Date(iso);
  return `${t.getMonth() + 1}월 ${t.getDate()}일`;
}

export const REPORT_REASONS = [
  { value: 'sexual', label: '음란물 · 선정적 내용' },
  { value: 'violence', label: '폭력적 · 혐오 표현' },
  { value: 'spam', label: '스팸 · 광고' },
  { value: 'other', label: '기타' },
] as const;
