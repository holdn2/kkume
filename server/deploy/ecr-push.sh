#!/usr/bin/env bash
# 로컬에서 이미지를 빌드해 ECR로 올린다.
#
# EC2에서 직접 빌드하지 않는 이유: Gradle 빌드가 t3.small(2GB)의 메모리를
# 거의 다 쓴다. 빌드는 로컬에서 하고 EC2는 pull만 하게 둔다.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env 가 없다. .env.example 을 복사해서 채운다." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

: "${AWS_REGION:?}" "${ECR_REPO:?}" "${AWS_ACCOUNT_ID:?}"

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TAG="$(git rev-parse --short HEAD)"

echo "== 빌드: ${ECR_REPO}:${TAG}"
# 서버 프로젝트 루트가 빌드 컨텍스트다
docker build -t "${ECR_REPO}:${TAG}" ..

echo "== ECR 로그인: ${REGISTRY}"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

echo "== 태그와 push"
# 커밋 해시 태그는 어떤 코드가 떠 있는지 되짚기 위한 것이고,
# latest 는 EC2 쪽 스크립트가 고정으로 참조하는 이름이다.
for t in "${TAG}" latest; do
  docker tag "${ECR_REPO}:${TAG}" "${REGISTRY}/${ECR_REPO}:${t}"
  docker push "${REGISTRY}/${ECR_REPO}:${t}"
done

echo "== 완료: ${REGISTRY}/${ECR_REPO}:${TAG}"
