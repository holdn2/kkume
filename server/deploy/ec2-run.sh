#!/usr/bin/env bash
# EC2 안에서 도는 스크립트. deploy.sh 가 ssh로 밀어넣어 실행한다.
# 인자: <레지스트리> <리포지터리> <호스트포트> <리전> <DB URL> <DB 사용자> <DB 비밀번호> <JWT 서명키> <오디오 버킷> <신고 알림 주제>
#       [<애플 키 ID> <애플 키(.p8 의 base64 한 줄)>] — 비면 애플 로그인은 되고 계정 삭제 때 애플 토큰 회수만 건너뛴다
#       [<Cloudflare 계정 ID> <Cloudflare API 토큰>] — 비면 꿈 만화 만들기만 503 comic_unavailable
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
REPORT_TOPIC_ARN="${10}"
APPLE_KEY_ID="${11:-}"
APPLE_PRIVATE_KEY="${12:-}"
CLOUDFLARE_ACCOUNT_ID="${13:-}"
CLOUDFLARE_API_TOKEN="${14:-}"
NAME=kkume-server

echo "== ECR 로그인"
# 인스턴스 프로파일의 권한으로 로그인한다. 이 인스턴스에 액세스 키를 두지 않는다.
aws ecr get-login-password --region "${REGION}" \
  | sudo docker login --username AWS --password-stdin "${REGISTRY}"

echo "== pull"
sudo docker pull "${REGISTRY}/${REPO}:latest"

# DB(kkume-db, ec2-db.sh)와 같은 네트워크에 붙는다. DB_URL 의 호스트가 kkume-db 다(문서 080).
# 없으면 만든다 — DB 보다 앱을 먼저 띄우는 순서에서도 여기서 걸리지 않게.
sudo docker network inspect kkume-net >/dev/null 2>&1 || sudo docker network create kkume-net

# 배포 전 백업 — 새 이미지의 Flyway 가 스키마를 바꾸기 전 상태를 S3 에 남긴다(RDS 때의 "배포 전 스냅숏", db-backup.sh).
# 실패하면 배포하지 않는다. DB 가 같은 인스턴스에 있어서 이것 말고는 되돌릴 사본이 없다.
if sudo docker ps --format '{{.Names}}' | grep -qx kkume-db; then
  echo "== 배포 전 백업"
  sudo /usr/local/bin/kkume-db-backup pre-deploy
fi

echo "== 기존 컨테이너 교체"
# 없을 때도 실패하지 않게 한다. 첫 배포가 여기서 걸리면 안 된다.
sudo docker rm -f "${NAME}" 2>/dev/null || true

# t3.micro는 메모리가 1GiB뿐이다. 컨테이너에 상한을 주지 않으면 JVM이
# 호스트 전체를 기준으로 힙을 잡아 OS 몫까지 먹는다. 상한을 주고
# 그 안에서 비율로 힙을 잡게 한다. 640m 은 DB 를 같은 인스턴스에 들이면서 768m 에서 줄인 값이다 —
# 실측 RSS 320MB · 최고 353MB(2026-10-10), 힙 상한은 그 70% 인 약 448MB.
#
# 앱은 127.0.0.1 에만 연다. 바깥에서는 Caddy(443)로만 들어온다(#42).
# 0.0.0.0 으로 열어 두면 보안그룹이 실수로 80 을 다시 열었을 때 평문이 그대로 샌다.
#
# 기록은 컨테이너당 10MB × 3개까지만 둔다. 기본값(json-file)은 크기 제한이 없다.
# 기간 상한(한 달)은 log-retention.sh 가 설치한 예약 작업이 지킨다(문서 070 04장).
sudo docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  --memory 640m \
  --network kkume-net \
  --log-opt max-size=10m --log-opt max-file=3 \
  -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70" \
  -e SPRING_DATASOURCE_URL="${DB_URL}" \
  -e SPRING_DATASOURCE_USERNAME="${DB_USER}" \
  -e SPRING_DATASOURCE_PASSWORD="${DB_PASSWORD}" \
  -e KKUME_JWT_SECRET="${JWT_SECRET}" \
  -e KKUME_AUDIO_BUCKET="${AUDIO_BUCKET}" \
  -e KKUME_REPORT_TOPIC_ARN="${REPORT_TOPIC_ARN}" \
  -e KKUME_APPLE_KEY_ID="${APPLE_KEY_ID}" \
  -e KKUME_APPLE_PRIVATE_KEY="${APPLE_PRIVATE_KEY}" \
  -e KKUME_CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}" \
  -e KKUME_CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" \
  -p "127.0.0.1:${HOST_PORT}:8080" \
  "${REGISTRY}/${REPO}:latest"

echo "== 기동 대기"
# /health 가 아니라 /health/ready 를 본다. DB 가 붙은 뒤로는 프로세스가 떴다는 것만으로
# 배포가 성공한 것이 아니다 — DB 에 못 닿으면 Flyway 가 죽어 컨테이너가 재시작만 반복한다.
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
