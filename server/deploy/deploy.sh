#!/usr/bin/env bash
# 로컬에서 EC2로 배포한다. ecr-push.sh 로 이미지를 올린 뒤에 실행한다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다. .env.example 을 복사해서 채운다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

: "${AWS_REGION:?}" "${ECR_REPO:?}" "${AWS_ACCOUNT_ID:?}" "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"
HOST_PORT="${HOST_PORT:-80}"

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "== ${EC2_USER}@${EC2_HOST} 로 배포"
# 스크립트를 파일로 두지 않고 stdin으로 밀어넣는다. EC2에 사본이 쌓이지 않는다.
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new \
  "${EC2_USER}@${EC2_HOST}" \
  "bash -s -- '${REGISTRY}' '${ECR_REPO}' '${HOST_PORT}' '${AWS_REGION}'" < ec2-run.sh

echo "== 바깥에서 확인"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://${EC2_HOST}:${HOST_PORT}/health" || true)
if [ "$code" = "200" ]; then
  echo "http://${EC2_HOST}:${HOST_PORT}/health -> 200"
else
  echo "http://${EC2_HOST}:${HOST_PORT}/health -> ${code}" >&2
  echo "컨테이너는 떴는데 바깥에서 안 되면 보안그룹의 인바운드 규칙을 본다." >&2
  exit 1
fi
