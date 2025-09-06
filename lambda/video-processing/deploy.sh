#!/bin/bash

# Lambda 함수 배포 스크립트
set -e

echo "🚀 Starting Lambda deployment..."

# .env 파일 로드
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  .env file not found. Using system environment variables."
fi

# 환경변수 확인
if [ -z "$S3_UPLOAD_BUCKET" ] || [ -z "$S3_PROCESSED_BUCKET" ] || [ -z "$MEDIACONVERT_ROLE_ARN" ]; then
    echo "❌ Required environment variables are missing:"
    echo "   - S3_UPLOAD_BUCKET"
    echo "   - S3_PROCESSED_BUCKET" 
    echo "   - MEDIACONVERT_ROLE_ARN"
    echo ""
    echo "Please set them in your environment or .env file"
    exit 1
fi

echo "✅ Environment variables validated"

# 의존성 설치
echo "📦 Installing dependencies..."
npm install

# TypeScript 컴파일
echo "🔨 Building TypeScript..."
npm run build

# 배포 패키지 생성
echo "🏗️  Creating deployment package..."

# 기존 패키지 정리
rm -f deployment.zip

# 배포 패키지 생성
zip -r deployment.zip dist node_modules package.json package-lock.json

echo "📦 Deployment package created: deployment.zip"
echo "📏 Package size: $(du -h deployment.zip | cut -f1)"

echo "✅ Build completed successfully!"
echo ""
echo "🔗 Next steps for AWS Console deployment:"
echo "   1. Go to AWS Lambda Console"
echo "   2. Create new function or update existing function"
echo "   3. Upload deployment.zip file"
echo "   4. Set environment variables:"
echo "      - AWS_REGION: ap-northeast-2"
echo "      - MEDIACONVERT_ROLE_ARN: $MEDIACONVERT_ROLE_ARN"
echo "      - S3_PROCESSED_BUCKET: $S3_PROCESSED_BUCKET"
echo "      - BACKEND_WEBHOOK_URL: ${BACKEND_WEBHOOK_URL:-}"
echo "   5. Configure S3 trigger:"
echo "      - Go to S3 → $S3_UPLOAD_BUCKET → Properties → Event notifications"
echo "      - Create notification for ObjectCreated events"
echo "      - Set prefix filter: uploads/"
echo "      - Set suffix filter: .mp4,.mov,.avi,.mkv,.webm"
echo "      - Set destination: Lambda function"
echo "   6. Test by uploading a video file to S3"
echo "   7. Monitor CloudWatch logs for execution details"