import {
  QueryClient,
  focusManager,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isApiError } from '@shared/api/client';
import { onAccountGone } from '@shared/auth';
import type { FeedSort, Page, PostDetail, PostSummary } from '@shared/api/community';

import { getCommunityApi } from './api';
import { mergePage } from './logic';

/**
 * 커뮤니티 서버 응답의 캐시(TanStack Query).
 *
 * - **키에 로그인한 사람을 넣는다.** `likedByMe` · `hidden` · 차단 거르기가 누가 보느냐로 달라서,
 *   로그인 · 로그아웃 사이에 남의 응답을 보여 주면 안 된다
 * - **쓰고 나면 `['community']` 전체를 무효로 한다.** 글 하나가 피드 · 내 글 · 프로필 · 꿈 상세의
 *   「공유한 글 보기」에 함께 걸려 있어서, 하나씩 고르다 빠뜨리는 것보다 전부 다시 읽는 편이 맞다.
 *   화면에 떠 있는 것만 곧바로 다시 읽고 나머지는 다음에 열 때 읽는다
 * - 공감만은 누르는 즉시 그려 놓고(낙관적) 서버 값으로 맞춘다
 * - 4xx 는 다시 시도하지 않는다 — 없는 글 · 로그인 필요는 다시 물어도 같다
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && count < 1,
    },
  },
});

// 앱이 앞으로 나오면 떠 있는 화면의 오래된 응답을 다시 읽는다. RN 에는 창 포커스가 없어 AppState 로 잇는다
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});

// 계정이 없어지면 남의 눈에 보이던 내 정보(공감 · 숨긴 내 글 · 차단 목록)를 캐시에서 비운다(이슈 #65)
onAccountGone(() => queryClient.clear());

const who = (meId: string | null | undefined) => meId ?? 'anon';

export const communityKeys = {
  all: ['community'] as const,
  feed: (meId: string | null | undefined, sort: FeedSort) => ['community', who(meId), 'feed', sort] as const,
  userPosts: (meId: string | null | undefined, userId: string, sort: FeedSort) =>
    ['community', who(meId), 'userPosts', userId, sort] as const,
  post: (meId: string | null | undefined, id: string) => ['community', who(meId), 'post', id] as const,
  profile: (meId: string | null | undefined, id: string) => ['community', who(meId), 'profile', id] as const,
  postForDream: (meId: string | null | undefined, dreamId: string) =>
    ['community', who(meId), 'postForDream', dreamId] as const,
  blocks: (meId: string | null | undefined) => ['community', who(meId), 'blocks'] as const,
};

/** 쓰고 난 뒤 부른다. 떠 있는 화면은 곧바로, 나머지는 다음에 열 때 다시 읽는다 */
export function useInvalidateCommunity() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: communityKeys.all }), [qc]);
}

/**
 * 화면에 다시 돌아오면 오래된 것만 다시 읽는다. 처음 열 때는 쿼리가 알아서 읽으므로 건너뛴다.
 * 다른 화면에서 쓴 것은 무효로 표시돼 있어 여기서 다시 읽힌다
 */
export function useRefetchOnFocus(refetch: (o?: { cancelRefetch?: boolean }) => unknown, isStale: boolean) {
  const first = useRef(true);
  // 값은 ref 로 읽는다. 콜백 의존성에 넣으면 포커스된 채로 isStale 이 바뀔 때마다(30초마다, 처음 켜질 때)
  // useFocusEffect 가 다시 돌아 화면에 머무는 동안에도 다시 받았다(리뷰 지적, 0b7301b)
  const latest = useRef({ refetch, isStale });
  // 렌더 중에는 ref 를 쓰지 않는다. 이 effect 가 아래 포커스 effect 보다 먼저 선언돼 먼저 돈다
  useEffect(() => {
    latest.current = { refetch, isStale };
  });
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      // 이미 받는 중이면 끊지 않는다 — 기본값(cancelRefetch: true)은 막 시작한 요청을 취소하고 다시 보낸다
      if (latest.current.isStale) void latest.current.refetch({ cancelRefetch: false });
    }, []),
  );
}

/** 당겨서 새로고침. 스피너는 사용자가 당겼을 때만 — 뒤에서 다시 받을 때 켜면 목록이 스피너만큼 밀린다 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}

type PageFetcher = (cursor: string | null) => Promise<Page<PostSummary>>;

/** 무한 스크롤 목록. 쪽을 이어 붙일 때 이미 있는 id 는 버린다 — 공감순은 쪽 사이에 순서가 움직인다(056) */
function usePostPages(key: readonly unknown[], fetchPage: PageFetcher, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
  const items = useMemo(
    () => (query.data?.pages ?? []).reduce<PostSummary[]>((acc, p) => mergePage(acc, p.items), []),
    [query.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { ...query, items, more };
}

export function useFeed(meId: string | null | undefined, sort: FeedSort) {
  return usePostPages(communityKeys.feed(meId, sort), (cursor) => getCommunityApi().feed(sort, cursor), meId !== undefined);
}

export function useUserPosts(meId: string | null | undefined, userId: string | null | undefined, sort: FeedSort) {
  return usePostPages(
    communityKeys.userPosts(meId, userId ?? '', sort),
    (cursor) => getCommunityApi().userPosts(userId ?? '', sort, cursor),
    meId !== undefined && !!userId,
  );
}

export function usePost(meId: string | null | undefined, id: string) {
  return useQuery({
    queryKey: communityKeys.post(meId, id),
    queryFn: () => getCommunityApi().post(id),
    enabled: meId !== undefined && !!id,
  });
}

export function useProfile(meId: string | null | undefined, id: string) {
  return useQuery({
    queryKey: communityKeys.profile(meId, id),
    queryFn: () => getCommunityApi().profile(id),
    enabled: meId !== undefined && !!id,
  });
}

/** 이 꿈을 나눈 내 글. 모르는 동안과 못 물었을 때는 null 로 본다 — 글쓰기 화면이 다시 확인한다 */
export function usePostForDream(meId: string | null | undefined, dreamId: string | null | undefined) {
  return useQuery({
    queryKey: communityKeys.postForDream(meId, dreamId ?? ''),
    queryFn: () => getCommunityApi().postForDream(dreamId ?? ''),
    enabled: meId !== undefined && !!dreamId,
  });
}

/**
 * 글 하나를 캐시 곳곳에서 함께 고친다 — 글 상세와, 캐시에 있는 목록들(피드 · 내 글 · 프로필)의 같은 글.
 * 공감을 먼저 그려 둘 때 쓴다. 실패하면 반대 패치로 되돌린다(스냅샷 통째 복원은 그 사이 바뀐 것까지 덮는다)
 */
export function patchPostEverywhere(
  qc: QueryClient,
  postId: string,
  patch: (p: PostSummary) => Partial<PostSummary>,
): void {
  qc.setQueriesData<PostDetail | null>({ queryKey: communityKeys.all, predicate: (q) => q.queryKey[2] === 'post' }, (old) =>
    old && old.id === postId ? { ...old, ...patch(old) } : old,
  );
  qc.setQueriesData<InfiniteData<Page<PostSummary>>>(
    { queryKey: communityKeys.all, predicate: (q) => q.queryKey[2] === 'feed' || q.queryKey[2] === 'userPosts' },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((pg) => ({
          ...pg,
          items: pg.items.map((it) => (it.id === postId ? { ...it, ...patch(it) } : it)),
        })),
      },
  );
}
