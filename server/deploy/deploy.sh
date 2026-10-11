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
# 없으면 서버가 오디오 업로드를 받지 않는다(503 audio_unavailable). 모르고 그렇게 배포되지 않게 막는다.
: "${AUDIO_BUCKET:?}"
# 없으면 신고가 들어와도 운영자가 모른다(App Store 1.2 의 24시간 처리). 모르고 그렇게 배포되지 않게 막는다.
: "${REPORT_TOPIC_ARN:?}"
# 애플 계정 삭제 때 토큰 회수용 키(문서 076). 없어도 배포는 한다 — 애플 로그인은 되고 회수만 건너뛴다.
# 키 파일은 이 PC 에만 두고 내용을 .env 에 옮기지 않는다. 머리줄 · 줄바꿈을 뺀 base64 한 줄로 넘긴다
APPLE_KEY_ID="${APPLE_KEY_ID:-}"
APPLE_PRIVATE_KEY=""
if [ -n "${APPLE_KEY_FILE:-}" ]; then
  APPLE_KEY_FILE="${APPLE_KEY_FILE/#\~/$HOME}"
  [ -f "${APPLE_KEY_FILE}" ] || { echo "APPLE_KEY_FILE 이 없다: ${APPLE_KEY_FILE}" >&2; exit 1; }
  APPLE_PRIVATE_KEY=$(grep -v -- '-----' "${APPLE_KEY_FILE}" | tr -d '\r\n ')
fi
if [ -z "${APPLE_KEY_ID}" ] || [ -z "${APPLE_PRIVATE_KEY}" ]; then
  echo "!! 애플 회수용 키(APPLE_KEY_ID · APPLE_KEY_FILE)가 없다 — 애플 계정 삭제 때 애플 토큰 회수를 건너뛴다. App Store 제출 전에 넣는다" >&2
  APPLE_KEY_ID=""; APPLE_PRIVATE_KEY=""
fi
# 꿈 만화의 Cloudflare Workers AI(문서 081 · 083). 애플 키와 같은 방식 — 키 파일은 이 PC 에만 두고 .env 에는 경로만 적는다.
# 파일은 ACCOUNT_ID=… · API_TOKEN=… 두 줄. 없어도 배포는 한다 — 만화 만들기만 503 comic_unavailable 이 된다
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_API_TOKEN=""
if [ -n "${CLOUDFLARE_KEY_FILE:-}" ]; then
  CLOUDFLARE_KEY_FILE="${CLOUDFLARE_KEY_FILE/#\~/$HOME}"
  [ -f "${CLOUDFLARE_KEY_FILE}" ] || { echo "CLOUDFLARE_KEY_FILE 이 없다: ${CLOUDFLARE_KEY_FILE}" >&2; exit 1; }
  CLOUDFLARE_ACCOUNT_ID=$(grep -E '^[[:space:]]*ACCOUNT_ID[[:space:]]*=' "${CLOUDFLARE_KEY_FILE}" | head -1 | cut -d= -f2- | tr -d '\r\n ')
  CLOUDFLARE_API_TOKEN=$(grep -E '^[[:space:]]*API_TOKEN[[:space:]]*=' "${CLOUDFLARE_KEY_FILE}" | head -1 | cut -d= -f2- | tr -d '\r\n ')
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID}" ] || [ -z "${CLOUDFLARE_API_TOKEN}" ]; then
  echo "!! Cloudflare 키(CLOUDFLARE_KEY_FILE)가 없다 — 꿈 만화 만들기가 503 comic_unavailable 이 된다" >&2
  CLOUDFLARE_ACCOUNT_ID=""; CLOUDFLARE_API_TOKEN=""
fi
HOST_PORT="${HOST_PORT:-80}"
# 바깥 확인은 HTTPS 입구로 한다. 평문 80 은 보안그룹에서 닫았다(#42).
HTTPS_HOST="${HTTPS_HOST:-${EC2_HOST}.nip.io}"

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
DB_URL="jdbc:postgresql://${DB_HOST}:5432/${DB_NAME}"

echo "== ${EC2_USER}@${EC2_HOST} 로 배포"
# 스크립트를 파일로 두지 않고 stdin으로 밀어넣는다. EC2에 사본이 쌓이지 않는다.
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new \
  "${EC2_USER}@${EC2_HOST}" \
  "bash -s -- '${REGISTRY}' '${ECR_REPO}' '${HOST_PORT}' '${AWS_REGION}' '${DB_URL}' '${DB_USER}' '${DB_PASSWORD}' '${JWT_SECRET}' '${AUDIO_BUCKET}' '${REPORT_TOPIC_ARN}' '${APPLE_KEY_ID}' '${APPLE_PRIVATE_KEY}' '${CLOUDFLARE_ACCOUNT_ID}' '${CLOUDFLARE_API_TOKEN}'" \
  < ec2-run.sh

echo "== 바깥에서 확인"
fail=0
for path in /health /health/ready; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://${HTTPS_HOST}${path}" || true)
  echo "https://${HTTPS_HOST}${path} -> ${code}"
  [ "$code" = "200" ] || fail=1
done

if [ "$fail" -ne 0 ]; then
  echo "컨테이너는 떴는데 바깥에서 안 되면 보안그룹의 인바운드 443 과 Caddy(sudo docker ps)를 본다." >&2
  echo "서버 안의 기동 확인(ec2-run.sh)은 통과했으므로 앱보다 입구 쪽일 가능성이 크다." >&2
  echo "/health 는 200 인데 /health/ready 가 아니면 DB 쪽이다 —" >&2
  echo "sudo docker ps 에 kkume-db 가 떠 있는지, 앱과 같은 kkume-net 에 붙었는지 확인한다." >&2
  exit 1
fi
