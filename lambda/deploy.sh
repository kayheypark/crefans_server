#!/bin/bash

# Lambda 함수 빌드 및 패키징 스크립트
# 사용법: ./deploy.sh

echo "🔨 Building Lambda function..."

# 기존 빌드 결과물 정리
rm -rf dist/
rm -f custom-message-lambda.zip

# TypeScript 컴파일
npx tsc

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi

echo "📦 Creating deployment package..."

# 배포 패키지 생성
cd dist
zip -r ../custom-message-lambda.zip .
cd ..

echo "✅ Deployment package created: custom-message-lambda.zip"
echo "📂 Package size: $(du -h custom-message-lambda.zip | cut -f1)"
echo ""
echo "🚀 Ready for manual upload to AWS Lambda Console!"
echo "   Function name: crefans-custom-message"
echo "   Handler: custom-message.handler"
echo "   Runtime: Node.js 20.x"