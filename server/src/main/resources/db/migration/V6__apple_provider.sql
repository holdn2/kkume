-- Sign in with Apple(모바일 075 · 서버 076). provider_id 에는 애플 ID 토큰의 sub 가 들어간다.
-- 이메일 · 이름은 받지도 남기지도 않는다 — 구글과 같다.
ALTER TABLE users DROP CONSTRAINT ck_users_provider;
ALTER TABLE users ADD CONSTRAINT ck_users_provider CHECK (provider IN ('kakao', 'google', 'apple'));
