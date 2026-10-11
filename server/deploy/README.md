# 서버 배포

EC2 로 `/health` 와 `/health/ready` 가 200 을 주고, 그 앞에 HTTPS 입구를 붙이기까지의 절차.
DB 는 **같은 EC2 안의 Postgres 컨테이너**다(2026-10-10 RDS 에서 옮김, 5-1).
S3 는 아직 포함하지 않는다.

**이 이미지는 PostgreSQL 없이는 뜨지 않는다.** Flyway 가 시작할 때 연결을 요구한다.
`.env` 의 `DB_*` 가 비어 있으면 `deploy.sh` 가 시작 전에 멈추므로,
DB 없이 배포가 나가 서버가 죽는 일은 없다.

이미지는 **로컬에서 빌드해 ECR로 올리고 EC2는 pull만 한다.** EC2에서 Gradle 빌드를 돌리면
t3.micro(1GiB)의 메모리로는 아예 되지 않는다.

## 인스턴스는 t3.micro를 쓴다

계획서 10장은 t3.small을 권했지만 **프리 티어가 t2.micro/t3.micro까지만 무료**다.
`/health`만 도는 지금 단계는 1GiB로 충분하고, 무거워지면 그때 올린다.

1GiB에 맞춰 두 가지를 해 두었다.

- **스왑 2GB** (`user-data.sh`) — 메모리가 순간적으로 몰릴 때 죽는 대신 느려지게 한다
- **컨테이너 메모리 상한 + `MaxRAMPercentage=70`** (`ec2-run.sh`) —
  상한을 주지 않으면 JVM이 호스트 전체를 기준으로 힙을 잡아 OS 몫까지 먹는다.
  앱 640m · DB 192m · Caddy 128m. 합이 물리 메모리(913MB)를 조금 넘지만 실제 사용은 약 360MB 이고 스왑이 받친다
  (2026-10-10 실측: 앱 RSS 300~350MB · DB 48MB · Caddy 15MB). 모자라면 t3.small 인데 **정지 → 시작이라 IP 가 바뀐다**(HTTPS 절)

## 리전은 시드니(ap-southeast-2)다

계획서는 서울이었지만 **무료 플랜 계정은 한 리전에 묶여 있고 그것이 시드니로 잡혀 있다.**
다른 리전은 조직 SCP가 **읽기까지** 거부한다.

```
ap-southeast-2  허용        ap-northeast-2(서울)  SCP 거부
us-east-1       SCP 거부    ap-northeast-1(도쿄)  SCP 거부
```

SCP는 관리 계정에 붙어 있어 **프로젝트 계정에서는 읽지도 바꾸지도 못한다**
(`organizations describe-policy` → AccessDenied). IAM만 통과하는데 글로벌 서비스라 그렇다.
서울에서 권한 오류가 나면 IAM을 의심하기 전에 **리전부터 본다.**

지연은 서울 왕복 150ms 안팎인데 이 앱에서는 문제가 되지 않는다 —
기록은 로컬 SQLite에 먼저 쓰고(절대 규칙 1) 동기화는 백그라운드이며,
AI 작업은 원래 수 초 이상 걸린다.

## 비용

이 계정은 **무료 플랜**이라 사용량이 크레딧에서 차감된다(만료 2027-03-04).
예전 12개월 프리 티어와는 다른 제도다.

예산 두 개를 걸어 두었다.

| 예산 | 울리는 시점 |
| --- | --- |
| `kkume-zero-spend` | 크레딧이 바닥나 **실제 과금이 시작될 때** |
| `kkume-credit-burn` ($120, 크레딧 제외) | 크레딧을 **50%·80%** 썼을 때, 100% 초과가 예상될 때 |

**퍼블릭 IPv4 주소는 프리 티어가 없다**(시간당 $0.005 ≈ 월 $3.65). 빼먹기 쉬운 고정비다.

**RDS 를 쓰지 않는다**(2026-10-10, 문서 077 · 080). 10/1~10/9 비용의 55% 가 RDS 인스턴스였고, 그대로면 크레딧이
12월 중순에 바닥났다. DB 는 수 MB 라 EC2 안 컨테이너로 충분하다. 대신 백업 · 암호화를 직접 챙긴다(5-1 · 5-5).

## 파일

| 파일 | 언제 쓰나 |
| --- | --- |
| `.env.example` | `.env`로 복사해서 값을 채운다. `.env`는 커밋되지 않는다 |
| `ecr-push.sh` | 로컬에서 이미지를 빌드해 ECR로 push |
| `deploy.sh` | ssh로 EC2에 배포하고 바깥에서 `/health` 확인 |
| `ec2-run.sh` | EC2 안에서 도는 부분. `deploy.sh`가 stdin으로 밀어넣는다 |
| `user-data.sh` | 인스턴스 최초 부팅 때 한 번. Docker 설치와 스왑 |
| `https.sh` | ssh로 EC2에 HTTPS 입구(Caddy)를 띄우고 바깥에서 확인. **앱은 건드리지 않는다** |
| `ec2-https.sh` | EC2 안에서 도는 부분. `https.sh`가 stdin으로 밀어넣는다 |
| `Caddyfile` | HTTPS 입구 설정. EC2의 `/opt/kkume/Caddyfile`로 올라간다 |
| `moderate.sh` | **운영자 신고 처리**(문서 070 · 072) — `reports` · `show` · `remove` · `dismiss` · `suspend` · `unsuspend`. SSH 를 지금 IP 로 잠깐 열고 닫는다 |
| `log-retention.sh` | EC2 에 "매달 1일 컨테이너 기록 비우기" 타이머를 설치한다. 몇 번 돌려도 같다 |
| `ec2-db.sh` | EC2 안에서 Postgres 컨테이너(`kkume-db`)를 띄운다. 처음 한 번, 또는 DB 설정을 바꿀 때만(5-1) |
| `db-backup.sh` | EC2 에 "매일 DB 백업 → S3" 타이머를 설치한다. 몇 번 돌려도 같다(5-5) |

## 최초 1회 — 자원 만들기

프리 티어 안에서 도는 구성이지만 **한도를 넘으면 과금된다.**
인스턴스를 하나만 띄우고, 자원을 만들기 전에 예산 알림을 걸어 두는 것이 안전하다.

### 0. 자격증명

```bash
aws configure          # 액세스 키·시크릿·리전(ap-southeast-2) 입력
aws sts get-caller-identity    # Account 값을 .env의 AWS_ACCOUNT_ID에 넣는다
```

액세스 키는 IAM 콘솔에서 발급한다. **저장소나 대화에 남기지 않는다.**

### 1. ECR 리포지터리

```bash
aws ecr create-repository --repository-name kkume-server --region ap-southeast-2
```

### 2. 키페어

```bash
aws ec2 create-key-pair --key-name kkume-deploy \
  --query KeyMaterial --output text > ~/.ssh/kkume-deploy.pem
chmod 400 ~/.ssh/kkume-deploy.pem
```

### 3. 보안그룹

바깥에는 **443(HTTPS)만** 연다 — 앱의 80 은 Caddy 가 서버 안에서만 쓴다(HTTPS 절).
**SSH(22)는 상시로 열어 두지 않는다**(2026-10-07부터). 배포 · 점검 · `moderate.sh` 때 그때의 IP 로 열고 끝나면 닫는다 —
처리방침의 "외부에는 HTTPS(443)만 열려 있다"가 이것에 기댄다. 아래의 22 규칙은 최초 설치 때만 쓰고 지운다.

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 create-security-group --group-name kkume-server-sg \
  --description "kkume server" --query GroupId --output text
# 위에서 나온 sg-xxxx 를 아래에 넣는다
aws ec2 authorize-security-group-ingress --group-id sg-xxxx \
  --protocol tcp --port 22 --cidr "${MYIP}/32"
aws ec2 authorize-security-group-ingress --group-id sg-xxxx \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### 4. EC2가 ECR을 읽을 수 있게 (인스턴스 프로파일)

인스턴스에 액세스 키를 두지 않기 위한 것이다. 역할을 붙이면 EC2가 알아서 인증한다.

> **Windows에서는 `file://`에 Windows 경로를 준다.** AWS CLI가 Windows 바이너리라
> Git Bash의 `/tmp/...`를 찾지 못한다. `file://C:\경로\trust.json` 형태로 쓴다.

```bash
cat > trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam create-role --role-name kkume-ec2-ecr --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name kkume-ec2-ecr \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam create-instance-profile --instance-profile-name kkume-ec2-ecr
aws iam add-role-to-instance-profile \
  --instance-profile-name kkume-ec2-ecr --role-name kkume-ec2-ecr
```

### 5. EC2 인스턴스

AMI는 흔히 쓰는 `ssm get-parameters` 대신 `describe-images`로 찾는다.
배포 사용자에게 SSM 권한을 주지 않기 위해서다.

```bash
AMI=$(aws ec2 describe-images --owners amazon \
  --filters 'Name=name,Values=al2023-ami-2023.*-kernel-6.*-x86_64' \
            'Name=state,Values=available' \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)

aws ec2 run-instances \
  --image-id "$AMI" --instance-type t3.micro \
  --key-name kkume-deploy --security-group-ids sg-xxxx \
  --iam-instance-profile Name=kkume-ec2-ecr \
  --user-data fileb://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=kkume-server}]'
```

> **`--user-data`는 `file://`이 아니라 `fileb://`로 준다.** 주석이 한글이라
> `file://`로 주면 Windows CLI가 로컬 코드페이지로 디코딩하려다
> `text contents could not be decoded`로 죽는다. `fileb://`는 바이트 그대로 보낸다.

퍼블릭 주소를 확인해 `.env`의 `EC2_HOST`에 넣는다.

```bash
aws ec2 describe-instances --filters Name=tag:Name,Values=kkume-server \
  Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text
```

### 5-1. PostgreSQL — EC2 안 컨테이너

**DB 는 앱과 같은 EC2 안의 `kkume-db` 컨테이너다**(`postgres:17-alpine`, 2026-10-10 RDS 에서 옮김 — 문서 077 · 080).
RDS 시절 절차(보안그룹 `kkume-db-sg` · 서브넷 그룹 · `create-db-instance`)는 이 커밋 이전의 git 이력에 있다.

- **포트를 열지 않는다.** 호스트 포트 없이 docker 네트워크 `kkume-net` 으로만 앱과 붙는다. `.env` 의 `DB_HOST=kkume-db`
- **데이터는 암호화된 별도 EBS 에 둔다** — 루트 EBS(8GiB)는 암호화돼 있지 않고, 처리방침이 "DB 저장 시 암호화"를 약속한다(070).
  `ec2-db.sh` 는 `/var/lib/kkume-db` 가 마운트돼 있지 않으면 띄우지 않는다
- **17 로 맞춘다.** 로컬(`compose.yaml`) · 테스트(Testcontainers) · RDS 가 17 이었다
- 메모리 상한 192m, `shared_buffers=32MB` · `max_connections=20`(앱 Hikari 풀 10 + 운영) · `max_wal_size=256MB`
- **DB 는 스왑을 쓰지 않는다**(`--memory-swap 192m`). 스왑 파일(`user-data.sh`)이 암호화 안 된 루트 디스크에 있다

처음 한 번 — 암호화 볼륨을 만들어 붙인다(인스턴스를 정지하지 않는다. IP 가 그대로다).

```bash
# Git Bash 에서는 MSYS_NO_PATHCONV=1 — 아니면 /dev/sdf 가 Windows 경로로 바뀐다
VOL=$(aws ec2 create-volume --availability-zone ap-southeast-2b --size 2 --volume-type gp3 --encrypted \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=kkume-db-data}]' --query VolumeId --output text)
MSYS_NO_PATHCONV=1 aws ec2 attach-volume --volume-id "$VOL" --instance-id <인스턴스 id> --device /dev/sdf
```

EC2 안에서(새 디스크는 `/dev/nvme1n1` 로 보인다. **`blkid` 가 비어 있을 때만 포맷한다**):

```bash
sudo mkfs.ext4 -L kkume-db /dev/nvme1n1
sudo mkdir -p /var/lib/kkume-db
echo "UUID=$(sudo blkid -o value -s UUID /dev/nvme1n1) /var/lib/kkume-db ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo mount /var/lib/kkume-db
```

그다음 `ec2-db.sh` 를 돌린다(인자: DB 이름 · 사용자 · 비밀번호 — `.env` 의 값). 비밀번호는 컨테이너 환경변수로만 넘기고,
**데이터 디렉터리가 이미 있으면 Postgres 는 그 값을 무시한다**(처음 초기화 때만 쓴다). 바꾸려면 `ALTER ROLE` 로 바꾸고 `.env` 를 고친다.

> **`docker run -i` 를 `bash -s` 스크립트 안에서 쓰지 않는다.** ssh 로 stdin 에 밀어 넣은 스크립트의 **나머지를 그 컨테이너가 먹는다** —
> 스크립트가 그 줄에서 말없이 끝난다. 2026-10-10 이전 중에 앱만 멈춘 채 끝나 25초 끊겼다. stdin 이 필요 없으면 `-i` 를 빼고,
> 필요하면(`pg_restore < 파일`) 스크립트 전체를 `{ ... }` 로 감싸 bash 가 끝까지 읽은 뒤 돌게 한다.

### 5-2. S3 오디오 버킷

녹음 원본을 둔다(절대 규칙 2). **앱이 서버를 거치지 않고 presigned URL 로 직접 PUT 한다** —
느린 모바일 업로드를 t3.micro 가 붙잡고 있지 않게 하기 위해서다(문서 039).

조직 SCP 는 **시드니에서만** S3 를 허락한다. 권한 시뮬레이션은 `aws:RequestedRegion` 을 넘기지 않으면
전부 `explicitDeny` 로 나오니, S3 가 막혔다고 오해하지 않는다.

```bash
BUCKET=kkume-audio-341860778310     # 버킷 이름은 전 세계에서 유일해야 해서 계정 번호를 붙였다

aws s3api create-bucket --bucket "$BUCKET" --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

**EC2 역할에 이 버킷만 쓰는 권한을 붙인다.** 서버가 URL 에 서명하는 자격증명이 이 역할이라,
여기에 `PutObject` 가 없으면 앱의 PUT 이 403 이 된다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::kkume-audio-341860778310/audio/*",
                   "arn:aws:s3:::kkume-audio-341860778310/comics/*",
                   "arn:aws:s3:::kkume-audio-341860778310/posts/*"] },
    { "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::kkume-audio-341860778310" }
  ]
}
```

```bash
aws iam put-role-policy --role-name kkume-ec2-ecr --policy-name kkume-audio \
  --policy-document "file://C:\경로\kkume-audio-policy.json"
```

`comics/*` 는 꿈 만화 그림(`comics/{userId}/{comicId}/grid.jpg`), `posts/*` 는 꿈 나눔 글에 붙인 복사본이다(문서 081 04장).
글에 붙일 때 `CopyObject` 를 쓰므로 원본의 `GetObject` 와 대상의 `PutObject` 가 둘 다 있어야 한다.

> **`s3:ListBucket` 을 빼면 "파일 없음"이 404 가 아니라 403 으로 온다.** S3 는 목록 권한이 없는 쪽에
> 없는 키를 알려 주지 않는다. 서버는 404 만 "앱이 안 올렸다"(`422 upload_missing`)로 보고 403 은
> 설정 오류로 던지므로, 빼면 업로드 확인이 전부 500 이 된다. **여기에 prefix 조건을 걸면 안 된다** —
> `HeadObject` 에는 `s3:prefix` 가 없어 조건이 늘 거짓이 되고 같은 403 이 난다.

`.env` 의 `AUDIO_BUCKET` 에 버킷 이름을 넣는다. 비어 있으면 `deploy.sh` 가 멈춘다.

### 5-3. 신고 알림(SNS)

신고가 들어오면 운영자 메일로 알린다(문서 070 · 072). **SES 가 아니라 SNS 메일 구독이다** — 받는 사람이 하나이고
주소 인증 · 샌드박스가 없다. 매달 1,000통까지 무료.

```bash
TOPIC=$(aws sns create-topic --name kkume-reports --attributes DisplayName=kkume --query TopicArn --output text)
aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint <운영자 메일>
# → 그 메일함에 "Subscription Confirmation" 이 온다. 링크를 눌러야 알림이 간다
aws iam put-role-policy --role-name kkume-ec2-ecr --policy-name kkume-report-alerts \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sns:Publish\",\"Resource\":\"$TOPIC\"}]}"
```

`.env` 의 `REPORT_TOPIC_ARN` 에 주제를 넣는다. 비어 있으면 `deploy.sh` 가 멈춘다 — 신고가 와도 운영자가 모르게 되므로.

- **메일 제목은 ASCII 로만 쓴다.** SNS 는 제목에 ASCII 만 받고, 한글이 섞이면 발행을 거절한다
- **메일에 신고된 글의 내용을 넣지 않는다.** 메일은 Gmail 을 거쳐 꿈 내용이 Google 로 넘어가게 된다. 내용은 `moderate.sh show` 로 본다

### 5-3-1. 애플 토큰 회수 키

애플 계정을 지울 때 애플 토큰을 회수하려면(서버 README "애플 계정 삭제") Sign in with Apple 키가 있어야 한다.
Apple Developer → Certificates, IDs & Profiles → Keys → Sign in with Apple(Primary App ID `com.holdn2.kkume`)로 만들고
`.p8` 을 **한 번만** 내려받는다. `.env` 에 `APPLE_KEY_ID`(10자)와 `APPLE_KEY_FILE`(이 PC 의 `.p8` 경로)을 넣는다 — **키 내용을 `.env` · 저장소 · 채팅에 옮기지 않는다.**
`deploy.sh` 가 머리줄 · 줄바꿈을 뺀 한 줄로 바꿔 컨테이너 환경변수(`KKUME_APPLE_PRIVATE_KEY`)로만 넘긴다. DB 비밀번호와 같은 길이다.

**비어 있어도 배포는 된다** — 애플 로그인은 되고 회수만 건너뛴다(`deploy.sh` 와 서버 기동 로그에 경고). **App Store 제출 전에는 넣는다**(5.1.1(v)).

### 5-3-2. 꿈 만화 — Cloudflare Workers AI 키

대본 · 그림은 Cloudflare Workers AI 무료 플랜(하루 10,000뉴런, 카드 없음 — 넘치면 청구 대신 거절)이 만든다(문서 081 06장).
Cloudflare 대시보드에서 **Workers AI 권한만 있는** API 토큰을 만들고, 이 PC 에 `ACCOUNT_ID=…` · `API_TOKEN=…` 두 줄짜리 파일로 둔다.
`.env` 에는 그 경로만 `CLOUDFLARE_KEY_FILE` 로 넣는다 — 애플 키와 같이 **내용을 `.env` · 저장소 · 채팅에 옮기지 않는다.**
`deploy.sh` 가 읽어 컨테이너 환경변수(`KKUME_CLOUDFLARE_ACCOUNT_ID` · `KKUME_CLOUDFLARE_API_TOKEN`)로만 넘긴다.

**비어 있어도 배포는 된다** — 만화 만들기만 `503 comic_unavailable` 이 된다(`deploy.sh` 와 서버 기동 로그에 안내).
Cloudflare 의 저장 서비스(R2 · KV)는 쓰지 않는다 — 처리방침(PR #95)이 약속한 것이다. 그림은 위 버킷의 `comics/*` 에 둔다.

키를 바꾼 뒤 진짜로 한 편 그려 보려면(약 150뉴런):
`KKUME_CF_KEY_FILE=<키 파일> ./gradlew test --tests '*CloudflareLiveTest'` → `build/comic-live.jpg`

### 5-4. 기록 보관(한 달)

컨테이너 기록은 `--log-opt max-size=10m --log-opt max-file=3`(ec2-run.sh · ec2-https.sh)으로 크기를 막고,
`./log-retention.sh` 가 설치한 systemd 타이머가 **매달 1일 04:00(KST)** 비운다. 처리방침의 "최대 1개월"이 이것이다.
Docker 기본값(json-file)은 크기 제한이 없고, **Caddy 는 배포 때 다시 띄우지 않아** 상한이 없으면 계속 쌓인다(2026-10-07 실측: 9/14부터 쌓여 있었다).
**`--log-opt` 는 컨테이너를 다시 만들어야 먹는다** — 앱은 `deploy.sh`, Caddy 는 `https.sh`(HTTPS 가 몇 초 끊긴다).

### 5-5. DB 백업(매일 · 1일 보관)

RDS 의 자동 백업이 없어졌으므로 `./db-backup.sh` 가 설치한 systemd 타이머가 **매일 04:30(KST)** `pg_dump -Fc` 를
`s3://kkume-audio-341860778310/backup/` 에 올린다(AES256). **배포할 때마다 `ec2-run.sh` 도 직전에 한 번 뜬다**(`-pre-deploy`) —
RDS 때의 "배포 전 수동 스냅숏"을 대신한다. 백업이 실패하면 배포하지 않는다.

- **보관 1일** — 처리방침의 "자동 백업 1일"(070)이다. 지난 것은 백업 스크립트가 지운다. 늘리려면 처리방침부터 고친 뒤
  `.env` 에 `BACKUP_KEEP_DAYS` 를 넣고 `./db-backup.sh` 를 다시 돌린다
- 덤프는 암호화 볼륨(`/var/lib/kkume-db`)에 잠깐 썼다가 올리고 지운다. 루트 디스크에는 남기지 않는다
- 권한: EC2 역할 `kkume-ec2-ecr` 의 인라인 `kkume-db-backup` — `backup/*` 쓰기 · 읽기 · 지우기만
- 손으로 한 번: `sudo systemctl start kkume-db-backup.service` → `sudo journalctl -u kkume-db-backup.service -n 5`

**복원**(2026-10-10 시험 통과 — 행 수 전부 일치):

```bash
aws s3 cp s3://kkume-audio-341860778310/backup/<파일> /var/lib/kkume-db/restore.dump
sudo docker exec -i kkume-db pg_restore -U kkume -d kkume --clean --if-exists --no-owner --no-acl < /var/lib/kkume-db/restore.dump
sudo rm /var/lib/kkume-db/restore.dump
```

> **시험 복원은 임시 컨테이너를 `docker rm -fv` 로 지운다.** `postgres` 이미지는 데이터 디렉터리를 익명 볼륨으로 잡아서,
> `-v` 없이 지우면 **복원한 데이터가 암호화 안 된 루트 디스크에 남는다**(2026-10-10 실제로 남았고 지웠다).

### 6. 준비 확인

`user-data.sh`가 도는 데 1~2분 걸린다. 접속해서 세 가지를 확인한다.

```bash
ssh -i ~/.ssh/kkume-deploy.pem ec2-user@<주소>
docker --version     # 설치됐나
aws --version        # ec2-run.sh가 ECR 로그인에 쓴다 (AL2023에 이미 들어 있다)
swapon --show        # /swapfile 2G 가 보여야 한다
```

> **Docker가 보인다고 부팅 스크립트가 끝난 것이 아니다.** 스크립트에서 스왑 생성이
> Docker 설치보다 뒤에 있고 `dd`가 15초쯤 걸린다. Docker만 보고 확인하면
> 스왑이 없는 것처럼 보인다 — 실제로 한 번 그렇게 오진했다.
> **끝났는지는 `swapon --show`로 판단한다.**

`aws`가 없으면 `sudo dnf install -y awscli` 로 넣는다.

## HTTPS

```
https://13.239.58.251.nip.io  ->  Caddy(443)  ->  앱(EC2 안의 127.0.0.1:80)
http://13.239.58.251          ->  닫힘 (2026-09-17, 보안그룹에서 80 회수)
```

**iOS 가 평문 HTTP 를 막아서 붙였다.** ATS 예외(`NSExceptionDomains`)는 도메인 이름만 받고
IP 는 받지 않아서, IP 주소로는 앱 쪽에서 좁게 열 방법이 없었다(문서 030 · 이슈 #36).

### 도메인 없이 인증서를 받는 방법

`<IP>.nip.io` 는 DNS 설정 없이 그 IP 로 해석된다. 이름이 생기므로 Let's Encrypt 가
인증서를 발급할 수 있고, Caddy 가 발급과 갱신을 알아서 한다(만료 30일 전에 갱신).

### Caddy 는 443 만 쓴다

**호스트 80 은 앱이 쓰고 있다.** Caddy 에 80 을 넘기면 앱 컨테이너를 다시 띄워야 하고,
그것은 곧 배포다 — 운영 DB 에 마이그레이션이 같이 나간다. 그래서

- 인증서 검증을 80 대신 **443 으로 받는다**(`tls-alpn-01`). HTTP 검증을 켜 두면
  Let's Encrypt 가 80 으로 와서 앱에 닿고 실패하는데, **그 실패도 발급 한도에 잡힌다**
- HTTP -> HTTPS 리다이렉트를 끈다. 모바일이 옮겨 가는 동안 기존 `http://` 주소를 살려 두기 위해서였다.
  **모바일이 옮긴 뒤 보안그룹에서 80 을 닫았다**(2026-09-17, #42). Caddy 는 서버 안에서 `127.0.0.1:80` 으로
  앱에 닿으므로 보안그룹과 무관하게 동작한다

그래서 `https.sh` 는 **배포가 아니다.** 앱 · DB 컨테이너를 건드리지 않는다.

> **대체 발급처가 없다.** 발급처를 직접 지정하면 Caddy 의 기본 목록(Let's Encrypt + ZeroSSL)이
> 사라지고, ZeroSSL 대체 발급은 원래도 이메일을 설정해야 켜진다. 저장소에 개인 이메일을
> 두지 않으려고 넣지 않았다. **Let's Encrypt 가 막히면 도메인을 사거나 Cloudflare Tunnel 로 간다.**

### 띄우는 법

보안그룹에 **인바운드 443(0.0.0.0/0)** 이 있어야 한다. 80 은 이 목적으로는 필요 없다.

```bash
cd server/deploy
./https.sh     # Caddyfile 올리기 -> 설정 검사 -> 컨테이너 교체 -> 바깥에서 세 가지 확인
```

설정 검사를 **교체 전에** 한다. 잘못된 설정으로 기존 컨테이너를 먼저 지우면 HTTPS 가 통째로 끊긴다.
다시 돌려도 인증서를 새로 받지 않는다 — 이름 있는 볼륨 `kkume-caddy-data` 에 남아 있다.

### EC2 를 정지하지 않는다

**이 주소는 IP 에 묶여 있다.** Elastic IP 가 없어서, EC2 를 정지했다 켜면 퍼블릭 IP 가 바뀌고
`<IP>.nip.io` 도 함께 바뀐다. 모바일은 주소를 박아 쓰므로 OTA 를 다시 내보내야 한다.

재부팅(`reboot`)은 괜찮다 — IP 가 유지되고 두 컨테이너 모두 `--restart unless-stopped` 로 돌아온다.
**인스턴스 타입을 바꾸는 것(t3.small 등)도 정지 → 시작이다.** IP 가 바뀌므로 모바일 OTA 와 날짜를 맞춘다.

지금 Elastic IP 를 붙이지 않은 이유 — **붙이는 순간 IP 가 바뀐다.** 모바일이 아직
`http://13.239.58.251` 을 쓰고 있어서 그 주소가 즉시 죽는다. 모바일이 새 주소로 옮긴 뒤,
발표 전에 붙이는 것을 다시 본다(붙이면 주소가 한 번 바뀐다).

## 배포할 때마다

```bash
cd server/deploy
./ecr-push.sh        # 로컬 빌드 + ECR push
./deploy.sh          # EC2에 배포 + /health 확인
```

## 막혔을 때

| 증상 | 볼 곳 |
| --- | --- |
| **`explicit deny in a service control policy`** | **리전이 시드니가 맞는지 본다.** 권한 문제가 아니다 |
| **`Migration checksum mismatch`** (로컬) | 남의 compose 스택에 붙은 것이다. `compose.yaml` 의 `name:` 확인 |
| `ecr-push.sh`가 로그인에서 실패 | `aws sts get-caller-identity`로 자격증명부터 확인 |
| EC2에서 pull이 403 | 인스턴스 프로파일이 붙었는지 확인 (4번). 붙인 직후면 잠시 기다린다 |
| 컨테이너는 떴는데 바깥에서 안 됨 | 보안그룹 인바운드 443 (3번)과 `sudo docker ps` 의 `kkume-caddy`. SSH가 안 되면 내 공인 IP가 바뀐 것이다 |
| `http://<IP>` 가 안 됨 | **정상이다.** 80 은 닫았다. 앱은 `https://<IP>.nip.io` 로 붙는다 |
| `/health`가 502·연결 거부 | `sudo docker logs kkume-server` |
| **`/health` 는 200 인데 `/health/ready` 가 아님** | **DB 쪽이다.** `sudo docker ps` 에 `kkume-db` 가 있는지, 앱이 `kkume-net` 에 붙었는지(`docker inspect kkume-server`), `.env` 의 `DB_*` 가 맞는지 본다 |
| 컨테이너가 재시작만 반복 | Flyway 가 DB 에 못 닿는 것이다. 로그의 `Database: jdbc:postgresql://...` 줄을 본다 |
| `text contents could not be decoded` | `--user-data`에 `fileb://`를 썼는지 (5번) |
| HTTPS 만 연결 거부 | 보안그룹 인바운드 443. 서버 안에서는 되는지 `https.sh` 출력의 "HTTPS 응답 확인" 줄을 본다 |
| 인증서 발급이 120초 안에 안 끝남 | `sudo docker logs kkume-caddy`. `rateLimited` 면 **다시 돌리지 않는다** — 실패도 한도에 잡힌다 |
| **HTTPS 주소가 통째로 안 됨(DNS)** | **IP 가 바뀐 것이다.** EC2 를 정지했다 켰는지 본다. `.env` 의 `EC2_HOST` 를 새 IP 로 고치고 `./https.sh` |

## 지금 떠 있는 것

| 자원 | 값 |
| --- | --- |
| 리전 | `ap-southeast-2` |
| ECR | `341860778310.dkr.ecr.ap-southeast-2.amazonaws.com/kkume-server` |
| 보안그룹 | `kkume-server-sg` — **443만 공개**. 22 는 상시 규칙 없음(2026-10-07에 지움) — 쓸 때만 그때 IP 로 열고 닫는다. 80은 2026-09-17에 닫음 |
| HTTPS | `https://13.239.58.251.nip.io` — Caddy `2.11.4`, Let's Encrypt, 메모리 상한 128m |
| 오디오 버킷 | `kkume-audio-341860778310` — 시드니, 공개 차단 4개 전부, AES256, ACL 비활성(2026-09-17) |
| EC2 역할의 버킷 권한 | `kkume-ec2-ecr` 인라인 `kkume-audio` — `audio/*` · `comics/*` · `posts/*` 읽기·쓰기·삭제 + 버킷 목록. **그 밖에는 쓰지 못한다** |
| 배포 사용자의 버킷 권한 | `kkume-deploy` 인라인 `kkume-audio-bucket-admin` — 이 버킷의 생성·설정만. **파일은 읽고 쓰지 못한다** |
| 신고 알림 | SNS `kkume-reports`(시드니) → 메일 구독 `yoocy01@gmail.com`(2026-10-07) |
| EC2 역할의 알림 권한 | `kkume-ec2-ecr` 인라인 `kkume-report-alerts` — 이 주제에 `sns:Publish` 만 |
| 배포 사용자의 알림 권한 | `kkume-deploy` 인라인 `kkume-sns-reports-admin` — 이 주제의 생성 · 설정 · 구독 · 발행만 |
| 기록 보관 | 컨테이너 기록 10MB × 3, systemd `kkume-log-clear.timer` 가 매달 1일 비움 |
| 인스턴스 프로파일 | `kkume-ec2-ecr` (ECR 읽기 전용) |
| 인스턴스 | `t3.micro`, Amazon Linux 2023, 루트 EBS 8GiB(암호화 안 됨) |
| DB | 컨테이너 `kkume-db` — PostgreSQL 17.11, 메모리 상한 192m, 포트 없음(`kkume-net`), 데이터 `/var/lib/kkume-db/data` |
| DB 볼륨 | EBS `kkume-db-data`(`vol-0d7b7acfdc57b4d78`) — gp3 2GiB, **암호화 켬**, `/var/lib/kkume-db`(fstab `nofail`) |
| DB 백업 | systemd `kkume-db-backup.timer` 매일 04:30 KST + 배포 직전 → `s3://kkume-audio-341860778310/backup/`, 1일 보관 |
| EC2 역할의 백업 권한 | `kkume-ec2-ecr` 인라인 `kkume-db-backup` — `backup/*` 쓰기 · 읽기 · 지우기만 |
| RDS(옛) | `kkume-db` db.t3.micro — **2026-10-10 부터 쓰지 않음, 사용자 확인 뒤 삭제 예정**. `.env` 의 `RDS_HOST` 가 그 주소 — 되돌리려면 `DB_HOST` 를 그 값으로 |

**SSH 인바운드는 상시로 두지 않는다.** 쓸 때 지금 IP 로 열고, 끝나면 그 규칙을 회수한다(`moderate.sh` 는 이것을 스스로 한다).

> **IP 는 눈으로 옮겨 적지 않는다.** 2026-09-14 에 `210.106.232.208` 을 `.20` 으로 잘못 읽어
> 남의 IP 에 SSH 를 연 적이 있다. 명령 안에서 `checkip` 결과를 그대로 쓰고, 옛 규칙은 회수한다.

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id <sg-id> \
  --protocol tcp --port 22 --cidr "${MYIP}/32"
```
