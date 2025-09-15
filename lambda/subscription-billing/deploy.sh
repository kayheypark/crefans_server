#!/bin/bash

# Lambda 함수 빌드 및 패키징 스크립트
# 사용법: ./deploy.sh

echo "🔨 Building Subscription Billing Lambda function..."

# 기존 빌드 결과물 정리
rm -rf dist/
rm -f subscription-billing-lambda.zip
rm -rf node_modules/

echo "📦 Installing dependencies..."
npm install

# TypeScript 컴파일
echo "🔧 Compiling TypeScript..."
npx tsc

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi

echo "📦 Creating deployment package..."

# Prisma 클라이언트 생성
echo "🔍 Generating Prisma client..."
npx prisma generate

# 배포 패키지 생성 (Lambda 환경에 맞게)
zip -r subscription-billing-lambda.zip subscription-billing.js node_modules/ prisma/

echo "✅ Deployment package created: subscription-billing-lambda.zip"
echo "📂 Package size: $(du -h subscription-billing-lambda.zip | cut -f1)"
echo ""
echo "🚀 Ready for manual upload to AWS Lambda Console!"
echo "   Function name: crefans-subscription-billing"
echo "   Handler: subscription-billing.handler"
echo "   Runtime: Node.js 20.x"
echo "   Timeout: 15 minutes (900 seconds)"
echo "   Memory: 512 MB"
echo ""
echo "📋 Required Environment Variables:"
echo "   DATABASE_URL - Your database connection string"
echo "   TOSSPAYMENTS_SECRET_KEY - TossPayments secret key"
echo "   TOSSPAYMENTS_API_URL - https://api.tosspayments.com"
echo ""
echo "⏰ Suggested CloudWatch Events Schedule:"
echo "   Schedule expression: rate(1 day) or cron(0 9 * * ? *)"
echo "   Description: Daily subscription billing at 9 AM UTC"