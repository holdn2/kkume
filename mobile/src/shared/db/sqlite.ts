import { requireOptionalNativeModule } from 'expo-modules-core';

import { LATEST_VERSION, MIGRATIONS } from './migrations';
import {
  afterIso,
  newId,
  nowIso,
  type Dream,
  type DreamDraft,
  type DreamPatch,
  type DreamRepo,
  type ListOptions,
  type SentVersion,
  type ServerDream,
  toMillisIso,
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
  reviewed_at: string | null;
  emotion: string | null;
  keywords: string | null;
  characters: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  synced_at: string | null;
  audio_uploaded_at: string | null;
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
    reviewedAt: r.reviewed_at,
    emotion: r.emotion,
    keywords: r.keywords,
    characters: r.characters,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    syncedAt: r.synced_at,
    audioUploadedAt: r.audio_uploaded_at,
  };
}

/** 컬럼 이름은 한 곳에서만 쓴다. 여기가 SQL과 타입이 만나는 유일한 지점이다 */
const COLS =
  'id, user_id, recorded_at, title, text, audio_path, duration_ms, stt_status, reviewed_at, emotion, keywords, characters, created_at, updated_at, deleted_at, synced_at, audio_uploaded_at';

const FIELD_TO_COL: Record<string, string> = {
  userId: 'user_id',
  recordedAt: 'recorded_at',
  title: 'title',
  text: 'text',
  audioPath: 'audio_path',
  durationMs: 'duration_ms',
  sttStatus: 'stt_status',
  reviewedAt: 'reviewed_at',
  emotion: 'emotion',
  keywords: 'keywords',
  characters: 'characters',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  syncedAt: 'synced_at',
  audioUploadedAt: 'audio_uploaded_at',
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
        reviewedAt: null,
        emotion: null,
        keywords: null,
        characters: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncedAt: null,
        audioUploadedAt: null,
      };
      await db.runAsync(
        `INSERT INTO dreams (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id, d.userId, d.recordedAt, d.title, d.text, d.audioPath, d.durationMs, d.sttStatus,
          d.reviewedAt, d.emotion, d.keywords, d.characters, d.createdAt, d.updatedAt, d.deletedAt, d.syncedAt,
          d.audioUploadedAt,
        ],
      );
      return d;
    },

    async update(id: string, patch: DreamPatch) {
      // 직전 버전보다 반드시 뒤인 시각을 쓴다 — 같은 밀리초에 고치면 동기화가 못 본다(afterIso 주석)
      const current = await this.get(id);
      if (!current) return null;
      const entries = Object.entries(patch).filter(([k]) => k in FIELD_TO_COL);
      const sets = entries.map(([k]) => `${FIELD_TO_COL[k]} = ?`);
      const values = entries.map(([, v]) => v as unknown);

      sets.push('updated_at = ?');
      values.push(afterIso(nowIso(), current.updatedAt, current.syncedAt));
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
      const query = options.query?.trim() ?? '';
      const conds: string[] = [];
      const params: unknown[] = [];
      if (!includeDeleted) conds.push('deleted_at IS NULL');
      if (query) {
        // instr 는 글자 그대로 찾는다 — LIKE 처럼 % · _ 를 이스케이프할 필요가 없다. 한글은 대소문자가 없다
        conds.push("(instr(coalesce(title, ''), ?) > 0 OR instr(coalesce(text, ''), ?) > 0)");
        params.push(query, query);
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const rows = await db.getAllAsync<Row>(
        `SELECT ${COLS} FROM dreams ${where} ORDER BY recorded_at DESC LIMIT ? OFFSET ?`,
        [...params, limit ?? -1, offset],
      );
      return rows.map(toDream);
    },

    async softDelete(id: string) {
      const current = await this.get(id);
      if (!current) return;
      // 지우는 것도 서버에 가야 하는 변경이라 update 와 같은 시각 규칙을 쓴다
      const ts = afterIso(nowIso(), current.updatedAt, current.syncedAt);
      await db.runAsync('UPDATE dreams SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    },

    async clear() {
      await db.runAsync('DELETE FROM dreams');
    },

    async listUnsynced(limit = 100) {
      // `idx_dreams_unsynced`는 `synced_at IS NULL`만 덮는 부분 인덱스라
      // 뒤쪽 조건은 인덱스를 못 탄다. 그래도 조건을 뺄 수 없다 —
      // **올린 뒤에 고친 기록**이 빠지면 그 수정이 영영 안 올라간다.
      // 오래된 것부터 보낸다. 배치가 잘려도 앞의 것이 먼저 반영된다
      const rows = await db.getAllAsync<Row>(
        `SELECT ${COLS} FROM dreams WHERE synced_at IS NULL OR updated_at > synced_at ` +
          'ORDER BY updated_at ASC LIMIT ?',
        [limit],
      );
      return rows.map(toDream);
    },

    async markSynced(sent: SentVersion[]) {
      // **보낸 그 버전일 때만 표시한다.** 요청이 떠 있는 동안 고쳤으면 updated_at이 달라져
      // 조건에 안 맞고, 다음 회차에 다시 나간다. synced_at에는 보낸 updatedAt을 넣어
      // "깨끗하다"가 updated_at = synced_at 이 되게 한다(재현 테스트 A)
      for (const v of sent) {
        await db.runAsync('UPDATE dreams SET synced_at = ? WHERE id = ? AND updated_at = ?', [
          v.updatedAt,
          v.id,
          v.updatedAt,
        ]);
      }
    },

    async upsertFromServer(d: ServerDream) {
      // 시각은 한 모양으로 맞춘다. 로컬 두 칸은 문자열로 비교되기 때문이다(재현 테스트 C2)
      const version = toMillisIso(d.clientUpdatedAt);
      // `audio_path`와 `stt_status`를 목록에서 뺐다. 이유는 `DreamRepo`에 적어 뒀다 —
      // 서버의 `audioUrl`은 S3 주소라 로컬 파일 경로와 같은 자리가 아니다.
      //
      // **덮는 조건은 둘 중 하나다**(WHERE).
      //  1. 로컬이 깨끗하다 — 올릴 것이 없으니 서버 내용을 그대로 받는다
      //  2. 서버 쪽 버전이 로컬 수정보다 늦다 — 서버의 올리기 판정과 **같은 규칙**이다.
      //     clientUpdatedAt이 늦은 쪽이 이긴다
      // 1만 두면 기기 둘에서 서버 쪽이 이겼을 때 영영 안 맞춰진다. 로컬을 남겨 두면 다음
      // 올리기가 skipped로 깨끗해지는데, 그 행은 이미 since를 지나 다시 내려오지 않는다
      // (재현 테스트 B4). 조건 없이 덮으면 로컬이 이긴 수정이 사라진다(B1 · B2 · B3).
      // 두 칸은 같은 형식이라 문자열 비교가 시각 비교와 같다.
      // updated_at · synced_at 둘 다 그 버전을 만든 기기의 시각이다 — 서버 시계를 섞지
      // 않는다(재현 테스트 C)
      await db.runAsync(
        'INSERT INTO dreams (id, recorded_at, title, text, duration_ms, reviewed_at, ' +
          'created_at, updated_at, deleted_at, synced_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET ' +
          'recorded_at = excluded.recorded_at, title = excluded.title, text = excluded.text, ' +
          'duration_ms = excluded.duration_ms, reviewed_at = excluded.reviewed_at, ' +
          'updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, ' +
          'synced_at = excluded.synced_at ' +
          'WHERE (dreams.synced_at IS NOT NULL AND dreams.updated_at <= dreams.synced_at) ' +
          'OR excluded.updated_at > dreams.updated_at',
        [
          d.id,
          // 날짜 칸도 기기 모양(밀리초 3자리)으로 맞춘다. 서버는 "…57.000Z"를 "…57Z"로
          // 돌려주는데, 목록이 recorded_at을 문자열로 정렬해서 같은 초 안 순서가 뒤집힌다(재현 테스트 F)
          toMillisIso(d.recordedAt),
          d.title,
          d.text,
          d.durationMs,
          d.reviewedAt == null ? null : toMillisIso(d.reviewedAt),
          d.createdAt,
          version,
          d.deletedAt == null ? null : toMillisIso(d.deletedAt),
          version,
        ],
      );
    },

    async listAudioPending(limit = 3) {
      // 네 조건 — 녹음이 있고 · 끝났고 · 안 지웠고 · 행이 서버에 있고 · 아직 안 올렸다(DreamRepo 주석)
      const rows = await db.getAllAsync<Row>(
        `SELECT ${COLS} FROM dreams ` +
          'WHERE audio_path IS NOT NULL AND duration_ms IS NOT NULL AND deleted_at IS NULL ' +
          'AND synced_at IS NOT NULL AND audio_uploaded_at IS NULL ' +
          'ORDER BY recorded_at ASC LIMIT ?',
        [limit],
      );
      return rows.map(toDream);
    },

    async markAudioUploaded(id: string, at: string) {
      await db.runAsync('UPDATE dreams SET audio_uploaded_at = ? WHERE id = ?', [at, id]);
    },

    async setAudioPath(id: string, path: string) {
      // updated_at 은 그대로 둔다. 서버로 올릴 변경이 아니다(DreamRepo 주석)
      await db.runAsync('UPDATE dreams SET audio_path = ? WHERE id = ?', [path, id]);
    },

    async setSttStatus(id: string, status: Dream['sttStatus']) {
      // updated_at 은 그대로 둔다. 서버로 올릴 변경이 아니다(DreamRepo 주석)
      await db.runAsync('UPDATE dreams SET stt_status = ? WHERE id = ?', [status, id]);
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
