-- 계획서 09장의 데이터 모델 중 5주차(인증 · 동기화)에 필요한 세 테이블만 만든다.
-- comics · jobs · posts · comments · likes · reports · blocks 는 6~10주차에 더한다.
-- 쓰지도 않는 테이블을 미리 만들면 그 기능을 붙일 때 두 번 고치게 된다.
--
-- 이름은 모바일(mobile/src/shared/db/migrations.ts)과 맞춘다. 어긋나면 동기화에서
-- 매핑 표를 따로 들고 다니게 되고, 그 표가 틀리면 기록이 조용히 사라진다.

CREATE TABLE users (
    id          UUID         PRIMARY KEY,
    provider    VARCHAR(16)  NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    nickname    VARCHAR(64)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT ck_users_provider CHECK (provider IN ('kakao', 'google')),
    -- 같은 소셜 계정이 두 행이 되면 로그인할 때마다 다른 사용자가 된다.
    CONSTRAINT uq_users_provider UNIQUE (provider, provider_id)
);

CREATE TABLE user_settings (
    user_id        UUID        PRIMARY KEY REFERENCES users (id),
    wake_hour      SMALLINT,
    wake_minute    SMALLINT,
    notify_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    timezone       VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_user_settings_wake_hour   CHECK (wake_hour   BETWEEN 0 AND 23),
    CONSTRAINT ck_user_settings_wake_minute CHECK (wake_minute BETWEEN 0 AND 59)
);

CREATE TABLE dreams (
    -- 앱이 만든 id 를 그대로 받는다. UUID 가 아니다 —
    -- 모바일의 newId() 는 "36진수 시각-난수6" 형태의 문자열이고(예: l9x2k3-a1b2c3),
    -- 오프라인 우선이라 기기에서 만든 id 가 그대로 올라온다.
    id          VARCHAR(64)  PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users (id),
    recorded_at TIMESTAMPTZ  NOT NULL,
    title       VARCHAR(255),
    text        TEXT,

    -- S3 URL. 로컬의 audio_path 에 대응하며 이름이 다른 것이 맞다.
    -- STT 가 틀려도 원본으로 복원할 수 있게 하는 유일한 장치다(설계상 절대 규칙 2).
    audio_url   TEXT,
    stt_status  VARCHAR(16)  NOT NULL DEFAULT 'pending',

    -- 태깅은 보류하고 컬럼만 확보해 둔다. 나중에 backfill 로 소급한다.
    emotion     VARCHAR(32),
    keywords    TEXT,
    characters  TEXT,

    -- 계획서 09장에 없던 것. 모바일이 나중에 더했다.
    duration_ms INTEGER,
    reviewed_at TIMESTAMPTZ,

    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT ck_dreams_stt_status CHECK (stt_status IN ('pending', 'done', 'failed'))
);

-- 목록은 항상 "그 사람의, 안 지워진 것을, 최근순으로"라서 셋이 같이 걸린다.
CREATE INDEX idx_dreams_list ON dreams (user_id, deleted_at, recorded_at DESC);

-- 동기화가 "마지막으로 받아간 뒤 바뀐 것"을 찾을 때 쓴다.
CREATE INDEX idx_dreams_updated ON dreams (user_id, updated_at);
