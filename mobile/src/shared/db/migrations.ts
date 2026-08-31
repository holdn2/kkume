/**
 * 스키마 마이그레이션.
 *
 * **처음부터 넣는다.** 나중에 컬럼 하나를 더할 때 기존 기록을 날리지 않으려면
 * 지금 넣는 것이 가장 싸다. 새벽 기록은 이 앱에서 유일하게 용납되지 않는 손실이다.
 *
 * 규칙 — **이미 나간 마이그레이션은 고치지 않는다.** 항상 새 버전을 뒤에 더한다.
 * 고치면 이미 그 버전을 지난 기기가 영원히 그 수정을 못 받는다.
 */
export type Migration = { version: number; up: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS dreams (
        id           TEXT PRIMARY KEY NOT NULL,
        user_id      TEXT,
        recorded_at  TEXT NOT NULL,
        title        TEXT,
        text         TEXT,
        audio_path   TEXT,
        stt_status   TEXT NOT NULL DEFAULT 'pending',
        emotion      TEXT,
        keywords     TEXT,
        characters   TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        deleted_at   TEXT,
        synced_at    TEXT
      );

      -- 목록은 항상 "안 지워진 것을 최근순으로"라서 이 두 컬럼이 같이 걸린다
      CREATE INDEX IF NOT EXISTS idx_dreams_list
        ON dreams (deleted_at, recorded_at DESC);

      -- 동기화 큐가 "아직 안 올라간 것"을 찾을 때 쓴다 (5주차)
      CREATE INDEX IF NOT EXISTS idx_dreams_unsynced
        ON dreams (synced_at) WHERE synced_at IS NULL;
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
