# 서버 배포

EC2 + RDS 로 `/health` 와 `/health/ready` 가 200 을 주는 것까지의 절차.
S3 · 인증 · HTTPS 는 아직 포함하지 않는다.

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
- **컨테이너 메모리 상한 768m + `MaxRAMPercentage=70`** (`ec2-run.sh`) —
  상한을 주지 않으면 JVM이 호스트 전체를 기준으로 힙을 잡아 OS 몫까지 먹는다

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

## 파일

| 파일 | 언제 쓰나 |
| --- | --- |
| `.env.example` | `.env`로 복사해서 값을 채운다. `.env`는 커밋되지 않는다 |
| `ecr-push.sh` | 로컬에서 이미지를 빌드해 ECR로 push |
| `deploy.sh` | ssh로 EC2에 배포하고 바깥에서 `/health` 확인 |
| `ec2-run.sh` | EC2 안에서 도는 부분. `deploy.sh`가 stdin으로 밀어넣는다 |
| `user-data.sh` | 인스턴스 최초 부팅 때 한 번. Docker 설치와 스왑 |

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

SSH는 **내 IP만** 연다. 80은 발표 시연을 위해 열어 둔다.

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 create-security-group --group-name kkume-server-sg \
  --description "kkume server" --query GroupId --output text
# 위에서 나온 sg-xxxx 를 아래에 넣는다
aws ec2 authorize-security-group-ingress --group-id sg-xxxx \
  --protocol tcp --port 22 --cidr "${MYIP}/32"
aws ec2 authorize-security-group-ingress --group-id sg-xxxx \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
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

### 5-1. RDS PostgreSQL

DB 는 인터넷에 열지 않는다. **EC2 의 보안그룹에서만 5432 를 허용한다.**

```bash
# DB 전용 보안그룹 — 출발지를 CIDR 이 아니라 EC2 보안그룹으로 준다
RDS_SG=$(aws ec2 create-security-group --group-name kkume-db-sg \
  --description "kkume RDS - EC2 only" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group <EC2 보안그룹 id>

aws rds create-db-subnet-group --db-subnet-group-name kkume-db-subnets \
  --db-subnet-group-description "kkume default vpc subnets" \
  --subnet-ids <기본 VPC 서브넷 3개>

aws rds create-db-instance \
  --db-instance-identifier kkume-db --db-instance-class db.t3.micro \
  --engine postgres --engine-version 17.11 \
  --master-username kkume --master-user-password "$(openssl rand -hex 24)" \
  --db-name kkume \
  --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --db-subnet-group-name kkume-db-subnets --vpc-security-group-ids "$RDS_SG" \
  --no-publicly-accessible --no-multi-az --backup-retention-period 1
```

**엔진 버전을 17.11 로 박는다.** RDS 의 기본값은 18.x 인데 로컬(`compose.yaml`)과
테스트(Testcontainers)가 17 이라, 그대로 두면 배포에서만 다른 버전을 쓰게 된다.

> **백업 보존은 1일이 상한이다.** 무료 플랜에서 7일을 주면
> `FreeTierRestrictionError` 로 거부된다. **하루 안에 발견하지 못한 데이터 손상은
> 되돌릴 수 없다는 뜻이다** — 발표 전에는 스냅샷을 손으로 한 번 떠 둔다.
>
> ```bash
> aws rds create-db-snapshot --db-instance-identifier kkume-db \
>   --db-snapshot-identifier kkume-db-before-demo
> ```

엔드포인트를 `.env` 의 `DB_HOST` 에 넣는다.

```bash
aws rds describe-db-instances --db-instance-identifier kkume-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

**비밀번호는 `.env` 에만 있다.** 저장소에도, EC2 디스크에도 두지 않는다 —
`deploy.sh` 가 ssh 인자로 넘기고 `ec2-run.sh` 가 컨테이너 환경변수로만 쓴다.
잃어버리면 다시 만든다.

```bash
aws rds modify-db-instance --db-instance-identifier kkume-db \
  --master-user-password "$(openssl rand -hex 24)" --apply-immediately
```

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
| 컨테이너는 떴는데 바깥에서 안 됨 | 보안그룹 인바운드 80 (3번). SSH가 안 되면 내 공인 IP가 바뀐 것이다 |
| `/health`가 502·연결 거부 | `sudo docker logs kkume-server` |
| **`/health` 는 200 인데 `/health/ready` 가 아님** | **RDS 쪽이다.** `kkume-db-sg` 가 EC2 보안그룹에서 5432 를 열어 주는지, `.env` 의 `DB_*` 가 맞는지 본다 |
| 컨테이너가 재시작만 반복 | Flyway 가 DB 에 못 닿는 것이다. 로그의 `Database: jdbc:postgresql://...` 줄을 본다 |
| `text contents could not be decoded` | `--user-data`에 `fileb://`를 썼는지 (5번) |

## 지금 떠 있는 것

| 자원 | 값 |
| --- | --- |
| 리전 | `ap-southeast-2` |
| ECR | `341860778310.dkr.ecr.ap-southeast-2.amazonaws.com/kkume-server` |
| 보안그룹 | `kkume-server-sg` — 22는 개발 PC IP만, 80은 공개 |
| 인스턴스 프로파일 | `kkume-ec2-ecr` (ECR 읽기 전용) |
| 인스턴스 | `t3.micro`, Amazon Linux 2023, EBS 8GiB |
| DB | `kkume-db` — PostgreSQL 17.11, db.t3.micro, gp3 20GiB, 암호화 켬, 퍼블릭 차단 |
| DB 보안그룹 | `kkume-db-sg` — 5432 를 EC2 보안그룹에서만 허용 |
| DB 서브넷 그룹 | `kkume-db-subnets` |

**SSH 인바운드는 개발 PC의 공인 IP 하나로 묶여 있다.** 집·학교를 옮기거나
IP가 바뀌면 접속이 막힌다. 그때는 규칙을 새 IP로 갈아준다.

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id <sg-id> \
  --protocol tcp --port 22 --cidr "${MYIP}/32"
```
