#!/bin/bash
# EC2 최초 부팅 때 한 번 실행된다 (run-instances 의 --user-data).
# 로그는 인스턴스의 /var/log/cloud-init-output.log 에 남는다.
set -eux

dnf update -y
dnf install -y docker

systemctl enable --now docker
usermod -aG docker ec2-user

# 스왑 2GB. t3.micro는 메모리가 1GiB뿐이라 JVM과 docker build/pull이 겹치는
# 순간 커널이 프로세스를 죽인다. 스왑이 있으면 느려질 뿐 죽지는 않는다.
# 이미 있으면 아무 일도 하지 않는다.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ec2-run.sh 가 ECR 로그인에 쓴다. AMI에 이미 있으면 아무 일도 하지 않는다.
command -v aws >/dev/null 2>&1 || dnf install -y awscli
