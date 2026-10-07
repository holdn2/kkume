-- 가입 동의 기록 · 이용 정지 · 신고 처리 표시(계약 문서 070 · 072, 모바일 071에서 수용).

-- 어느 버전의 약관 · 처리방침에 언제 동의했나. 버전은 공개 문서의 시행일 모양(YYYY-MM-DD)이고 뜻은 따지지 않는다.
-- consented_at 은 그 버전에 처음 동의한 서버 시각이다 — 같은 버전을 다시 보내도 덮지 않는다.
-- 계정을 지우면 둘 다 비운다.
ALTER TABLE users ADD COLUMN consent_version VARCHAR(10);
ALTER TABLE users ADD COLUMN consented_at    TIMESTAMPTZ;

-- 운영자가 막은 계정. 글 · 댓글 · 공감 · 닉네임 바꾸기만 막는다 — 자기 꿈 기록은 볼모로 잡지 않는다.
-- 계정을 지우면 비운다(탈퇴 후 재가입은 막지 않기로 했다, 072).
ALTER TABLE users ADD COLUMN suspended_at    TIMESTAMPTZ;

-- 운영자가 이 신고를 봤다(가렸든 문제없다고 했든). 24시간 처리 기한을 지키려고 안 본 것만 골라 본다.
ALTER TABLE reports ADD COLUMN reviewed_at   TIMESTAMPTZ;

CREATE INDEX idx_reports_unreviewed ON reports (created_at) WHERE reviewed_at IS NULL;
