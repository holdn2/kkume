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
  {
    version: 2,
    up: `
      -- 녹음 길이. \`stop()\`이 주는 값을 버리고 있었다.
      -- 목록에서 길이를 보이려면 매번 오디오 파일을 열어야 하는데,
      -- 그건 목록 한 화면에 파일 수십 개를 여는 일이라 그렇게 쓸 수 없다.
      --
      -- **버전 1을 고치지 않고 2로 더한다.** 버전 1을 이미 지난 기기는
      -- 그 수정을 영영 못 받기 때문이다. 기존 행은 NULL로 남고,
      -- 화면은 NULL을 \`길이 모름\`으로 그린다 — 되찾을 방법이 없는 값이라
      -- 0으로 채우면 "0초짜리 녹음"이라는 거짓이 된다.
      ALTER TABLE dreams ADD COLUMN duration_ms INTEGER;
    `,
  },
  {
    version: 3,
    up: `
      -- 앱이 기억해야 하는 한 줄짜리 값들. 온보딩을 끝냈는지가 첫 손님이다.
      --
      -- **새 네이티브 모듈을 들이지 않으려고 여기에 둔다.** AsyncStorage를 쓰면
      -- 값 하나 때문에 빌드를 한 번 먹는데, EAS 무료는 플랫폼당 월 15회다.
      -- 이미 붙어 있는 SQLite로 되는 일에 모듈을 늘리지 않는다.
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
