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
    const db = await openSqlite();
    if (db) {
      const repo = createSqliteRepo(db);
      await repo.init();
      backend = 'sqlite';
      return repo;
    }
    const repo = createMemoryRepo();
    await repo.init();
    backend = 'memory';
    return repo;
  })();

  return repoPromise;
}

/**
 * 지금 무엇으로 저장하고 있는지. **검수 화면에 반드시 띄운다.**
 * 메모리인 줄 모르고 "저장이 되네"라고 판정하면 그 판정이 통째로 거짓이 된다.
 */
export function storageBackend() {
  return backend;
}
