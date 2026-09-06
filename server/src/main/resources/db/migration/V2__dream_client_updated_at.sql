-- 충돌 판정에 쓸 "기기가 마지막으로 고친 시각".
--
-- updated_at 과 나누는 이유는 둘이 서로 다른 시계를 쓰기 때문이다.
--
--   updated_at         서버가 쓴 시각. 동기화 커서가 이것을 따라간다
--   client_updated_at  기기가 고친 시각. 어느 쪽이 최신인지 판정할 때만 본다
--
-- 하나로 합치면 기기 시계에 끌려간다. 시계가 느린 폰이 과거 시각으로 올리면
-- updated_at 이 뒤로 가고, 이미 그 지점을 지나간 다른 기기는 그 기록을 영영 못 받는다.
-- 반대로 서버 시각만으로 충돌을 판정하면 "먼저 올린 쪽"이 이겨서,
-- 오프라인이었다가 늦게 올라온 최신 수정이 옛 내용에 덮인다.
ALTER TABLE dreams ADD COLUMN client_updated_at TIMESTAMPTZ;

UPDATE dreams SET client_updated_at = updated_at WHERE client_updated_at IS NULL;

ALTER TABLE dreams ALTER COLUMN client_updated_at SET NOT NULL;
