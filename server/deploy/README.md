# 서버 배포

`/health`가 EC2에서 200을 주는 것까지의 절차. RDS·S3·인증·HTTPS는 아직 포함하지 않는다.

이미지는 **로컬에서 빌드해 ECR로 올리고 EC2는 pull만 한다.** EC2에서 Gradle 빌드를 돌리면
t3.micro(1GiB)의 메모리로는 아예 되지 않는다.

## 인스턴스는 t3.micro를 쓴다

계획서 10장은 t3.small을 권했지만 **프리 티어가 t2.micro/t3.micro까지만 무료**다.
`/health`만 도는 지금 단계는 1GiB로 충분하고, 무거워지면 그때 올린다.

1GiB에 맞춰 두 가지를 해 두었다.

- **스왑 2GB** (`user-data.sh`) — 메모리가 순간적으로 몰릴 때 죽는 대신 느려지게 한다
- **컨테이너 메모리 상한 768m + `MaxRAMPercentage=70`** (`ec2-run.sh`) —
  상한을 주지 않으면 JVM이 호스트 전체를 기준으로 힙을 잡아 OS 몫까지 먹는다

**프리 티어는 계정 개설 후 첫해까지다.** 12개월이 지나면 같은 구성이 그대로 과금된다.
퍼블릭 IPv4 주소도 첫해에는 월 750시간이 무료지만 그 뒤로는 시간당 요금이 붙는다.

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
aws configure          # 액세스 키·시크릿·리전(ap-northeast-2) 입력
aws sts get-caller-identity    # Account 값을 .env의 AWS_ACCOUNT_ID에 넣는다
```

액세스 키는 IAM 콘솔에서 발급한다. **저장소나 대화에 남기지 않는다.**

### 1. ECR 리포지터리

```bash
aws ecr create-repository --repository-name kkume-server --region ap-northeast-2
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

```bash
cat > /tmp/trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam create-role --role-name kkume-ec2-ecr --assume-role-policy-document file:///tmp/trust.json
aws iam attach-role-policy --role-name kkume-ec2-ecr \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam create-instance-profile --instance-profile-name kkume-ec2-ecr
aws iam add-role-to-instance-profile \
  --instance-profile-name kkume-ec2-ecr --role-name kkume-ec2-ecr
```

### 5. EC2 인스턴스

```bash
AMI=$(aws ssm get-parameters \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameters[0].Value' --output text)

aws ec2 run-instances \
  --image-id "$AMI" --instance-type t3.micro \
  --key-name kkume-deploy --security-group-ids sg-xxxx \
  --iam-instance-profile Name=kkume-ec2-ecr \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=kkume-server}]'
```

퍼블릭 주소를 확인해 `.env`의 `EC2_HOST`에 넣는다.

```bash
aws ec2 describe-instances --filters Name=tag:Name,Values=kkume-server \
  Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text
```

### 6. 준비 확인

`user-data.sh`가 도는 데 1~2분 걸린다. 접속해서 두 가지를 확인한다.

```bash
ssh -i ~/.ssh/kkume-deploy.pem ec2-user@<주소>
docker --version     # 설치됐나
aws --version        # ec2-run.sh가 ECR 로그인에 쓴다
```

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
| `ecr-push.sh`가 로그인에서 실패 | `aws sts get-caller-identity`로 자격증명부터 확인 |
| EC2에서 pull이 403 | 인스턴스 프로파일이 붙었는지 확인 (4번). 붙인 직후면 잠시 기다린다 |
| 컨테이너는 떴는데 바깥에서 안 됨 | 보안그룹 인바운드 80 (3번) |
| `/health`가 502·연결 거부 | `sudo docker logs kkume-server` |
