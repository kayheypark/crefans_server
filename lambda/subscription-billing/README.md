# Subscription Billing Lambda Function

AWS Lambda 함수로 구현된 자동 구독 결제 처리 시스템입니다.

## 기능

- 매일 자동으로 실행되어 정기결제가 예정된 구독들을 처리
- TossPayments API를 통한 자동 빌링 결제 실행
- 결제 실패시 자동 재시도 및 3회 실패시 구독 취소
- 결제 성공시 다음 결제일 자동 계산
- CloudWatch 로그를 통한 상세한 실행 기록

## 배포 방법

1. **의존성 설치 및 빌드**:
   ```bash
   cd /Users/ethan/repository/crefans_server/lambda/subscription-billing
   ./deploy.sh
   ```

2. **AWS Lambda Console에서 함수 생성**:
   - Function name: `crefans-subscription-billing`
   - Runtime: Node.js 20.x
   - Handler: `subscription-billing.handler`
   - Timeout: 15분 (900초)
   - Memory: 512MB

3. **환경 변수 설정**:
   ```
   DATABASE_URL=your_database_connection_string
   TOSSPAYMENTS_SECRET_KEY=your_tosspayments_secret_key
   TOSSPAYMENTS_API_URL=https://api.tosspayments.com
   ```

4. **CloudWatch Events 규칙 생성**:
   - Rule name: `subscription-billing-daily`
   - Schedule expression: `cron(0 9 * * ? *)` (매일 오전 9시 UTC)
   - Target: 생성한 Lambda 함수

## 실행 로직

1. **구독 조회**: `next_billing_date`가 현재 시간 이하이고 `auto_renew`가 true인 활성 구독들을 조회
2. **결제 실행**: TossPayments 빌링 API를 통해 자동결제 실행
3. **성공 처리**:
   - 결제 거래 기록 생성
   - 구독의 `next_billing_date` 업데이트
   - 실패 횟수 초기화
4. **실패 처리**:
   - `payment_failure_count` 증가
   - 3회 실패시 구독 상태를 `CANCELLED`로 변경

## 모니터링

CloudWatch Logs에서 다음과 같은 로그를 확인할 수 있습니다:

- `🚀 Starting subscription billing process` - 실행 시작
- `📋 Found X subscriptions to process` - 처리할 구독 수
- `💳 Processing subscription: {id}` - 개별 구독 처리 중
- `✅ Billing payment successful` - 결제 성공
- `❌ Billing payment failed` - 결제 실패
- `⚠️ Subscription cancelled due to payment failures` - 3회 실패로 구독 취소
- `🎉 Billing process completed` - 전체 프로세스 완료

## 주의사항

- Lambda 함수는 최대 15분까지 실행 가능하므로, 처리할 구독이 많은 경우 배치 처리를 고려해야 함
- TossPayments API 호출 제한을 고려하여 적절한 지연시간 추가 필요
- 데이터베이스 연결 풀링 및 연결 해제 관리 필요
- 민감한 정보(시크릿 키 등)는 AWS Secrets Manager 사용 권장