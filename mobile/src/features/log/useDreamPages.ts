import { useCallback, useEffect, useRef, useState } from 'react';

import { getDreamRepo, type Dream } from '@shared/db';

import { appendDreams, DREAM_PAGE } from './paging';

/**
 * 폰에 있는 꿈을 쪽으로 나눠 읽는다 — 꿈 로그 목록과 꿈 공유의 「꿈 고르기」가 함께 쓴다.
 *
 * - 끝에 닿으면 `more()`로 다음 30건을 잇는다. 쪽 사이에 새 기록이 생겨도 같은 기록은 한 번만(`appendDreams`)
 * - 검색어는 입력이 멈추면(200ms) 처음 쪽부터 다시 읽는다. 제목 · 본문에서 글자 그대로 찾는다(`list({ query })`)
 * - `reload()`는 **지금까지 읽은 만큼** 다시 읽는다 — 상세를 보고 돌아왔을 때 목록이 30건으로 잘려 스크롤이 튀지 않게
 * - 늦게 온 응답은 버린다. 검색어를 바꾼 뒤 앞 검색어의 결과가 덮어쓰지 않게 읽기마다 번호를 붙인다
 */
export function useDreamPages(query: string) {
  const [rows, setRows] = useState<Dream[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 전체 · 미확인 개수. 읽은 행이 아니라 저장소가 센다 — 쪽으로 나눠 읽어서 */
  const [counts, setCounts] = useState<{ total: number; unread: number } | null>(null);

  // 콜백 안에서 최신값을 읽으려고 ref 로도 든다. 렌더 중에는 읽지 않는다
  const current = useRef<{ rows: Dream[]; hasMore: boolean; query: string }>({ rows: [], hasMore: false, query: '' });
  const seq = useRef(0);
  const busy = useRef(false);

  const apply = (next: Dream[], more: boolean) => {
    current.current = { ...current.current, rows: next, hasMore: more };
    setRows(next);
    setHasMore(more);
    setError(null);
  };

  const reload = useCallback((keepCount = true) => {
    const my = ++seq.current;
    busy.current = true;
    const limit = keepCount ? Math.max(DREAM_PAGE, current.current.rows.length) : DREAM_PAGE;
    const q = current.current.query;
    getDreamRepo()
      .then((repo) => Promise.all([repo.list({ limit, query: q }), repo.counts(q)]))
      .then(([list, n]) => {
        if (my !== seq.current) return;
        apply(list, list.length >= limit);
        setCounts(n);
      })
      .catch((e) => {
        if (my === seq.current) setError(String(e));
      })
      .finally(() => {
        if (my === seq.current) busy.current = false;
      });
  }, []);

  const more = useCallback(() => {
    if (busy.current || !current.current.hasMore) return;
    const my = seq.current;
    busy.current = true;
    const { rows: prev, query: q } = current.current;
    getDreamRepo()
      .then((repo) => repo.list({ limit: DREAM_PAGE, offset: prev.length, query: q }))
      .then((page) => {
        if (my !== seq.current) return;
        const next = appendDreams(current.current.rows, page);
        apply(next.rows, next.hasMore);
      })
      .catch((e) => {
        if (my === seq.current) setError(String(e));
      })
      .finally(() => {
        if (my === seq.current) busy.current = false;
      });
  }, []);

  // 검색어가 멈추면 처음 쪽부터
  useEffect(() => {
    const t = setTimeout(() => {
      current.current = { rows: [], hasMore: false, query: query.trim() };
      reload(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, reload]);

  return { rows, hasMore, counts, error, reload, more };
}
