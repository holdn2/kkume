import { createMemoryRepo } from './memory';
import { createSqliteRepo, openSqlite } from './sqlite';
import type { DreamRepo } from './types';

export * from './types';

let repoPromise: Promise<DreamRepo> | null = null;
let backend: 'sqlite' | 'memory' | null = null;
/** SQLite가 있는데 열다 실패해서 메모리로 넘어왔다. 모듈이 없는 빌드(개발 · 스토리북)의 메모리와 가른다 */
let failed = false;

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
      // SQLite를 열다 실패해도 기록을 못 받는 상태로 두지 않는다 — 메모리라도 받아 두면 이 세션 동안은 화면에 남는다.
      // **다만 앱을 닫으면 사라진다.** 조용히 넘어가면 사용자는 저장된 줄 알고, 빈 목록을 보고 앱을 지우기도 한다.
      // 그래서 실패로 넘어온 것을 표시해 두고 화면이 알린다(`storageFailed`, 문서 104 S1)
      failed = true;
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

/**
 * 기기 저장소(SQLite)를 열지 못해 **앱을 닫으면 사라지는 메모리에 저장하고 있다.** 기록 화면 · 꿈 로그가 이걸 보고 알린다.
 * 다시 시도는 앱을 새로 켤 때 한다 — 이미 메모리에 받은 기록을 두고 저장소를 바꾸면 그 기록이 갈라진다
 */
export function storageFailed() {
  return failed;
}
