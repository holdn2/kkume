#!/bin/bash
# EC2 최초 부팅 때 한 번 실행된다 (run-instances 의 --user-data).
# 로그는 인스턴스의 /var/log/cloud-init-output.log 에 남는다.
set -eux

dnf update -y
dnf install -y docker

systemctl enable --now docker
usermod -aG docker ec2-user

# ec2-run.sh 가 ECR 로그인에 쓴다. AMI에 이미 있으면 아무 일도 하지 않는다.
command -v aws >/dev/null 2>&1 || dnf install -y awscli
