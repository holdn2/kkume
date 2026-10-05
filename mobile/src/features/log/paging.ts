import type { Dream } from '@shared/db';

/**
 * 꿈 목록을 몇 건씩 읽는가. 카드가 한 화면에 6~8개 보이니 30건이면 네 화면쯤이고, 폰 SQLite 에서 바로 읽힌다.
 * 전에는 100건을 한 번에 읽고 거기서 멈춰 **101번째부터는 목록에 아예 나오지 않았다**(2026-10-02)
 */
export const DREAM_PAGE = 30;

/**
 * 다음 쪽을 붙인다. **이미 있는 id 는 버린다** — 쪽 사이에 새 기록이 생기면 offset 이 한 칸 밀려
 * 앞 쪽의 마지막 기록이 다음 쪽 첫 줄로 또 온다. 받은 쪽이 꽉 찼으면 더 있을 수 있다
 */
export function appendDreams(prev: Dream[], page: Dream[], pageSize = DREAM_PAGE): { rows: Dream[]; hasMore: boolean } {
  const seen = new Set(prev.map((d) => d.id));
  return { rows: [...prev, ...page.filter((d) => !seen.has(d.id))], hasMore: page.length >= pageSize };
}
