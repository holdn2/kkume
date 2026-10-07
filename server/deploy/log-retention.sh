#!/usr/bin/env bash
# EC2 에 "매달 1일 컨테이너 기록 비우기"를 설치한다. 몇 번 돌려도 같은 결과다(문서 070 04장).
#
# 크기 상한(10MB × 3)은 ec2-run.sh · ec2-https.sh 의 --log-opt 가 지킨다. 지금 속도(하루 수 KB)로는 크기가
# 몇 년 동안 차지 않아서 그것만으로는 기간이 정해지지 않는다. 그래서 매달 비운다 — 배포 때 지워지는 것과 합쳐
# "서버 오류 기록은 최대 1개월"이 처리방침에 적힌 대로 사실이 된다.
#
# AL2023 에는 cron 이 없어 systemd 타이머를 쓴다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
: "${EC2_HOST:?}" "${EC2_USER:?}" "${SSH_KEY:?}"

ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

cat > /usr/local/bin/kkume-log-clear <<'SCRIPT'
#!/usr/bin/env bash
# 컨테이너 기록을 비운다. 지금 쓰는 파일은 0 으로 자르고, 돌려 둔 옛 파일(.1 .2)은 지운다
set -u
for f in /var/lib/docker/containers/*/*-json.log; do
  [ -e "$f" ] && truncate -s 0 "$f"
done
rm -f /var/lib/docker/containers/*/*-json.log.[0-9]*
echo "kkume: container logs cleared $(date -Is)"
SCRIPT
chmod 755 /usr/local/bin/kkume-log-clear

cat > /etc/systemd/system/kkume-log-clear.service <<'UNIT'
[Unit]
Description=kkume - clear container logs (monthly retention)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/kkume-log-clear
UNIT

cat > /etc/systemd/system/kkume-log-clear.timer <<'UNIT'
[Unit]
Description=kkume - clear container logs on the 1st of every month

[Timer]
OnCalendar=*-*-01 04:00:00 Asia/Seoul
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now kkume-log-clear.timer
systemctl list-timers kkume-log-clear.timer --no-pager
REMOTE
