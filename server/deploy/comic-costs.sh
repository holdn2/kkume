#!/usr/bin/env bash
# 꿈 만화 원가 집계(문서 105 R7) — 운영자 PC 에서 돌린다. comic-costs.sql 을 운영 DB 에 한 번 돌리고 표를 찍는다.
#
#   ./comic-costs.sh
#
# 바꾸는 것이 없다. 집계용 임시 테이블 하나만 만들고, 트랜잭션을 되돌려 끝낸다(rollback).
# 결과에 꿈 내용 · 사용자는 없다 — comic_costs 에는 처음부터 담지 않는다.
#
# DB 는 인터넷에서 닿지 않는다. moderate.sh 처럼 SSH 를 지금 PC 의 IP 로 잠깐 열고, EC2 안에서 DB 에 붙은 뒤 닫는다.
# DB 비밀번호는 명령줄에 싣지 않는다 — 표준입력 첫 줄로 보내 EC2 쪽 셸이 환경변수로만 넘긴다(ps 에 보이지 않게).
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
: "${AWS_REGION:?}" "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"

SG=$(aws ec2 describe-instances --region "$AWS_REGION" --filters "Name=ip-address,Values=$EC2_HOST" \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
MYIP=$(curl -s https://checkip.amazonaws.com)
# 이번에 연 규칙만 닫는다 — 이미 있던 규칙(같은 IP 의 다른 작업)을 닫으면 그쪽 SSH 가 끊긴다.
# 닫지 못하면 알린다 — 22 를 열어 둔 채 끝나면 안 된다(README 3번)
opened=0
if aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG" \
  --protocol tcp --port 22 --cidr "${MYIP}/32" >/dev/null 2>&1; then
  opened=1
fi
close_ssh() {
  [ "$opened" = 1 ] || return 0
  aws ec2 revoke-security-group-ingress --region "$AWS_REGION" --group-id "$SG" --protocol tcp --port 22 \
    --cidr "${MYIP}/32" >/dev/null 2>&1 \
    || echo "!! SSH 22 규칙을 닫지 못했다. 손으로 닫는다: aws ec2 revoke-security-group-ingress --region $AWS_REGION --group-id $SG --protocol tcp --port 22 --cidr ${MYIP}/32" >&2
}
trap close_ssh EXIT

{
  printf '%s\n' "$DB_PASSWORD"
  echo 'begin;'
  cat comic-costs.sql
  echo 'rollback;'
} | ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$EC2_USER@$EC2_HOST" \
  "IFS= read -r PGPASSWORD && export PGPASSWORD && sudo --preserve-env=PGPASSWORD docker run --rm -i --network kkume-net -e PGPASSWORD postgres:17-alpine psql -h '$DB_HOST' -U '$DB_USER' -d '$DB_NAME' -v ON_ERROR_STOP=1 -P pager=off"
