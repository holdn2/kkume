#!/usr/bin/env bash
# EC2 안에서 도는 스크립트. deploy.sh 가 ssh로 밀어넣어 실행한다.
# 인자: <레지스트리> <리포지터리> <호스트포트> <리전>
set -euo pipefail

REGISTRY="$1"
REPO="$2"
HOST_PORT="$3"
REGION="$4"
NAME=kkume-server

echo "== ECR 로그인"
# 인스턴스 프로파일의 권한으로 로그인한다. 이 인스턴스에 액세스 키를 두지 않는다.
aws ecr get-login-password --region "${REGION}" \
  | sudo docker login --username AWS --password-stdin "${REGISTRY}"

echo "== pull"
sudo docker pull "${REGISTRY}/${REPO}:latest"

echo "== 기존 컨테이너 교체"
# 없을 때도 실패하지 않게 한다. 첫 배포가 여기서 걸리면 안 된다.
sudo docker rm -f "${NAME}" 2>/dev/null || true

sudo docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}":8080 \
  "${REGISTRY}/${REPO}:latest"

echo "== 기동 대기"
for i in $(seq 1 60); do
  if curl -fsS "http://localhost:${HOST_PORT}/health" >/dev/null 2>&1; then
    echo "== /health 응답 확인 (${i}초)"
    curl -s "http://localhost:${HOST_PORT}/health"; echo
    exit 0
  fi
  sleep 1
done

echo "== 60초 안에 /health가 응답하지 않았다. 컨테이너 로그:" >&2
sudo docker logs --tail 50 "${NAME}" >&2
exit 1
