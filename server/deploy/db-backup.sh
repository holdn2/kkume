#!/usr/bin/env bash
# EC2 에 "매일 DB 백업"을 설치한다. 몇 번 돌려도 같은 결과다(문서 077 · 080).
#
# DB 는 EC2 안 컨테이너(kkume-db)다. RDS 의 자동 백업이 없어졌으므로 직접 뜬다:
# pg_dump -Fc → s3://<오디오 버킷>/backup/ (AES256). 덤프는 암호화 볼륨(/var/lib/kkume-db)에 잠깐 썼다가 올린 뒤 지운다 —
# 루트 EBS 는 암호화돼 있지 않다.
# 보관은 KEEP_DAYS 일(기본 1) — 지난 것은 백업 스크립트가 지운다(배포 사용자에게 수명 주기 설정 권한이 없어서).
# 1일은 처리방침의 "자동 백업 1일"(070, RDS 때 BackupRetentionPeriod 1)이다. 지운 계정의 데이터도 이 기간만큼
# 백업에 남는다(064). 늘리려면 처리방침부터 고친다.
#
# ec2-run.sh 도 배포 직전에 이것을 부른다("배포 전 백업" — RDS 때의 "배포 전 스냅숏"을 대신한다).
# EC2 역할 kkume-ec2-ecr 에 인라인 정책 kkume-db-backup(backup/* 쓰기 · 읽기 · 지우기)이 있어야 한다(README 5-5).
#
# AL2023 에는 cron 이 없어 systemd 타이머를 쓴다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
: "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}" "${AUDIO_BUCKET:?}" "${DB_NAME:?}" "${DB_USER:?}" "${AWS_REGION:?}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-1}"

ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" \
  "sudo bash -s -- '${AUDIO_BUCKET}' '${DB_NAME}' '${DB_USER}' '${KEEP_DAYS}' '${AWS_REGION}'" <<'REMOTE'
set -euo pipefail
BUCKET="$1"; DB_NAME="$2"; DB_USER="$3"; KEEP_DAYS="$4"; REGION="$5"

cat > /etc/kkume-db-backup.conf <<CONF
BUCKET=${BUCKET}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
KEEP_DAYS=${KEEP_DAYS}
AWS_DEFAULT_REGION=${REGION}
CONF

cat > /usr/local/bin/kkume-db-backup <<'SCRIPT'
#!/usr/bin/env bash
# 사용: kkume-db-backup [daily|pre-deploy]
# kkume-db 를 덤프해 S3 backup/ 에 올리고, KEEP_DAYS 일이 지난 백업을 지운다
set -euo pipefail
# shellcheck disable=SC1091
. /etc/kkume-db-backup.conf
export AWS_DEFAULT_REGION
KIND="${1:-daily}"
KEY="backup/kkume-$(date -u +%Y%m%dT%H%M%SZ)-${KIND}.dump"

# 컨테이너 안의 로컬 접속은 trust 라 비밀번호가 필요 없다(공식 이미지 기본값). 덤프가 비면 올리지 않는다
TMP=$(mktemp -p /var/lib/kkume-db)
trap 'rm -f "$TMP"' EXIT
docker exec kkume-db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$TMP"
[ -s "$TMP" ] || { echo "kkume: 덤프가 비었다" >&2; exit 1; }
aws s3 cp --only-show-errors "$TMP" "s3://${BUCKET}/${KEY}"
echo "kkume: backup ${KEY} $(stat -c %s "$TMP") bytes"

# 한 시간을 당겨 둔다 — 어제 04:30:05 백업이 오늘 04:30:02 에는 아직 "하루 안"이라 하루 더 남지 않게
cutoff=$(date -u -d "-${KEEP_DAYS} days +1 hour" +%Y%m%dT%H%M%SZ)
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix backup/ --query 'Contents[].Key' --output text \
  | tr '\t' '\n' | while read -r k; do
      [ -n "$k" ] && [ "$k" != None ] || continue
      stamp=${k#backup/kkume-}; stamp=${stamp%%-*}
      if [[ "$stamp" < "$cutoff" ]]; then
        aws s3 rm --only-show-errors "s3://${BUCKET}/${k}" && echo "kkume: expired ${k}"
      fi
    done
SCRIPT
chmod 755 /usr/local/bin/kkume-db-backup

cat > /etc/systemd/system/kkume-db-backup.service <<'UNIT'
[Unit]
Description=kkume - daily database backup to S3

[Service]
Type=oneshot
ExecStart=/usr/local/bin/kkume-db-backup daily
UNIT

cat > /etc/systemd/system/kkume-db-backup.timer <<'UNIT'
[Unit]
Description=kkume - database backup every day at 04:30 KST

[Timer]
OnCalendar=*-*-* 04:30:00 Asia/Seoul
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now kkume-db-backup.timer
systemctl list-timers kkume-db-backup.timer --no-pager
REMOTE
