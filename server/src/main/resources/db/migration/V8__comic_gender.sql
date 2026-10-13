-- 만화 주인공 성별(앱 #117, 문서 088). 앱이 마이 탭에서 정한 경우에만 보낸다.
-- 대본을 쓰는 동안만 쓰고 꿈 본문(dream_text)처럼 대본이 끝나면(실패 · 지움 포함) 비운다 — 처리방침 2번 "다 만든 뒤에는 서버에 남기지 않습니다".
alter table comics add column gender varchar(8);
alter table comics add constraint comics_gender_check check (gender in ('female', 'male'));
