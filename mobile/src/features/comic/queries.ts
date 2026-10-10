import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { COMIC_POLL_MS, isComicRunning, type NewComic } from '@shared/api/comic';

import { getComicApi } from './api';

/**
 * 만화 응답의 캐시. 커뮤니티와 같은 `queryClient` 를 쓰므로(`app/_layout.tsx`) 계정이 없어지면
 * 함께 비워진다(`@features/community/queries` 의 `onAccountGone`).
 * **키에 로그인한 사람을 넣는다** — 남의 만화를 보여 주지 않게.
 */
const who = (meId: string | null | undefined) => meId ?? 'anon';

export const comicKeys = {
  all: ['comic'] as const,
  one: (meId: string | null | undefined, id: string) => ['comic', who(meId), 'one', id] as const,
  forDream: (meId: string | null | undefined, dreamId: string) => ['comic', who(meId), 'forDream', dreamId] as const,
};

/** 만화 하나. 만드는 중이면 2초마다 다시 묻고, 끝나면 멈춘다 */
export function useComic(meId: string | null | undefined, id: string | null | undefined) {
  return useQuery({
    queryKey: comicKeys.one(meId, id ?? ''),
    queryFn: () => getComicApi().get(id ?? ''),
    enabled: !!meId && !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && isComicRunning(s) ? COMIC_POLL_MS : false;
    },
    // 이미지 주소가 짧게 살아 있다 — 끝난 만화도 화면에 돌아오면 다시 받는다(081 02장)
    staleTime: 0,
  });
}

/** 이 꿈의 만화들(최신순). 꿈 상세가 「만화 보기」를 고를 때 쓴다 */
export function useComicsForDream(meId: string | null | undefined, dreamId: string | null | undefined) {
  return useQuery({
    queryKey: comicKeys.forDream(meId, dreamId ?? ''),
    queryFn: () => getComicApi().forDream(dreamId ?? ''),
    enabled: !!meId && !!dreamId,
  });
}

/** 만들기 · 지우기. 성공하면 만화 캐시를 모두 무효로 한다 */
export function useComicActions() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: comicKeys.all }), [qc]);
  const create = useCallback(
    async (input: NewComic) => {
      const comic = await getComicApi().create(input);
      void invalidate();
      return comic;
    },
    [invalidate],
  );
  const remove = useCallback(
    async (id: string) => {
      await getComicApi().remove(id);
      void invalidate();
    },
    [invalidate],
  );
  return { create, remove };
}
