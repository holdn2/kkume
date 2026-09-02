import { requireOptionalNativeModule } from 'expo-modules-core';

import { LATEST_VERSION, MIGRATIONS } from './migrations';
import {
  newId,
  nowIso,
  type Dream,
  type DreamDraft,
  type DreamPatch,
  type DreamRepo,
  type ListOptions,
} from './types';

/** DB 파일 이름. 바꾸면 기존 기록을 못 찾는다 — 절대 바꾸지 않는다 */
const DB_NAME = 'kkume.db';

type Row = {
  id: string;
  user_id: string | null;
  recorded_at: string;
  title: string | null;
  text: string | null;
  audio_path: string | null;
  duration_ms: number | null;
  stt_status: string;
  emotion: string | null;
  keywords: string | null;
  characters: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  synced_at: string | null;
};

function toDream(r: Row): Dream {
  return {
    id: r.id,
    userId: r.user_id,
    recordedAt: r.recorded_at,
    title: r.title,
    text: r.text,
    audioPath: r.audio_path,
    durationMs: r.duration_ms,
    sttStatus: (r.stt_status === 'done' || r.stt_status === 'failed' ? r.stt_status : 'pending'),
    emotion: r.emotion,
    keywords: r.keywords,
    characters: r.characters,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    syncedAt: r.synced_at,
  };
}

/** 컬럼 이름은 한 곳에서만 쓴다. 여기가 SQL과 타입이 만나는 유일한 지점이다 */
const COLS =
  'id, user_id, recorded_at, title, text, audio_path, duration_ms, stt_status, emotion, keywords, characters, created_at, updated_at, deleted_at, synced_at';

const FIELD_TO_COL: Record<string, string> = {
  userId: 'user_id',
  recordedAt: 'recorded_at',
  title: 'title',
  text: 'text',
  audioPath: 'audio_path',
  durationMs: 'duration_ms',
  sttStatus: 'stt_status',
  emotion: 'emotion',
  keywords: 'keywords',
  characters: 'characters',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  syncedAt: 'synced_at',
};

type Db = {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
};

/**
 * 네이티브 모듈이 **이 빌드에** 들어 있는가.
 *
 * 처음에는 `require`를 try/catch로 감쌌는데 그걸로는 부족했다 —
 * `expo-sqlite`는 모듈을 읽는 순간 `requireNativeModule('ExpoSQLite')`로 던지고,
 * 그 예외가 콘솔에 빨간 ERROR로 남는다. 잡히든 안 잡히든 **검수하는 사람에게는
 * 앱이 깨진 것처럼 보인다.** 아예 부르지 않는 편이 낫다.
 *
 * `requireOptionalNativeModule`은 없으면 null을 주므로 던지지 않고 물어볼 수 있다.
 * 오디오 어댑터와 같은 방식이다.
 */
export const HAS_NATIVE_SQLITE = requireOptionalNativeModule('ExpoSQLite') != null;

export async function openSqlite(): Promise<Db | null> {
  if (!HAS_NATIVE_SQLITE) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require('expo-sqlite');
    return (await SQLite.openDatabaseAsync(DB_NAME)) as Db;
  } catch {
    return null;
  }
}

export function createSqliteRepo(db: Db): DreamRepo {
  return {
    async init() {
      // WAL은 쓰는 중에 읽기가 막히지 않게 한다. 새벽에 녹음하며 목록을 여는 경로가 있다
      await db.execAsync('PRAGMA journal_mode = WAL;');

      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      const current = row?.user_version ?? 0;
      if (current >= LATEST_VERSION) return;

      for (const m of MIGRATIONS) {
        if (m.version <= current) continue;
        // 한 버전이 통째로 성공하거나 통째로 실패해야 한다.
        // 절반만 적용된 스키마는 다음 실행에서 알아낼 방법이 없다
        await db.execAsync('BEGIN;' + m.up + `PRAGMA user_version = ${m.version};` + 'COMMIT;');
      }
    },

    async create(draft: DreamDraft) {
      const ts = nowIso();
      const d: Dream = {
        id: newId(),
        userId: null,
        recordedAt: draft.recordedAt ?? ts,
        title: draft.title ?? null,
        text: draft.text ?? null,
        audioPath: draft.audioPath ?? null,
        durationMs: draft.durationMs ?? null,
        sttStatus: draft.sttStatus ?? 'pending',
        emotion: null,
        keywords: null,
        characters: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncedAt: null,
      };
      await db.runAsync(
        `INSERT INTO dreams (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id, d.userId, d.recordedAt, d.title, d.text, d.audioPath, d.durationMs, d.sttStatus,
          d.emotion, d.keywords, d.characters, d.createdAt, d.updatedAt, d.deletedAt, d.syncedAt,
        ],
      );
      return d;
    },

    async update(id: string, patch: DreamPatch) {
      const entries = Object.entries(patch).filter(([k]) => k in FIELD_TO_COL);
      const sets = entries.map(([k]) => `${FIELD_TO_COL[k]} = ?`);
      const values = entries.map(([, v]) => v as unknown);

      sets.push('updated_at = ?');
      values.push(nowIso());
      values.push(id);

      await db.runAsync(`UPDATE dreams SET ${sets.join(', ')} WHERE id = ?`, values);
      return this.get(id);
    },

    async get(id: string) {
      const row = await db.getFirstAsync<Row>(`SELECT ${COLS} FROM dreams WHERE id = ?`, [id]);
      return row ? toDream(row) : null;
    },

    async list(options: ListOptions = {}) {
      const { includeDeleted = false, limit, offset = 0 } = options;
      const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
      const rows = await db.getAllAsync<Row>(
        `SELECT ${COLS} FROM dreams ${where} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`,
        [limit ?? -1, offset],
      );
      return rows.map(toDream);
    },

    async softDelete(id: string) {
      const ts = nowIso();
      await db.runAsync('UPDATE dreams SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    },

    async clear() {
      await db.runAsync('DELETE FROM dreams');
    },

    async getSetting(key: string) {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return row?.value ?? null;
    },

    async setSetting(key: string, value: string) {
      await db.runAsync(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [key, value, nowIso()],
      );
    },
  };
}
