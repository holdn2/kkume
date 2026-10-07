#!/usr/bin/env bash
# 신고 처리 — 운영자 PC 에서 돌린다(문서 070 · 072).
#
#   ./moderate.sh reports                      아직 처리하지 않은 신고(들어온 지 몇 시간인지 함께)
#   ./moderate.sh show    post|comment <id>    내용 · 작성자 · 신고 내역
#   ./moderate.sh remove  post|comment <id>    가림 + 그 대상의 신고를 처리됨으로
#   ./moderate.sh dismiss post|comment <id>    문제없음 — 신고만 처리됨으로
#   ./moderate.sh suspend   <userId>           이용 정지(글 · 댓글 · 공감 · 닉네임 바꾸기만 막힌다)
#   ./moderate.sh unsuspend <userId>           이용 정지 풀기
#
# 바꾸는 명령 뒤에 --dry-run 을 붙이면 같은 SQL 을 돌리고 되돌린다.
#
# DB 는 인터넷에서 닿지 않는다. 이 스크립트가 SSH 를 지금 PC 의 IP 로 잠깐 열고, EC2 안에서 DB 에 붙어 처리한 뒤 닫는다.
# 신고 메일에는 글 내용이 없다 — 내용은 show 로 본다(Gmail 로 꿈 내용이 넘어가지 않게).
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
: "${AWS_REGION:?}" "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
# id 는 SQL 에 그대로 들어가므로 UUID 모양만 받는다
need_uuid() { [[ "$1" =~ $UUID_RE ]] || { echo "id 가 UUID 모양이 아니다: $1" >&2; exit 2; }; }
need_type() { [[ "$1" == post || "$1" == comment ]] || { echo "대상은 post 또는 comment" >&2; exit 2; }; }

cmd="${1:-}"; [ -n "$cmd" ] || usage
dry=0; for a in "$@"; do [ "$a" = "--dry-run" ] && dry=1; done
expanded=0

case "$cmd" in
  reports)
    sql="
select r.target_type as 종류, r.target_id as 대상, count(*) as 신고, string_agg(distinct r.reason, ',') as 사유,
       round(extract(epoch from now() - min(r.created_at)) / 3600)::int as 시간,
       case when r.target_type = 'post'
            then (select case when p.deleted_at is not null then '지움' when p.hidden_at is not null then '가림' else '보임' end
                  from posts p where p.id = r.target_id)
            else (select case when c.deleted_at is not null then '지움' when c.hidden_at is not null then '가림' else '보임' end
                  from comments c where c.id = r.target_id) end as 상태
from reports r where r.reviewed_at is null
group by r.target_type, r.target_id order by min(r.created_at);" ;;
  show)
    need_type "${2:-}"; need_uuid "${3:-}"; expanded=1
    if [ "$2" = post ]; then
      sql="
select p.id, u.nickname as 작성자, p.author_id, p.created_at, p.hidden_at as 가림, p.deleted_at as 지움,
       p.title as 제목, p.dream_text as 꿈, p.body as 한마디, p.like_count as 공감, p.comment_count as 댓글
from posts p join users u on u.id = p.author_id where p.id = '$3';
select reason as 사유, created_at as 신고, reviewed_at as 처리 from reports
where target_type = 'post' and target_id = '$3' order by created_at;"
    else
      sql="
select c.id, u.nickname as 작성자, c.author_id, c.post_id as 글, c.parent_id as 부모, c.created_at,
       c.hidden_at as 가림, c.deleted_at as 지움, c.body as 내용
from comments c join users u on u.id = c.author_id where c.id = '$3';
select reason as 사유, created_at as 신고, reviewed_at as 처리 from reports
where target_type = 'comment' and target_id = '$3' order by created_at;"
    fi ;;
  remove)
    need_type "${2:-}"; need_uuid "${3:-}"
    if [ "$2" = post ]; then
      # 신고 3회 자동 가림과 같은 상태 — 작성자는 hidden: true 로 보고 지울 수 있고, 남에게는 없는 글이다
      sql="
update posts set hidden_at = coalesce(hidden_at, now()), updated_at = now() where id = '$3' and deleted_at is null;
update reports set reviewed_at = now() where target_type = 'post' and target_id = '$3' and reviewed_at is null;
select id, hidden_at as 가림 from posts where id = '$3';"
    else
      sql="
update comments set hidden_at = coalesce(hidden_at, now()) where id = '$3' and deleted_at is null;
update posts set comment_count = (select count(*) from comments c
  where c.post_id = posts.id and c.deleted_at is null and c.hidden_at is null)
where id = (select post_id from comments where id = '$3');
update reports set reviewed_at = now() where target_type = 'comment' and target_id = '$3' and reviewed_at is null;
select id, hidden_at as 가림 from comments where id = '$3';"
    fi ;;
  dismiss)
    need_type "${2:-}"; need_uuid "${3:-}"
    sql="
update reports set reviewed_at = now() where target_type = '$2' and target_id = '$3' and reviewed_at is null;
select count(*) as 처리한_신고 from reports where target_type = '$2' and target_id = '$3' and reviewed_at is not null;" ;;
  suspend)
    need_uuid "${2:-}"
    sql="
update users set suspended_at = coalesce(suspended_at, now()), updated_at = now() where id = '$2' and deleted_at is null;
select id, nickname, suspended_at as 정지 from users where id = '$2';" ;;
  unsuspend)
    need_uuid "${2:-}"
    sql="
update users set suspended_at = null, updated_at = now() where id = '$2';
select id, nickname, suspended_at as 정지 from users where id = '$2';" ;;
  *) usage ;;
esac

if [ "$cmd" != reports ] && [ "$cmd" != show ]; then
  end=$([ "$dry" = 1 ] && echo rollback || echo commit)
  sql="begin;${sql}
${end};"
  [ "$dry" = 1 ] && echo "== --dry-run: 돌리고 되돌린다"
fi

# SSH 를 지금 IP 로 열고, 끝나면(실패해도) 닫는다. IP 는 눈으로 옮기지 않고 그대로 쓴다
SG=$(aws ec2 describe-instances --region "$AWS_REGION" --filters "Name=ip-address,Values=$EC2_HOST" \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG" \
  --protocol tcp --port 22 --cidr "${MYIP}/32" >/dev/null 2>&1 || true
trap 'aws ec2 revoke-security-group-ingress --region "$AWS_REGION" --group-id "$SG" --protocol tcp --port 22 --cidr "${MYIP}/32" >/dev/null 2>&1 || true' EXIT

opts="-v ON_ERROR_STOP=1 -P pager=off"
[ "$expanded" = 1 ] && opts="$opts -x"
printf '%s\n' "$sql" | ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$EC2_USER@$EC2_HOST" \
  "sudo docker run --rm -i -e PGPASSWORD='$DB_PASSWORD' postgres:17-alpine psql -h '$DB_HOST' -U '$DB_USER' -d '$DB_NAME' $opts"
