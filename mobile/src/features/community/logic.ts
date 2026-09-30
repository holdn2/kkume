import type { CommunityApi, NewPost, PostSummary } from '@shared/api/community';
import { SETTINGS } from '@shared/db/types';

/**
 * 커뮤니티 화면 곁의 순수 도우미. 네이티브 · React 없이 `scripts/community`(H1~H6)가 확인한다.
 */

/**
 * 다음 쪽을 붙인다. **이미 있는 id 는 버린다** — 공감순은 쪽을 넘기는 사이에 순서가 움직여
 * 같은 글이 두 번 올 수 있다(서버 계약 056 "정렬과 커서"). 빠지는 글은 새로고침에서 다시 보인다
 */
export function mergePage<T extends Pick<PostSummary, 'id'>>(prev: T[], next: T[]): T[] {
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

/**
 * 꿈을 공유한다. **먼저 동기화한다** — 서버는 글쓰기 때 그 꿈이 내 것인지 `dreams`에서 확인해서,
 * 방금 남긴 꿈은 아직 서버에 없을 수 있다(056 "동작 규칙"). 그래도 `404 dream_not_found`면
 * 한 번 더 동기화하고 다시 보낸다. 두 번째도 실패하면 그 오류를 그대로 던진다
 */
export async function shareDream(
  api: Pick<CommunityApi, 'createPost'>,
  sync: () => Promise<unknown>,
  input: NewPost,
): Promise<PostSummary> {
  await sync().catch(() => {});
  try {
    return await api.createPost(input);
  } catch (e) {
    if ((e as { code?: string })?.code !== 'dream_not_found') throw e;
    await sync().catch(() => {});
    return api.createPost(input);
  }
}

type Settings = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };

const BLOCKED_KEY = SETTINGS.blockedUsers;

/**
 * 가짜 서버 기간에 폰에 쌓인 차단(`blocked_users`)을 서버로 옮긴다(056 04장 1).
 * **전부 올렸을 때만 비운다** — 하나라도 실패하면 그대로 두고 다음 로그인 때 다시 한다.
 * 이미 올린 것을 다시 올려도 서버에서 한 번으로 남아 해가 없다
 */
export async function migrateLocalBlocks(
  api: { block: (userId: string) => Promise<void> },
  settings: Settings,
): Promise<{ moved: number; failed: number }> {
  const raw = await settings.get(BLOCKED_KEY);
  let list: { id: string }[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((u) => typeof u?.id === 'string');
  } catch {
    list = [];
  }
  if (list.length === 0) return { moved: 0, failed: 0 };
  let moved = 0;
  let failed = 0;
  for (const u of list) {
    try {
      await api.block(u.id);
      moved += 1;
    } catch (e) {
      // 가짜 서버 기간의 차단은 가짜 사용자를 가리켜 진짜 서버가 404 user_not_found 를 준다.
      // 옮길 사람이 없는 것이라 실패로 세지 않는다 — 세면 폰 목록이 영영 안 빈다
      const code = (e as { code?: string })?.code;
      if (code !== 'user_not_found' && code !== 'self_block') failed += 1;
    }
  }
  if (failed === 0) await settings.set(BLOCKED_KEY, '[]');
  return { moved, failed };
}
