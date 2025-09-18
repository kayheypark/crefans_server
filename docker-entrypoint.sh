#!/bin/sh

echo "🔄 Starting Docker container..."

# 데이터베이스가 준비될 때까지 대기
echo "⏳ Waiting for database to be ready..."
npx wait-port database:3306 -t 30000

# Prisma 마이그레이션 실행
echo "🔧 Running Prisma migrations..."
npx prisma migrate dev --name "auto-migration-$(date +%Y%m%d%H%M%S)"

# Prisma 클라이언트 재생성
echo "⚡ Generating Prisma client..."
npx prisma generate

echo "🚀 Starting development server..."
exec "$@"