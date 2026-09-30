-- 커뮤니티 — 꿈 나눔(계약 문서 056, 모바일 057에서 수용).
--
-- 글은 꿈의 복사본이다. 게시할 때 제목 · 꿈 내용 · 꿈 꾼 시각을 여기에 복사하고, 이후 dreams 를 읽지 않는다.
-- 그래서 dream_id 에 외래 키를 걸지 않는다 — 꿈이 나중에 실제로 지워져도 글의 운명은 글의 규칙이 정한다.
-- dream_id 는 "꿈 하나에 글 하나"와 "이 꿈으로 쓴 내 글"에만 쓴다.
CREATE TABLE posts (
    id                 UUID          PRIMARY KEY,
    author_id          UUID          NOT NULL REFERENCES users (id),
    dream_id           VARCHAR(64)   NOT NULL,

    title              VARCHAR(255),
    dream_text         TEXT          NOT NULL,
    dream_recorded_at  TIMESTAMPTZ   NOT NULL,
    -- 한마디. 선택이라 빈 문자열이 온다
    body               TEXT          NOT NULL,

    -- 매 요청 COUNT 로 세면 공감순 정렬에 인덱스를 쓸 수 없다. 같은 트랜잭션에서 다시 센다
    like_count         INTEGER       NOT NULL DEFAULT 0,
    -- 보이는 댓글 수(지운 것 · 가려진 것 제외, 답글 포함)
    comment_count      INTEGER       NOT NULL DEFAULT 0,

    -- 서로 다른 3명이 신고하면 채운다. 사람이 보는 관리 화면이 없어 풀리지 않는다
    hidden_at          TIMESTAMPTZ,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ   NOT NULL,
    updated_at         TIMESTAMPTZ   NOT NULL
);

-- 꿈 하나에 글 하나. 가려진 글도 "지우지 않은 글"로 센다. 두 요청이 겹쳐도 하나만 들어간다.
CREATE UNIQUE INDEX uq_posts_author_dream ON posts (author_id, dream_id) WHERE deleted_at IS NULL;

-- 피드 두 정렬의 키셋. 지우지도 가리지도 않은 글만 목록에 나온다
CREATE INDEX idx_posts_latest  ON posts (created_at DESC, id DESC)
    WHERE deleted_at IS NULL AND hidden_at IS NULL;
CREATE INDEX idx_posts_empathy ON posts (like_count DESC, created_at DESC, id DESC)
    WHERE deleted_at IS NULL AND hidden_at IS NULL;
-- 사용자 글 목록. 작성자 본인은 가려진 글도 보므로 hidden_at 으로 거르지 않는다
CREATE INDEX idx_posts_author ON posts (author_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE post_likes (
    post_id     UUID         NOT NULL REFERENCES posts (id),
    user_id     UUID         NOT NULL REFERENCES users (id),
    created_at  TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

-- 답글은 한 단계뿐이다. 그 규칙은 서버 코드가 지킨다(부모의 parent_id 가 비어 있어야 한다)
CREATE TABLE comments (
    id          UUID         PRIMARY KEY,
    post_id     UUID         NOT NULL REFERENCES posts (id),
    parent_id   UUID         REFERENCES comments (id),
    author_id   UUID         NOT NULL REFERENCES users (id),
    body        TEXT         NOT NULL,
    hidden_at   TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL
);

CREATE INDEX idx_comments_post ON comments (post_id, created_at, id);

-- 같은 사람이 같은 대상을 두 번 신고해도 한 번으로 센다. 대상은 글이거나 댓글이라 외래 키를 걸지 않는다
CREATE TABLE reports (
    id           UUID         PRIMARY KEY,
    target_type  VARCHAR(16)  NOT NULL,
    target_id    UUID         NOT NULL,
    reporter_id  UUID         NOT NULL REFERENCES users (id),
    reason       VARCHAR(16)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,

    CONSTRAINT ck_reports_type   CHECK (target_type IN ('post', 'comment')),
    CONSTRAINT ck_reports_reason CHECK (reason IN ('sexual', 'violence', 'spam', 'other')),
    CONSTRAINT uq_reports_once   UNIQUE (target_type, target_id, reporter_id)
);

-- 차단은 한쪽 방향이다. 상대에게 알리지 않는다
CREATE TABLE user_blocks (
    blocker_id  UUID         NOT NULL REFERENCES users (id),
    blocked_id  UUID         NOT NULL REFERENCES users (id),
    created_at  TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
);
