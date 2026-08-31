import { createMemoryRepo } from './memory';
import { createSqliteRepo, openSqlite } from './sqlite';
import type { DreamRepo } from './types';

export * from './types';

let repoPromise: Promise<DreamRepo> | null = null;
let backend: 'sqlite' | 'memory' | null = null;

/**
 * 저장소를 한 번만 만들어 돌려준다.
 *
 * `expo-sqlite`가 있으면 그것을, 없으면 메모리를 쓴다.
 * **어느 쪽인지는 화면이 알 필요가 없다** — 알아야 하는 것은 검수하는 사람뿐이라
 * `storageBackend()`로 따로 꺼낸다.
 */
export function getDreamRepo(): Promise<DreamRepo> {
  if (repoPromise) return repoPromise;

  repoPromise = (async () => {
    try {
      const db = await openSqlite();
      if (db) {
        const repo = createSqliteRepo(db);
        await repo.init();
        backend = 'sqlite';
        return repo;
      }
    } catch {
      // SQLite를 열다 실패해도 기록을 못 받는 상태로 두지 않는다.
      // 메모리라도 받아 두면 적어도 화면에는 남고, 사용자는 적은 것이 사라지지 않는다
    }
    const repo = createMemoryRepo();
    await repo.init();
    backend = 'memory';
    return repo;
  })().catch((e) => {
    // **실패한 약속을 캐시에 남기면 앱이 살아 있는 동안 다시는 저장할 수 없다.**
    // 한 번의 실패가 그 세션 전체의 기록을 막는다 — 새벽에는 그게 전부다
    repoPromise = null;
    throw e;
  });

  return repoPromise;
}

/**
 * 지금 무엇으로 저장하고 있는지. **검수 화면에 반드시 띄운다.**
 * 메모리인 줄 모르고 "저장이 되네"라고 판정하면 그 판정이 통째로 거짓이 된다.
 */
export function storageBackend() {
  return backend;
}
