#!/bin/bash

# Lambda 배포용 ZIP 파일 생성 스크립트
# Usage: ./make-zip.sh [filename]

set -e  # 에러 발생시 스크립트 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 파일명 설정 (인수가 있으면 사용, 없으면 기본값)
ZIP_NAME=${1:-"development.zip"}

echo -e "${BLUE}🚀 Lambda 배포 패키지 생성 시작${NC}"
echo -e "${YELLOW}📦 생성할 파일: ${ZIP_NAME}${NC}"

# 기존 ZIP 파일 삭제
if [ -f "$ZIP_NAME" ]; then
    echo -e "${YELLOW}🗑️  기존 파일 삭제: ${ZIP_NAME}${NC}"
    rm -f "$ZIP_NAME"
fi

# TypeScript 빌드
echo -e "${BLUE}🔨 TypeScript 빌드 중...${NC}"
npm run build

# ZIP 파일 생성
echo -e "${BLUE}📦 ZIP 파일 압축 중...${NC}"
zip -r "$ZIP_NAME" dist node_modules package.json src tsconfig.json > /dev/null

# 결과 확인
if [ -f "$ZIP_NAME" ]; then
    FILE_SIZE=$(ls -lh "$ZIP_NAME" | awk '{print $5}')
    echo -e "${GREEN}✅ 배포 패키지 생성 완료!${NC}"
    echo -e "${GREEN}📁 파일명: ${ZIP_NAME}${NC}"
    echo -e "${GREEN}📏 파일크기: ${FILE_SIZE}${NC}"
    echo ""
    echo -e "${BLUE}🚀 AWS Lambda 배포 명령어:${NC}"
    echo -e "${YELLOW}aws lambda update-function-code --function-name [함수명] --zip-file fileb://${ZIP_NAME}${NC}"
else
    echo -e "${RED}❌ ZIP 파일 생성 실패${NC}"
    exit 1
fi