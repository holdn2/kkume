/**
 * `@shared/db`의 대역. `sync/index.ts`가 부르는 `getDreamRepo()`만 바꾼다 —
 * 진짜 것은 `expo-sqlite`를 열려고 하므로 Node에서 못 돈다.
 * 타입 · 설정 키(`SETTINGS`)는 진짜 파일을 그대로 쓴다.
 */
export * from '../../src/shared/db/types.ts';

export async function getDreamRepo() {
  return globalThis.__reproRepo;
}
