/**
 * 재현 테스트가 기대는 바꿔 끼우기 둘.
 *
 * - Node 내장 SQLite를 `expo-sqlite`의 `Db` 모양(execAsync · runAsync · getAllAsync ·
 *   getFirstAsync)으로 감싼다. **수정하지 않은 `sqlite.ts`의 SQL이 진짜 SQLite에서 돈다.**
 * - `syncOnce`가 부르는 `getDreamRepo()`를 테스트가 만든 저장소로 돌린다.
 */
import { DatabaseSync } from 'node:sqlite';

export function openNodeDb() {
  const db = new DatabaseSync(':memory:');
  // node:sqlite는 undefined를 받지 않는다. expo-sqlite는 null로 넣으므로 맞춘다
  const norm = (params = []) => params.map((v) => (v === undefined ? null : v));
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      return db.prepare(sql).run(...norm(params));
    },
    async getAllAsync(sql, params) {
      return db.prepare(sql).all(...norm(params));
    },
    async getFirstAsync(sql, params) {
      return db.prepare(sql).get(...norm(params)) ?? null;
    },
  };
}
