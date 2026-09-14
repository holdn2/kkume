#!/usr/bin/env bash
# 로컬에서 EC2 에 HTTPS 입구(Caddy)를 띄운다.
#
# 앱 컨테이너는 건드리지 않는다. 그래서 이 스크립트는 배포가 아니다 —
# 운영 서버의 코드와 DB 는 그대로이고, 기존 http://<IP> 주소도 그대로 산다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다. .env.example 을 복사해서 채운다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

: "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"
HOST_PORT="${HOST_PORT:-80}"
# nip.io 는 "<IP>.nip.io" 를 그 IP 로 해석해 준다. 도메인 없이 인증서를 받을 수 있는 이름이 생긴다.
# 이 이름은 IP 에 묶여 있다 — EC2 를 정지했다 켜면 IP 와 함께 바뀐다(README 참고).
HTTPS_HOST="${HTTPS_HOST:-${EC2_HOST}.nip.io}"

SSH=(ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}")

echo "== Caddyfile 올리기"
# 이 파일은 EC2 디스크에 남긴다. 컨테이너가 재시작할 때 다시 읽어야 한다.
# 시크릿이 들어 있지 않으므로 남겨도 된다.
"${SSH[@]}" "sudo mkdir -p /opt/kkume && sudo tee /opt/kkume/Caddyfile >/dev/null" < Caddyfile

echo "== Caddy 기동"
"${SSH[@]}" "bash -s -- '${HTTPS_HOST}' '${HOST_PORT}'" < ec2-https.sh

echo "== 바깥에서 확인"
fail=0

code=$(curl -sS -o /dev/null -w '%{http_code}' "https://${HTTPS_HOST}/health" || true)
echo "https://${HTTPS_HOST}/health -> ${code}"
[ "$code" = "200" ] || fail=1

# 로그인 경로도 같은 주소로 닿아야 한다. 잘못된 토큰이면 401 이 정상이다.
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"idToken":"not-a-token"}' "https://${HTTPS_HOST}/api/auth/google" || true)
echo "https://${HTTPS_HOST}/api/auth/google (잘못된 토큰) -> ${code}"
[ "$code" = "401" ] || fail=1

# 기존 주소는 모바일이 새 주소로 옮기기 전까지 살아 있어야 한다.
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://${EC2_HOST}:${HOST_PORT}/health" || true)
echo "http://${EC2_HOST}:${HOST_PORT}/health -> ${code}"
[ "$code" = "200" ] || fail=1

if [ "$fail" -ne 0 ]; then
  echo "서버 안에서는 됐는데 바깥 HTTPS 만 안 되면 보안그룹의 인바운드 443 을 본다." >&2
  echo "http 만 안 되면 앱 컨테이너 쪽이다 — 이 스크립트는 그것을 건드리지 않는다." >&2
  exit 1
fi
