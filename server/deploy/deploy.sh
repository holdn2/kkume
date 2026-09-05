#!/usr/bin/env bash
# 로컬에서 EC2로 배포한다. ecr-push.sh 로 이미지를 올린 뒤에 실행한다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다. .env.example 을 복사해서 채운다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

: "${AWS_REGION:?}" "${ECR_REPO:?}" "${AWS_ACCOUNT_ID:?}" "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
# 없으면 서버가 임시 키를 만들고, 배포할 때마다 로그인이 전부 풀린다.
: "${JWT_SECRET:?}"
HOST_PORT="${HOST_PORT:-80}"

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
DB_URL="jdbc:postgresql://${DB_HOST}:5432/${DB_NAME}"

echo "== ${EC2_USER}@${EC2_HOST} 로 배포"
# 스크립트를 파일로 두지 않고 stdin으로 밀어넣는다. EC2에 사본이 쌓이지 않는다.
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new \
  "${EC2_USER}@${EC2_HOST}" \
  "bash -s -- '${REGISTRY}' '${ECR_REPO}' '${HOST_PORT}' '${AWS_REGION}' '${DB_URL}' '${DB_USER}' '${DB_PASSWORD}' '${JWT_SECRET}'" \
  < ec2-run.sh

echo "== 바깥에서 확인"
fail=0
for path in /health /health/ready; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://${EC2_HOST}:${HOST_PORT}${path}" || true)
  echo "http://${EC2_HOST}:${HOST_PORT}${path} -> ${code}"
  [ "$code" = "200" ] || fail=1
done

if [ "$fail" -ne 0 ]; then
  echo "컨테이너는 떴는데 바깥에서 안 되면 EC2 보안그룹의 인바운드 80 을 본다." >&2
  echo "/health 는 200 인데 /health/ready 가 아니면 RDS 쪽이다 —" >&2
  echo "DB 보안그룹이 EC2 보안그룹에서 5432 를 열어 주는지 확인한다." >&2
  exit 1
fi
