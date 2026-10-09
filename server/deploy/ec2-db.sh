#!/usr/bin/env bash
# EC2 안에서 도는 스크립트. Postgres 컨테이너(kkume-db)를 한 번 띄운다(문서 077 · 080).
# 처음 한 번, 또는 컨테이너를 다시 만들 때만 돌린다. 데이터는 호스트 디렉터리에 있어서 컨테이너를 지워도 남는다.
#
# 데이터는 암호화된 별도 EBS(kkume-db-data, /var/lib/kkume-db)에 둔다. 루트 EBS 는 암호화돼 있지 않고,
# 처리방침이 "DB 저장 시 암호화"를 약속한다(070 · RDS 때는 StorageEncrypted). 마운트가 없으면 띄우지 않는다 —
# 그대로 띄우면 암호화 안 된 루트 디스크에 조용히 쓴다. 볼륨 만들기는 README 5-1.
#
# 인자: <DB 이름> <DB 사용자> <DB 비밀번호>
# 비밀번호는 컨테이너 환경변수로만 넘긴다. 볼륨이 이미 있으면 Postgres 는 이 값을 무시한다
# (처음 초기화할 때만 쓴다) — 비밀번호를 바꾸려면 ALTER ROLE 로 바꾼다.
set -euo pipefail

DB_NAME="$1"
DB_USER="$2"
DB_PASSWORD="$3"
NAME=kkume-db
NET=kkume-net
MOUNT=/var/lib/kkume-db
DATA="${MOUNT}/data"

mountpoint -q "${MOUNT}" || { echo "${MOUNT} 가 마운트돼 있지 않다 — 암호화 볼륨부터 붙인다(README 5-1)" >&2; exit 1; }
sudo mkdir -p "${DATA}"

# 앱과 DB 만 붙는 네트워크. DB 는 호스트 포트를 열지 않는다 — 바깥은 물론 호스트에서도 이 네트워크로만 닿는다.
sudo docker network inspect "${NET}" >/dev/null 2>&1 || sudo docker network create "${NET}"

sudo docker rm -f "${NAME}" 2>/dev/null || true

# t3.micro(1GiB)에 앱 · Caddy 와 함께 산다. 데이터가 수 MB 라 버퍼를 작게 잡아도 전부 메모리에 들어간다.
# max_connections 20: 앱 Hikari 기본 풀 10 + 운영 psql · pg_dump 몇 개.
# max_wal_size 256MB: 기본 1GB 면 WAL 만으로 2GiB 볼륨의 절반을 쓸 수 있다.
# --memory-swap 을 상한과 같게 둬 DB 는 스왑을 쓰지 않는다 — 스왑 파일이 암호화 안 된 루트 디스크에 있다.
sudo docker run -d \
  --name "${NAME}" \
  --restart unless-stopped \
  --memory 192m \
  --memory-swap 192m \
  --log-opt max-size=10m --log-opt max-file=3 \
  --network "${NET}" \
  -v "${DATA}:/var/lib/postgresql/data" \
  -e POSTGRES_DB="${DB_NAME}" \
  -e POSTGRES_USER="${DB_USER}" \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
  postgres:17-alpine \
  -c shared_buffers=32MB \
  -c max_connections=20 \
  -c work_mem=2MB \
  -c maintenance_work_mem=16MB \
  -c effective_cache_size=128MB \
  -c max_wal_size=256MB \
  -c min_wal_size=64MB

echo "== 기동 대기"
for i in $(seq 1 60); do
  if sudo docker exec "${NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    echo "== 준비됨 (${i}초)"
    sudo docker exec "${NAME}" postgres --version
    exit 0
  fi
  sleep 1
done
echo "== 60초 안에 준비되지 않았다" >&2
sudo docker logs --tail 50 "${NAME}" >&2
exit 1
