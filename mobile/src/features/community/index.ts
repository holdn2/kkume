import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Author } from '@shared/api/community';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo } from '@shared/db';

import { getCommunityApi } from './api';
import { migrateLocalBlocks } from './logic';
import { communityKeys } from './queries';

export { getCommunityApi } from './api';

/**
 * 지금 로그인한 사람. 로그인 전이면 null — 읽기는 되고 쓰기는 로그인을 부탁한다.
 * **만료된 세션은 로그인 전으로 본다** — 마이 탭(`@shared/auth`)과 같다. 토큰을 붙이지 않으니 쓰기가 401 이 된다.
 * **화면에 돌아올 때마다 다시 읽는다** — 탭 화면은 떠 있는 채로 남아서, 마이 탭에서 로그인하고 돌아와도
 * 처음 읽은 "로그인 전"이 그대로 남았다
 */
export function useMe(): Author | null | undefined {
  const [me, setMe] = useState<Author | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadSession().then((s) => {
        if (!alive) return;
        const next = s && !isExpired(s) ? { id: s.user.id, nickname: s.user.nickname } : null;
        // 같은 사람이면 그대로 둔다 — 새 객체를 넣으면 이것에 걸린 쿼리 키 · effect 가 다시 돈다
        setMe((prev) => (prev?.id === next?.id && prev?.nickname === next?.nickname && prev !== undefined ? prev : next));
      });
      return () => {
        alive = false;
      };
    }, []),
  );
  return me;
}

/**
 * 차단 목록. **서버에 둔다**(서버 계약 056 04장 1) — 앱을 지우면 사라지고, 앱에서 거르면 쪽이 비어 온다.
 * 서버가 피드와 글 상세의 댓글을 거르므로 화면은 거르지 않는다. 차단한 사람의 글 상세 · 프로필은
 * 서버도 거르지 않아서(일부러 들어온 경우) 화면이 "차단한 사용자입니다"를 띄우는 데 이 목록을 쓴다.
 *
 * 가짜 서버 기간에 폰(`blocked_users`)에 쌓인 차단은 로그인 뒤 처음 읽을 때 서버로 옮긴다 —
 * 전부 올렸을 때만 폰에서 비운다(`migrateLocalBlocks`). 로그인하지 않았으면 차단이 없다.
 */
export type Blocked = Author[];

async function readBlocked(): Promise<Blocked> {
  const session = await loadSession();
  if (!session || isExpired(session)) return [];
  const api = getCommunityApi();
  const repo = await getDreamRepo();
  await migrateLocalBlocks(api, {
    get: (k) => repo.getSetting(k),
    set: (k, v) => repo.setSetting(k, v),
  }).catch(() => {});
  return api.blocks();
}

export async function setBlocked(user: Author, blocked: boolean): Promise<void> {
  const api = getCommunityApi();
  if (blocked) await api.block(user.id);
  else await api.unblock(user.id);
}

export function useBlocked(meId: string | null | undefined) {
  const query = useQuery({
    queryKey: communityKeys.blocks(meId),
    queryFn: readBlocked,
    enabled: !!meId,
  });
  const list = meId ? (query.data ?? []) : [];
  const ids = new Set(list.map((u) => u.id));
  // 받는 중 · 실패를 빈 목록과 가른다 — 차단 목록 화면이 "없습니다"를 응답 전에 띄우지 않게(PR #64 리뷰)
  return { list, ids, reload: query.refetch, loading: !!meId && query.isPending, failed: !!meId && query.isError };
}

export { mergePage, shareDream } from './logic';
export {
  communityKeys,
  patchPostEverywhere,
  queryClient,
  useFeed,
  useInvalidateCommunity,
  usePost,
  usePostForDream,
  useProfile,
  usePullRefresh,
  useRefetchOnFocus,
  useUserPosts,
} from './queries';
export { ago, REPORT_REASONS } from './format';
