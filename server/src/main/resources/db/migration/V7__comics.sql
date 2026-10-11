-- 꿈 만화(계약 문서 081, 모바일 이슈 #92). 대본 · 그림은 Cloudflare Workers AI 가 만든다(081 06장).
--
-- jobs 를 쓰지 않는다. jobs.dream_id 는 dreams 를 가리키는데, 만화는 꿈 내용의 복사본으로 만들어
-- 동기화되지 않은 꿈으로도 만들 수 있다(081 원칙 4). dream_id 는 "이 꿈으로 만든 내 만화"에만 쓴다.
CREATE TABLE comics (
    id            UUID          PRIMARY KEY,
    user_id       UUID          NOT NULL REFERENCES users (id),
    dream_id      VARCHAR(64)   NOT NULL,
    style         VARCHAR(8)    NOT NULL,

    -- queued → scripting → drawing → done. failed · refused 는 하루 몫에서 빠진다
    status        VARCHAR(16)   NOT NULL,

    -- 만들 때 받은 꿈 내용. 대본을 쓰고 나면 비운다 — 끝난 만화에는 필요 없다
    title         VARCHAR(255),
    dream_text    TEXT,
    -- 그림 모델에 넘길 영어 장면 묘사({"character", "scenes"}). 그림을 그리고 나면 비운다
    scenes        TEXT,
    -- 앱이 그림 위에 얹을 컷 4개 [{"caption", "dialogue"}]. scripting 이 끝나면 채운다
    panels        TEXT,

    layout        VARCHAR(16),
    -- S3 키. presigned GET 으로만 내보낸다
    image_key     VARCHAR(255),

    -- failed · refused 의 까닭. budget 이면 그날(UTC) 남은 요청을 503 comic_budget_exhausted 로 막는다
    fail_code     VARCHAR(32),
    -- scripting · drawing 으로 잡은 시각. 서버가 죽어 영영 멈춘 만화를 실패로 끝내는 데 쓴다
    locked_at     TIMESTAMPTZ,

    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL,
    finished_at   TIMESTAMPTZ,
    -- 지운 만화도 하루 몫으로 센다 — 지워서 몫을 되살리지 못하게. 계정 삭제는 행째 지운다
    deleted_at    TIMESTAMPTZ,

    CONSTRAINT ck_comics_style  CHECK (style IN ('soft', 'ink')),
    CONSTRAINT ck_comics_status CHECK (status IN ('queued', 'scripting', 'drawing', 'done', 'failed', 'refused')),
    CONSTRAINT ck_comics_layout CHECK (layout IS NULL OR layout IN ('grid2x2', 'panels4'))
);

-- 이 꿈으로 만든 내 만화 · 오늘 만든 수
CREATE INDEX idx_comics_user ON comics (user_id, created_at DESC);
-- 다음에 그릴 것
CREATE INDEX idx_comics_queue ON comics (created_at) WHERE status = 'queued';
-- 서비스 전체 하루 몫
CREATE INDEX idx_comics_created ON comics (created_at);

-- 원가(계획서 001 "1인당 실측 원가", 081 04장). 호출 한 번에 한 행. 무료 한도 안이라 청구는 0이어도 환산 금액을 남긴다.
-- 사용자 · 꿈 내용을 담지 않는다 — 계정을 지워도 남는 통계라서다. comic_id 에 외래 키를 걸지 않는 것도 그 때문이다.
CREATE TABLE comic_costs (
    id             BIGSERIAL     PRIMARY KEY,
    comic_id       UUID          NOT NULL,
    step           VARCHAR(16)   NOT NULL,
    model          VARCHAR(64)   NOT NULL,
    ok             BOOLEAN       NOT NULL,
    input_tokens   INTEGER,
    output_tokens  INTEGER,
    images         INTEGER       NOT NULL DEFAULT 0,
    -- 가격표로 환산한 값. 1,000 뉴런 = $0.011
    neurons        NUMERIC(12, 3) NOT NULL,
    usd            NUMERIC(12, 6) NOT NULL,
    duration_ms    INTEGER       NOT NULL,
    error          VARCHAR(64),
    created_at     TIMESTAMPTZ   NOT NULL,

    CONSTRAINT ck_comic_costs_step CHECK (step IN ('script', 'image'))
);

CREATE INDEX idx_comic_costs_comic ON comic_costs (comic_id);
CREATE INDEX idx_comic_costs_created ON comic_costs (created_at);

-- 꿈 나눔에 붙인 만화(081 03장). 올릴 때 그림을 posts/{postId}/ 로 복사하고 컷 글을 여기에 복사한다 —
-- 원래 만화를 지워도 글은 남는다(꿈 본문 복사와 같은 이유)
ALTER TABLE posts ADD COLUMN comic_layout    VARCHAR(16);
ALTER TABLE posts ADD COLUMN comic_image_key VARCHAR(255);
ALTER TABLE posts ADD COLUMN comic_panels    TEXT;
