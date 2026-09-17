#!/usr/bin/env bash
# EC2 안에서 도는 스크립트. deploy.sh 가 ssh로 밀어넣어 실행한다.
# 인자: <레지스트리> <리포지터리> <호스트포트> <리전> <DB URL> <DB 사용자> <DB 비밀번호> <JWT 서명키> <오디오 버킷>
#
# 비밀번호와 서명키는 인자로 받아 컨테이너 환경변수로만 넘긴다. EC2 디스크에
# 파일로 남기지 않는다 — 남기면 지우는 것을 잊는다.
set -euo pipefail

REGISTRY="$1"
REPO="$2"
HOST_PORT="$3"
REGION="$4"
DB_URL="$5"
DB_USER="$6"
DB_PASSWORD="$7"
JWT_SECRET="$8"
AUDIO_BUCKET="$9"
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

# t3.micro는 메모리가 1GiB뿐이다. 컨테이너에 상한을 주지 않으면 JVM이
# 호스트 전체를 기준으로 힙을 잡아 OS 몫까지 먹는다. 상한을 주고
# 그 안에서 비율로 힙을 잡게 한다.
#
# 앱은 127.0.0.1 에만 연다. 바깥에서는 Caddy(443)로만 들어온다(#42).
# 0.0.0.0 으로 열어 두면 보안그룹이 실수로 80 을 다시 열었을 때 평문이 그대로 샌다.
sudo docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  --memory 768m \
  -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70" \
  -e SPRING_DATASOURCE_URL="${DB_URL}" \
  -e SPRING_DATASOURCE_USERNAME="${DB_USER}" \
  -e SPRING_DATASOURCE_PASSWORD="${DB_PASSWORD}" \
  -e KKUME_JWT_SECRET="${JWT_SECRET}" \
  -e KKUME_AUDIO_BUCKET="${AUDIO_BUCKET}" \
  -p "127.0.0.1:${HOST_PORT}:8080" \
  "${REGISTRY}/${REPO}:latest"

echo "== 기동 대기"
# /health 가 아니라 /health/ready 를 본다. DB 가 붙은 뒤로는 프로세스가 떴다는 것만으로
# 배포가 성공한 것이 아니다 — RDS 에 못 닿으면 Flyway 가 죽어 컨테이너가 재시작만 반복한다.
for i in $(seq 1 90); do
  if curl -fsS "http://localhost:${HOST_PORT}/health/ready" >/dev/null 2>&1; then
    echo "== /health/ready 응답 확인 (${i}초)"
    curl -s "http://localhost:${HOST_PORT}/health/ready"; echo
    curl -s "http://localhost:${HOST_PORT}/health"; echo
    exit 0
  fi
  sleep 1
done

echo "== 60초 안에 /health가 응답하지 않았다. 컨테이너 로그:" >&2
sudo docker logs --tail 50 "${NAME}" >&2
exit 1
