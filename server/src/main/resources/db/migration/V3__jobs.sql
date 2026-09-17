-- 서버 안에서 오래 걸리는 일(변환 · 7주차 만화)을 줄 세우는 자리.
--
-- 별도 큐 서비스를 쓰지 않는다. t3.micro 한 대에 서버가 하나라 DB 테이블로 충분하고,
-- 큐 서비스를 더하면 비용과 움직이는 부품이 늘어난다(문서 039).
--
-- 기록 하나에 같은 종류의 작업은 하나다. 다시 시도하면 새 행을 만들지 않고 그 행을 되돌린다 —
-- 행이 쌓이면 "지금 상태"를 고르는 규칙이 하나 더 생긴다.
CREATE TABLE jobs (
    id          UUID         PRIMARY KEY,
    type        VARCHAR(16)  NOT NULL,
    dream_id    VARCHAR(64)  NOT NULL REFERENCES dreams (id),
    user_id     UUID         NOT NULL REFERENCES users (id),

    -- queued: 기다림 · running: 누가 잡고 있음 · done · failed: 끝
    status      VARCHAR(16)  NOT NULL,
    attempts    INTEGER      NOT NULL DEFAULT 0,

    -- 변환 원문. 앱이 text 에 합치기 전의 것이라 폰을 잃어도 여기서 다시 받는다(문서 039 C2).
    result      TEXT,
    error       VARCHAR(64),

    -- 이 시각이 지나야 다시 잡는다. 실패한 뒤 곧바로 다시 부르지 않게 한다.
    run_after   TIMESTAMPTZ  NOT NULL,
    -- running 으로 잡은 시각. 서버가 죽어 영영 running 으로 남은 작업을 되돌리는 데 쓴다.
    locked_at   TIMESTAMPTZ,

    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,

    CONSTRAINT ck_jobs_type   CHECK (type IN ('stt')),
    CONSTRAINT ck_jobs_status CHECK (status IN ('queued', 'running', 'done', 'failed')),
    CONSTRAINT uq_jobs_dream_type UNIQUE (dream_id, type)
);

-- 다음에 할 일을 고를 때 쓴다.
CREATE INDEX idx_jobs_pick ON jobs (status, run_after);
