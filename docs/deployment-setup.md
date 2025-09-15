# Deployment & Setup Guide

이 문서는 crefans_server의 배포 및 설정 방법을 설명합니다.

## 시스템 요구사항

### 필수 소프트웨어
- **Node.js**: 18.x 이상
- **npm**: 9.x 이상
- **MySQL**: 8.0 이상
- **AWS CLI**: 2.x (AWS 서비스 사용 시)

### AWS 서비스 의존성
- **AWS Cognito**: 사용자 인증
- **Amazon S3**: 파일 저장소
- **AWS MediaConvert**: 비디오 처리
- **Amazon RDS**: 데이터베이스 (MySQL)

## 환경 설정

### 1. 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 다음 값들을 설정합니다:

```bash
# 환경 파일 복사
cp .env.example .env
```

#### AWS Cognito 설정
```env
AWS_ACCOUNT_ID=123456789012
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
COGNITO_USER_POOL_ID=ap-northeast-2_xxxxxxxxx
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
```

#### 데이터베이스 설정
```env
DB_KIND=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_DATABASE=crefans_server
DATABASE_URL="mysql://username:password@localhost:3306/crefans_server"
```

#### 서버 설정
```env
PORT=3000
NODE_ENV=development  # development, production
API_BASE_URL=http://localhost:3000
```

#### S3 설정
```env
S3_UPLOAD_BUCKET=crefans-uploads
S3_PROCESSED_BUCKET=crefans-processed
```

#### MediaConvert 설정
```env
MEDIACONVERT_ENDPOINT=https://xxxxxxxxx.mediaconvert.ap-northeast-2.amazonaws.com
MEDIACONVERT_ROLE_ARN=arn:aws:iam::123456789012:role/MediaConvertRole
```

#### TossPayments 설정
```env
TOSSPAYMENTS_CLIENT_KEY=test_ck_xxxxxxxxx
TOSSPAYMENTS_SECRET_KEY=test_sk_xxxxxxxxx
TOSSPAYMENTS_API_URL=https://api.tosspayments.com
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 데이터베이스 설정

#### Prisma 설정
```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션
npx prisma migrate dev

# 시드 데이터 삽입
npx prisma db seed
```

#### 마이그레이션 명령어
```bash
# 새로운 마이그레이션 생성
npx prisma migrate dev --name migration-name

# 프로덕션 마이그레이션 적용
npx prisma migrate deploy

# 데이터베이스 초기화 (개발 환경만)
npx prisma migrate reset
```

## 개발 환경 실행

### 1. 개발 서버 시작
```bash
npm run dev
```

### 2. 빌드 및 실행
```bash
# 빌드
npm run build

# 프로덕션 실행
npm start
```

### 3. 데이터베이스 관리
```bash
# Prisma Studio 실행 (GUI 관리 도구)
npx prisma studio
```

## 프로덕션 배포

### 1. AWS EC2 배포

#### EC2 인스턴스 설정
```bash
# Ubuntu 22.04 LTS 기준
sudo apt update
sudo apt install nodejs npm mysql-client

# Node.js 18.x 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 설치 (프로세스 관리자)
sudo npm install -g pm2
```

#### 애플리케이션 배포
```bash
# 소스 코드 클론
git clone https://github.com/your-repo/crefans_server.git
cd crefans_server

# 의존성 설치
npm ci

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# Prisma 설정
npx prisma generate
npx prisma migrate deploy

# 빌드
npm run build

# PM2로 실행
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### PM2 설정 파일 (ecosystem.config.js)
```javascript
module.exports = {
  apps: [{
    name: 'crefans-server',
    script: 'dist/src/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

### 2. Docker 배포

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./
COPY prisma ./prisma/

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# Prisma 클라이언트 생성
RUN npx prisma generate

# 빌드
RUN npm run build

# 포트 노출
EXPOSE 3000

# 실행
CMD ["npm", "start"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://root:password@db:3306/crefans_server
    depends_on:
      - db

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: crefans_server
    volumes:
      - db_data:/var/lib/mysql
    ports:
      - "3306:3306"

volumes:
  db_data:
```

## AWS 서비스 설정

### 1. AWS Cognito 설정

#### User Pool 생성
```bash
# AWS CLI를 통한 User Pool 생성
aws cognito-idp create-user-pool \
  --pool-name crefans-users \
  --region ap-northeast-2
```

### 2. S3 버킷 설정

#### 버킷 생성 및 권한 설정
```bash
# S3 버킷 생성
aws s3 mb s3://crefans-uploads --region ap-northeast-2
aws s3 mb s3://crefans-processed --region ap-northeast-2

# CORS 설정
aws s3api put-bucket-cors \
  --bucket crefans-uploads \
  --cors-configuration file://cors.json
```

#### CORS 설정 파일 (cors.json)
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["https://crefans.com", "https://admin.crefans.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

### 3. RDS 설정

#### MySQL 인스턴스 생성
```bash
aws rds create-db-instance \
  --db-instance-identifier crefans-db \
  --db-instance-class db.t3.micro \
  --engine mysql \
  --master-username admin \
  --master-user-password your-password \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxxxxxx
```

## 모니터링 및 로깅

### 1. 로그 관리
```bash
# PM2 로그 확인
pm2 logs

# 로그 파일 위치
tail -f logs/combined.log
```

### 2. 헬스체크
```bash
# 서버 상태 확인
curl http://localhost:3000/health

# 데이터베이스 연결 확인
curl http://localhost:3000/health/db
```

## 보안 설정

### 1. 방화벽 설정
```bash
# Ubuntu UFW 설정
sudo ufw allow 22    # SSH
sudo ufw allow 3000  # 애플리케이션 포트
sudo ufw enable
```

### 2. SSL/TLS 설정
```bash
# Let's Encrypt 인증서 설치
sudo apt install certbot
sudo certbot --nginx -d api.crefans.com
```

### 3. 환경 변수 보안
- 프로덕션 환경에서는 AWS Secrets Manager 사용 권장
- 민감한 정보는 환경 변수로만 관리
- `.env` 파일은 `.gitignore`에 추가

## 트러블슈팅

### 자주 발생하는 문제

#### 1. 데이터베이스 연결 오류
```bash
# 연결 테스트
npx prisma db pull
```

#### 2. 권한 오류
```bash
# AWS 자격 증명 확인
aws sts get-caller-identity
```

#### 3. 포트 충돌
```bash
# 포트 사용 확인
lsof -i :3000
```

## 성능 최적화

### 1. 데이터베이스 최적화
- 인덱스 최적화
- 쿼리 성능 모니터링
- 커넥션 풀 설정

### 2. 캐싱 전략
- Redis 도입 고려
- API 응답 캐싱
- 정적 파일 CDN 사용

### 3. 로드 밸런싱
- ALB(Application Load Balancer) 설정
- 다중 인스턴스 운영
- Auto Scaling 구성

## 백업 및 복구

### 1. 데이터베이스 백업
```bash
# 수동 백업
mysqldump -h hostname -u username -p database_name > backup.sql

# RDS 자동 백업 설정
aws rds modify-db-instance \
  --db-instance-identifier crefans-db \
  --backup-retention-period 7
```

### 2. 코드 백업
- Git을 통한 소스 코드 관리
- 정기적인 브랜치 백업
- 태그를 통한 릴리스 관리