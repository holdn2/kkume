-- 꿈 만화 원가 집계(문서 105 R7) — 읽기만 한다. comic-costs.sh 가 트랜잭션으로 감싸 끝에 되돌린다(임시 테이블 하나뿐).
--
-- 기간: D 방식(문서 102, PR #158)을 배포한 2026-10-27 10:57Z 뒤만 본다. 그 전의 2×2 한 장(약 170뉴런)과 섞이면 평균이 틀린다.
-- 방식 컬럼이 없어 시각으로 가른다.
--
-- 한 편 = comic_costs 의 comic_id 하나. 결과(done · failed · refused)는 comics 에서 가져오는데, 계정을 지우면 comics 행이
-- 사라지므로 그런 편은 「탈퇴」로 따로 센다(comic_costs 는 사용자를 담지 않아 남는다).
-- 고정비(EC2 · S3)는 여기에 없다 — 만화 변동비만.

\set since '2026-10-27 10:57:00+00'

create temp table per_comic as
select k.comic_id,
       coalesce(c.status, '탈퇴') as outcome,
       sum(k.neurons) as neurons,
       sum(k.usd) as usd,
       count(*) filter (where k.step = 'script') as script_calls,
       count(*) filter (where k.step = 'script' and not k.ok) as script_failed,
       count(*) filter (where k.step = 'image') as image_calls,
       count(*) filter (where k.step = 'image' and not k.ok) as image_failed,
       sum(k.neurons) filter (where not k.ok) as failed_neurons,
       sum(k.duration_ms) / 1000.0 as model_seconds,
       extract(epoch from c.finished_at - c.created_at) as wall_seconds,
       min(k.created_at) as first_call
from comic_costs k
left join comics c on c.id = k.comic_id
where k.created_at >= :'since'
group by k.comic_id, c.status, c.finished_at, c.created_at;

\echo '== 1. 결과별 한 편 원가(뉴런 · USD)'
select outcome as 결과, count(*) as "N",
       round(avg(neurons), 1) as 뉴런_평균,
       round((percentile_cont(0.5) within group (order by neurons))::numeric, 1) as 뉴런_중앙값,
       round(max(neurons), 1) as 뉴런_최대,
       round(avg(usd), 6) as usd_평균,
       round((percentile_cont(0.5) within group (order by usd))::numeric, 6) as usd_중앙값,
       round(max(usd), 6) as usd_최대
from per_comic group by outcome
union all
select '전체', count(*), round(avg(neurons), 1),
       round((percentile_cont(0.5) within group (order by neurons))::numeric, 1), round(max(neurons), 1),
       round(avg(usd), 6), round((percentile_cont(0.5) within group (order by usd))::numeric, 6), round(max(usd), 6)
from per_comic
order by 1;

-- 「실패한 호출」은 결과를 쓰지 못한 호출이다(그림 검열 3030 · 대본 계약 위반 · 말투 · 마지막 실패). 다시 부른 호출은
-- 성공으로 기록되므로 여기 들지 않는다 — 다시 부르는 데 든 몫을 보려면 실패한 호출 수 × 한 번 값(그림 약 110 · 대본 약 80)
\echo '== 2. 실패한 호출 몫 — 결과를 못 쓰고 뉴런만 쓴 호출(대부분 다시 부름)'
select outcome as 결과, count(*) as "N",
       round(avg(script_calls), 2) as 대본_호출_평균,
       sum(script_failed) as 대본_실패_호출,
       round(avg(image_calls), 2) as 그림_호출_평균,
       sum(image_failed) as 그림_실패_호출,
       round(coalesce(sum(failed_neurons), 0), 1) as 실패_호출_뉴런,
       round(100 * coalesce(sum(failed_neurons), 0) / nullif(sum(neurons), 0), 1) as 실패_호출_비율_퍼센트
from per_comic group by outcome order by 1;

\echo '== 2-1. 실패한 호출의 이유별 수(꿈 내용은 담지 않는다 — 검사 이름 · 오류 코드뿐)'
select step as 단계, coalesce(error, '(없음)') as 이유, count(*) as 호출, round(sum(neurons), 1) as 뉴런
from comic_costs where created_at >= :'since' and not ok
group by step, error order by step, count(*) desc;

\echo '== 3. 소요 시간 분포(초) — 완성까지(만들기 요청 ~ 끝남) · 모델 호출 합'
select outcome as 결과, count(wall_seconds) as "N",
       round(min(wall_seconds)::numeric, 1) as 완성_최소,
       round((percentile_cont(0.5) within group (order by wall_seconds))::numeric, 1) as 완성_중앙값,
       round((percentile_cont(0.9) within group (order by wall_seconds))::numeric, 1) as 완성_p90,
       round(max(wall_seconds)::numeric, 1) as 완성_최대,
       round((percentile_cont(0.5) within group (order by model_seconds))::numeric, 1) as 모델_중앙값
from per_comic where wall_seconds is not null group by outcome order by 1;

-- 뉴런은 호출 행의 날짜로 센다(서버의 하루 몫과 같은 기준) — 자정을 넘긴 편은 두 날에 나뉜다. 편 수는 첫 호출 날짜로
\echo '== 4. 날짜별(UTC — 무료 한도가 다시 채워지는 날) 편 수 · 뉴런 합계 · 하루 한도 10,000 대비'
select d.날짜_utc, coalesce(p.편, 0) as 편, coalesce(p.완성, 0) as 완성, d.뉴런_합,
       round(100 * d.뉴런_합 / 10000, 1) as 한도_대비_퍼센트
from (select (created_at at time zone 'utc')::date as 날짜_utc, round(sum(neurons), 1) as 뉴런_합
      from comic_costs where created_at >= :'since' group by 1) d
left join (select (first_call at time zone 'utc')::date as 날짜_utc, count(*) as 편,
                  count(*) filter (where outcome = 'done') as 완성
           from per_comic group by 1) p on p.날짜_utc = d.날짜_utc
order by 1;
