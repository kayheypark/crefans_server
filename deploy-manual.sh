#!/bin/bash

# 수동 배포 스크립트
# GitHub Actions와 동일한 배포 과정을 로컬에서 실행

echo "=== 수동 배포 시작 ==="

# SSH 설정 확인
if [ -z "$SSH_HOST" ] || [ -z "$SSH_USERNAME" ] || [ -z "$SSH_PRIVATE_KEY_PATH" ]; then
    echo "❌ SSH 환경변수를 설정해주세요:"
    echo "export SSH_HOST='your-ec2-ip'"
    echo "export SSH_USERNAME='ubuntu'"
    echo "export SSH_PRIVATE_KEY_PATH='/path/to/your/key.pem'"
    exit 1
fi

# 1. 소스 코드 업로드 (scp)
echo "=== 1. 소스 코드 업로드 ==="
scp -i "$SSH_PRIVATE_KEY_PATH" -r \
    src/ package.json package-lock.json prisma/ tsconfig.json \
    "$SSH_USERNAME@$SSH_HOST:~/crefans/"

if [ $? -ne 0 ]; then
    echo "❌ 소스 코드 업로드 실패"
    exit 1
fi

echo "✅ 소스 코드 업로드 완료"

# 2. EC2에서 빌드 및 배포 (ssh)
echo "=== 2. EC2에서 빌드 및 배포 ==="
ssh -i "$SSH_PRIVATE_KEY_PATH" "$SSH_USERNAME@$SSH_HOST" << 'EOL'
    echo "=== EC2에서 빌드 및 배포 시작 ==="
    cd ~/crefans

    # 환경변수는 이미 서버에 있다고 가정
    # 만약 없다면: echo "ENV_CONTENT" > .env

    # 의존성 설치
    echo "=== 의존성 설치 ==="
    npm ci

    # TypeScript 빌드
    echo "=== TypeScript 빌드 ==="
    npm run build

    # 빌드 결과 확인
    echo "=== 빌드 결과 확인 ==="
    if [ ! -f "dist/src/main.js" ]; then
      echo "❌ 빌드 실패: dist/src/main.js 파일이 없습니다!"
      exit 1
    fi

    echo "✅ 빌드 성공"
    echo "빌드된 파일:"
    ls -la dist/src/

    # Prisma 설정
    echo "=== Prisma 설정 ==="
    npx prisma generate
    npx prisma migrate deploy

    # 기존 프로세스 중지
    echo "=== 기존 프로세스 중지 ==="
    pm2 stop crefans-server || echo "기존 프로세스가 없습니다."
    pm2 delete crefans-server || echo "기존 프로세스가 없습니다."

    # 새 프로세스 시작
    echo "=== 새 프로세스 시작 ==="
    pm2 start dist/src/main.js --name crefans-server

    # 프로세스 상태 확인
    echo "=== 프로세스 상태 확인 ==="
    pm2 status

    echo "=== 배포 완료 ==="
EOL

if [ $? -ne 0 ]; then
    echo "❌ EC2 배포 실패"
    exit 1
fi

echo "✅ 수동 배포 완료!"