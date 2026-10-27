import { useSyncExternalStore } from 'react';

import { isComicRunning, type ComicStatus } from '@shared/api/comic';
import { onSignedOut } from '@shared/auth';
import { getDreamRepo, SETTINGS } from '@shared/db';

/**
 * 지켜보는 만화 id 하나(CM-2, 이슈 #148). 화면 · 쿼리와 떨어진 저장소다 — `queries.ts`(만들기)와 `watch.tsx`(탭바 위 줄)가
 * 둘 다 여기를 부른다. 서로를 부르면 순환이 생긴다(PR #150 리뷰 — RN에서 순환은 렌더 중 `undefined`로 나타난다).
 *
 * 폰에 적어 둔다(`SETTINGS.comicWatch`) — 만드는 중에 앱을 껐다 켜도 이어 보이게.
 */
let watched: string | null = null;
let loaded = false;
/** 바뀔 때마다 올린다. 앱을 켠 직후 읽던 옛 id가, 읽는 사이에 로그아웃 · 새 만화로 바뀐 값을 덮지 않게(PR #150 재검토) */
let generation = 0;
const listeners = new Set<() => void>();

function set(id: string | null) {
  generation += 1;
  watched = id;
  listeners.forEach((fn) => fn());
  void getDreamRepo()
    .then((repo) => repo.setSetting(SETTINGS.comicWatch, id ?? ''))
    .catch(() => {});
}

function load() {
  if (loaded) return;
  loaded = true;
  const at = generation;
  void getDreamRepo()
    .then((repo) => repo.getSetting(SETTINGS.comicWatch))
    .then((v) => {
      // 읽는 사이에 바뀌었으면(새 만화 · 로그아웃) 그쪽이 맞다
      if (v && at === generation) {
        watched = v;
        listeners.forEach((fn) => fn());
      }
    })
    // 읽지 못했으면 다음 구독 때 다시 읽는다
    .catch(() => {
      loaded = false;
    });
}

// 만화는 계정의 것이다 — 로그아웃 · 계정 삭제 뒤 다음 사람에게 남지 않게
onSignedOut(() => set(null));

/** 만화를 만들었으면(또는 이미 만드는 중인 것으로 보냈으면) 부른다. 앞의 것은 더 지켜보지 않는다 */
export function watchComic(id: string) {
  set(id);
}

/** 이 만화를 열었으면 부른다. 끝난 것만 놓는다 — 만드는 중에 열었다 나가면 계속 진행을 보여야 한다 */
export function seenComic(id: string, status: ComicStatus | undefined) {
  if (watched === id && status && !isComicRunning(status)) set(null);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  load();
  return () => listeners.delete(fn);
}

export function useWatchedComic() {
  return useSyncExternalStore(subscribe, () => watched);
}
