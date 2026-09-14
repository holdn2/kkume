#!/usr/bin/env bash
# EC2 안에서 도는 스크립트. https.sh 가 ssh로 밀어넣어 실행한다.
# 인자: <HTTPS 호스트 이름> <앱 호스트포트>
#
# 앱 컨테이너(kkume-server)는 건드리지 않는다. Caddy 컨테이너만 만들거나 교체한다.
set -euo pipefail

HTTPS_HOST="$1"
APP_PORT="$2"
NAME=kkume-caddy
IMAGE=caddy:2.11.4
CADDYFILE=/opt/kkume/Caddyfile

[ -f "${CADDYFILE}" ] || { echo "${CADDYFILE} 가 없다. https.sh 가 먼저 올린다." >&2; exit 1; }

echo "== 설정 검사"
# 잘못된 설정으로 기존 컨테이너를 먼저 지우면 HTTPS 가 통째로 끊긴다. 교체 전에 본다.
sudo docker run --rm \
  -e KKUME_HTTPS_HOST="${HTTPS_HOST}" \
  -e KKUME_APP_PORT="${APP_PORT}" \
  -v "${CADDYFILE}":/etc/caddy/Caddyfile:ro \
  "${IMAGE}" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "== 기존 컨테이너 교체"
sudo docker rm -f "${NAME}" 2>/dev/null || true

# --network host: 443 을 호스트에 직접 열고, 앱에는 127.0.0.1:<앱 포트>로 닿는다.
#
# 인증서는 이름 있는 볼륨(kkume-caddy-data)에 둔다. 컨테이너를 지워도 남아야 한다 —
# 재시작할 때마다 새로 받으면 Let's Encrypt 발급 한도(같은 이름에 주당 5회)에 걸린다.
#
# t3.micro 는 1GiB 에 앱이 768m 을 쓴다. Caddy 에도 상한을 준다. Go 런타임은 cgroup 상한을
# 모르므로 GOMEMLIMIT 로 알려 준다 — 앱 쪽의 MaxRAMPercentage 와 같은 이유다.
sudo docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  --memory 128m \
  --network host \
  -e GOMEMLIMIT=100MiB \
  -e KKUME_HTTPS_HOST="${HTTPS_HOST}" \
  -e KKUME_APP_PORT="${APP_PORT}" \
  -v "${CADDYFILE}":/etc/caddy/Caddyfile:ro \
  -v kkume-caddy-data:/data \
  -v kkume-caddy-config:/config \
  "${IMAGE}"

echo "== 인증서 발급 대기"
# 서버 안에서도 인증서를 검증한다(-k 를 쓰지 않는다). 자체 서명이면 여기서 통과하지 못한다.
for i in $(seq 1 120); do
  if curl -fsS --resolve "${HTTPS_HOST}:443:127.0.0.1" "https://${HTTPS_HOST}/health" >/dev/null 2>&1; then
    echo "== HTTPS 응답 확인 (${i}초)"
    curl -s --resolve "${HTTPS_HOST}:443:127.0.0.1" "https://${HTTPS_HOST}/health"; echo
    exit 0
  fi
  sleep 1
done

echo "== 120초 안에 HTTPS 가 응답하지 않았다. Caddy 로그:" >&2
sudo docker logs --tail 60 "${NAME}" >&2
exit 1
