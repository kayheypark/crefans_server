# 🎬 Video Processing Lambda Function

> 문서 상태 (2026-10-08): 기존 AWS Lambda 실행 경로의 참고 자료다. 신규 플랫폼 런타임은 이 Lambda를 등록하지 않는다. 신규 worker와 동시에 정기결제를 실행하지 않는다. 현재 배포 기준은 [플랫폼 배포](../../infra/platform/README.md), 외부 계약은 [공급자 경계](../../docs/provider-contracts.md)다. 실 AWS 배포/호출 검증은 별도다.

S3에 업로드된 동영상 파일을 자동으로 감지하여 AWS MediaConvert로 다중 해상도 변환 처리를 수행하는 Lambda 함수입니다.

## 📋 기능

- **자동 트리거**: S3 업로드 이벤트 감지
- **동영상 변환**: MediaConvert를 통한 1080p, 720p, 480p 다중 해상도 생성
- **썸네일 생성**: 동영상의 여러 구간에서 썸네일 이미지 추출
- **상태 알림**: 처리 완료 시 백엔드 서버로 웹훅 전송
- **오류 처리**: 개별 파일 처리 실패 시 전체 배치 중단 방지

## 🏗️ 아키텍처

```
S3 Upload → Lambda Trigger → MediaConvert Job → S3 Processed → Webhook Notification
```

1. 사용자가 동영상을 S3 업로드 버킷에 업로드
2. S3 이벤트가 Lambda 함수 트리거
3. Lambda가 MediaConvert 작업 생성
4. MediaConvert가 다중 해상도 변환 및 썸네일 생성
5. 처리 완료 시 백엔드 서버에 웹훅 전송

## 🚀 설치 및 배포

### 1. 환경 설정

```bash
# 프로젝트 디렉토리로 이동
cd lambda/video-processing

# 환경변수 파일 생성
cp .env.example .env

# 환경변수 설정
nano .env
```

### 2. 필수 환경변수

```bash
# AWS 설정
AWS_REGION=ap-northeast-2

# S3 버킷
S3_UPLOAD_BUCKET=your-upload-bucket
S3_PROCESSED_BUCKET=your-processed-bucket

# MediaConvert 역할
MEDIACONVERT_ROLE_ARN=arn:aws:iam::123456789012:role/MediaConvertServiceRole

# 백엔드 웹훅 (선택사항)
BACKEND_WEBHOOK_URL=https://your-api.com/media/processing-webhook
```

### 3. IAM 역할 생성

#### MediaConvert 서비스 역할

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "mediaconvert.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

권한 정책:

- `AmazonS3FullAccess` (또는 특정 버킷 접근 권한)
- MediaConvert 접근 권한

#### Lambda 실행 역할

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

권한 정책:

- `AWSLambdaBasicExecutionRole`
- `AmazonS3ReadOnlyAccess`
- MediaConvert 및 IAM PassRole 권한

### 4. 배포 방법

#### 방법 1: AWS Console 배포 (권장)

```bash
# 환경변수 설정 후 빌드 스크립트 실행
./deploy.sh
```

이 스크립트는 다음을 수행합니다:

- 의존성 설치
- TypeScript 컴파일
- 배포 패키지 생성 (`deployment.zip`)

#### AWS Console에서 수동 배포

1. **Lambda 함수 생성**

   - AWS Console → Lambda → Functions → Create function
   - Function name: `crefans-video-processing`
   - Runtime: Node.js 20.x
   - Architecture: x86_64

2. **코드 업로드**

   - 생성된 `deployment.zip` 파일 업로드
   - Handler: `dist/index.handler`

3. **환경변수 설정**

   - Configuration → Environment variables
   - 다음 변수들 추가:
     ```
     AWS_REGION=ap-northeast-2
     MEDIACONVERT_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT:role/MediaConvertRole
     S3_PROCESSED_BUCKET=your-processed-bucket
     BACKEND_WEBHOOK_URL=https://your-api.com/webhook/video-processed
     ```

4. **IAM 역할 설정**
   - Configuration → Permissions
   - Lambda 실행 역할에 다음 권한 추가:
     - `AWSLambdaBasicExecutionRole`
     - `AmazonS3ReadOnlyAccess`
     - MediaConvert 및 IAM PassRole 권한

#### 방법 2: AWS CLI (고급 사용자)

```bash
# AWS CLI로 직접 배포
aws lambda create-function \
  --function-name crefans-video-processing \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler dist/index.handler \
  --zip-file fileb://deployment.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment Variables='{AWS_REGION=ap-northeast-2,MEDIACONVERT_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT:role/MediaConvertRole,S3_PROCESSED_BUCKET=your-processed-bucket}'
```

## ⚙️ 설정

### S3 이벤트 트리거 설정

AWS Console → S3 → 업로드 버킷 → Properties → Event notifications:

- **이벤트 타입**: ObjectCreated (All)
- **프리픽스**: `uploads/`
- **서픽스**: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`
- **대상**: Lambda function

### MediaConvert CloudWatch Events (선택사항)

작업 완료/실패 알림을 위한 EventBridge 규칙:

```json
{
  "source": ["aws.mediaconvert"],
  "detail-type": ["MediaConvert Job State Change"],
  "detail": {
    "status": ["COMPLETE", "ERROR"]
  }
}
```

## 🔄 파일 처리 플로우

### 입력 파일 구조

```
s3://upload-bucket/uploads/{userSub}/{uuid}.{extension}
```

### 출력 파일 구조

```
s3://processed-bucket/processed/{userSub}/{mediaId}/
├── {mediaId}_1080p.mp4
├── {mediaId}_720p.mp4
├── {mediaId}_480p.mp4
└── thumbnails/
    ├── {mediaId}_thumbnail.00000.jpg
    ├── {mediaId}_thumbnail.00001.jpg
    ├── {mediaId}_thumbnail.00002.jpg
    ├── {mediaId}_thumbnail.00003.jpg
    └── {mediaId}_thumbnail.00004.jpg
```

## 📊 모니터링

### CloudWatch 로그

- 로그 그룹: `/aws/lambda/crefans-video-processing`
- 각 실행의 상세 로그 확인 가능

### 주요 메트릭

- **Duration**: 함수 실행 시간
- **Errors**: 오류 발생 횟수
- **Invocations**: 호출 횟수
- **Throttles**: 동시 실행 제한 도달 횟수

### 알람 설정 권장사항

```bash
# 오류율 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "lambda-video-processing-errors" \
  --alarm-description "High error rate in video processing" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

## 🐛 문제 해결

### 일반적인 오류

1. **MediaConvert 역할 권한 부족**

   ```
   ForbiddenException: The service does not have permission to assume the IAM role
   ```

   → MediaConvert 서비스 역할의 신뢰 관계 및 권한 확인

2. **S3 접근 권한 부족**

   ```
   AccessDenied: Access Denied
   ```

   → Lambda 실행 역할의 S3 권한 확인

3. **메모리 부족**
   ```
   Process exited before completing request
   ```
   → Lambda 메모리 크기 증가 (512MB 이상 권장)

### 디버깅

```bash
# CloudWatch 로그 실시간 모니터링
aws logs tail /aws/lambda/crefans-video-processing --follow

# 특정 시간대 로그 조회
aws logs filter-log-events \
  --log-group-name /aws/lambda/crefans-video-processing \
  --start-time 1609459200000
```

## 🔧 개발

### 로컬 테스트

```bash
# S3 이벤트 시뮬레이션
npm run test-local

# 또는 Node.js로 직접 테스트
node -e "
const { handler } = require('./dist/index');
const testEvent = { /* S3 이벤트 구조 */ };
handler(testEvent, {}).then(console.log);
"
```

### 코드 구조

```
src/
├── index.ts                 # Lambda 엔트리 포인트
├── mediaconvert-service.ts  # MediaConvert 작업 관리
└── webhook-service.ts       # 백엔드 알림 서비스
```

### 확장 가능한 설정

필요에 따라 `mediaconvert-service.ts`에서 출력 설정을 수정:

- 해상도 변경
- 비트레이트 조정
- 코덱 설정
- 썸네일 개수 조정

## 📝 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다.

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request

## 📞 지원

문제가 있거나 문의사항이 있으시면 이슈를 생성해주세요.
