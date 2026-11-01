# 백업·감시·방어 적용 절차 (2026-10-29 준비, 운영 미적용)

보안 점검(`crefans_front/docs/security-review-20261029.md`)의 OPS-01·OPS-02·OPS-04·INF-01·INF-02 중 AWS 설정이 필요한 부분이다. 2026-10-29 사업자 결정은 "스크립트·절차만 준비, 실제 AWS 적용은 별도 승인"이다. 아래 명령은 승인 전에 실행하지 않는다.

비용은 적용 승인 시점의 AWS 가격표로 다시 확인한다. 이 문서의 비용 메모는 규모 감각용이며 확정 금액이 아니다.

## 결정이 필요한 값

| 항목 | 제안 | 결정 주체 |
|---|---|---|
| 백업 리전 | 서울 `ap-northeast-2`(2026-10-29 /pilot-work 결정: 로그·DB 백업 모두 서울, 오사카 계획 폐기. 서울 리전 장애 대비는 별도 결정) | 사업자 |
| DB 백업 주기·보관 | 매일 1회, 35일 보관(버전 포함) → 허용 손실(RPO) 최대 약 24시간 | 사업자 |
| EBS 스냅샷 | 매일 1회, 7개 보관(DLM) | 사업자 |
| 미디어 S3 이전 버전 | 30일 보관 후 삭제 | 사업자 |
| 경보 수신 | 이메일 1개 + 기존 Telegram | 사업자 |
| WAF | 관리형 공통 규칙과 IP 요청량 규칙을 **COUNT 모드**로 2주 관찰 후 BLOCK 전환 여부 결정 | 사업자 |

## 1. 서버 밖 DB 백업 (OPS-01)

1. 백업 버킷 생성: 퍼블릭 차단, 기본 암호화 SSE-KMS(AWS 관리 키), 버전 관리, 수명주기(현재·이전 버전 35일 후 삭제).
   ```bash
   aws s3api create-bucket --bucket crefans-backup-<계정ID> --region ap-northeast-2 --create-bucket-configuration LocationConstraint=ap-northeast-2
   aws s3api put-public-access-block --bucket crefans-backup-<계정ID> --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-encryption --bucket crefans-backup-<계정ID> --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
   aws s3api put-bucket-versioning --bucket crefans-backup-<계정ID> --versioning-configuration Status=Enabled
   ```
2. EC2 역할에 `db/` 접두사 `s3:PutObject`만 허용한다. 삭제·목록 권한은 주지 않는다. 호스트가 침해돼도 과거 백업을 지울 수 없게 하려는 것이다.
3. EC2에 `/etc/crefans-backup.env`(`BACKUP_BUCKET`, `BACKUP_REGION`, 권한 600)를 만들고 `infra/platform/backup-offsite.sh`를 `/opt/crefans/`에 둔다. systemd timer로 매일 실행한다(기존 `crefans-monitor.timer`와 같은 형식).
4. 실패 감지: 스크립트는 성공 시 `backup_offsite_completed` JSON을 남긴다. 아래 3절의 경보에 "최근 26시간 내 새 객체 없음" 검사를 추가한다.
5. 비밀값(`DATA_ENCRYPTION_KEY`, `LOCAL_AUTH_SECRET`, CI HMAC 키)은 DB 백업과 같은 곳에 두지 않는다. 사업자 비밀 보관소(1Password 등) 또는 SSM Parameter Store SecureString에 따로 보관한다. 이 키가 없으면 복원한 DB의 암호화 값과 세션 검증이 쓸모없다.

## 2. 복원 리허설 (OPS-01)

- `infra/platform/restore-rehearsal.sh <dump> [sha256파일]`: 임시 MySQL 컨테이너에 복원한다. 마이그레이션·콩 원장 균형·음수 잔액·수익 참조를 검사하고, 소요 시간과 마지막 기록 시각을 JSON 한 줄로 낸다. 운영 DB에는 연결하지 않는다.
- 분기마다 1회 실행한다. 1절 버킷의 최신 백업을 별도 PC 또는 임시 인스턴스로 내려받아 돌린다. 결과 JSON을 `docs/audit/`에 보관한다.
- 측정한 `loadSeconds`(복구 시간)와 `latestRecord`(데이터 손실 범위)가 RTO/RPO의 실측 근거다. 미디어 S3와 비밀값 복구는 별도로 확인한다.

## 3. 서버 밖 감시 (OPS-02)

- 앱 안 감시(이번 코드 변경, `OPERATIONS_WATCHDOG_ENABLED=true`): worker heartbeat 5분, 결제·환불·콩 충전 처리 30분 초과, Telegram 미전송 15분 초과, 광고 메일 결과 불명, 요청 로그 정리 지연. 같은 이벤트는 1시간에 1회만 보낸다.
- worker 정체: tick이 15분(`WORKER_STALL_MINUTES`)을 넘으면 기록 후 종료하고, `restart: unless-stopped`가 재시작한다.
- API 컨테이너 healthcheck(`/api/v1/health`, DB 왕복 포함)를 compose에 추가했다.
- 같은 서버·DB·Telegram이 모두 멈추는 경우는 앱 감시로 알 수 없다. AWS 쪽에 다음을 만든다.
  1. Route 53 health check: `https://beta.crefans.com/api/v1/health` HTTPS, 30초 간격, 실패 3회.
  2. CloudWatch 경보(us-east-1, Route 53 지표) → SNS 이메일 구독.
  3. EC2 `StatusCheckFailed_System` 경보 → 자동 recover 동작 + SNS.
  4. 기존 `crefans-monitor.service`(외부 가용성 감시)는 EC2가 아닌 다른 호스트에 설치해야 의미가 있다.

## 4. 감사 기록 서버 밖 보관 (OPS-04)

- 보관기간은 `AUDIT_RETENTION_DAYS=730`(2026-10-29 결정, 근거는 `docs/operational-logging.md`)이다.
- CloudTrail: 다중 리전 trail 1개를 1절 백업 버킷의 `cloudtrail/` 접두사(버킷 정책으로 CloudTrail 쓰기만 허용)로 설정한다. 관리 이벤트만 기록한다.
- 앱 감사 로그의 외부 반출은 기존 `compose.cloudwatch.yml`(별도 로그 그룹, 보관 730일)을 적용하는 방식이다. 개인정보 마스킹은 앱에서 이미 수행한다.

## 5. 미디어 삭제 복구 (INF-01)

```bash
aws s3api put-bucket-versioning --bucket <미디어버킷> --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket <미디어버킷> --lifecycle-configuration '{"Rules":[{"ID":"noncurrent-30d","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}]}'
```

- 버전 관리를 켜면 덮어쓰기·삭제가 이전 버전으로 남는다. 앱의 `MEDIA_DELETE_ENABLED` 정책은 바뀌지 않는다. 복원 리허설에서 객체 1개를 삭제하고 이전 버전을 되살려 본다.

## 6. WAF 규칙 (INF-02)

- CloudFront용 Web ACL(us-east-1)에 다음 두 규칙을 **COUNT**로 추가한다.
  - `AWSManagedRulesCommonRuleSet`
  - IP 요청량 규칙(5분 2,000회)
- 2주간 `/api/v1/*` 오탐을 확인한 뒤 BLOCK 전환을 결정한다. 결제 콜백(`/api/v1/identity/callback`, 토스 웹훅) 경로는 본문 크기 규칙에서 제외한다.
- 애플리케이션의 매개변수 바인딩·권한 검사가 근본 방어다. WAF는 보조 수단이다. 현재 크레팬스의 자동 차단 정책(첫 탐지 403, 10분 내 2회면 24시간 IP 차단)은 바꾸지 않는다.

## 7. 모든 도메인을 CloudFront+WAF 뒤로 옮길 때 예상 비용 (2026-10-29 조사, 보류)

**상태: 사업자 보류(2026-10-29).** "문서로 저장하고 나중에 진행"이라는 결정이다. 안을 선택하기 전에는 AWS를 변경하지 않는다.

용어 정리:
- **AWS WAF:** 요청 내용(경로·쿼리·헤더·본문·빈도)을 검사하는 웹 방화벽 서비스다.
- **Web ACL:** WAF의 규칙 묶음이다. CloudFront 같은 리소스에 연결해야 동작하며, 규칙에 걸리지 않으면 기본 동작을 따른다.
- **VPC 네트워크 ACL·보안 그룹:** IP·포트만 보는 별개의 방화벽이다. WAF가 아니다.

현재 상태(AWS CLI 읽기 전용 조회, 2026-10-29):
- beta.crefans.com만 CloudFront(E2VCS3MVSGXSRC)를 거친다. Web ACL `crefans-beta-private-media-v1`은 규칙 0개, 기본 허용이다. ACL 설명상 CloudFront 정액제 Free 요금제로 보이며, 콘솔에서 확인이 필요하다.
- admin·guide·business·beta-origin은 EC2로 직접 연결된다.
- 최근 30일 beta 배포: 요청 110,520건, 전송 15.3GB, WAF 통과 109,172건. CloudFront 비용은 약 0.07달러다.

근거:
- [CloudFront 정액제 문서](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
  - 요금제는 배포 1개, apex 도메인 1개 단위다. 계정당 Free는 3개까지다.
  - 월 기준량: Free 1M 요청·100GB, Pro 10M 요청·50TB.
  - WAF 규칙 수: Free 5개, Pro 25개. WAF 로그와 접근 로그, SQL·PHP 보호 규칙은 Pro부터다.
  - 초과 요금이 없고, WAF가 차단한 요청은 사용량에 포함되지 않는다.
- [AWS 블로그](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-flat-rate-pricing-plans-new-features-and-expanded-capabilities): Free 0, Pro 15, Business 200, Premium 1,000달러/월.
- [WAF 종량제](https://aws.amazon.com/waf/pricing/): Web ACL 5달러/월, 규칙·관리형 규칙 그룹 각 1달러/월, 요청 100만 건당 0.6달러.

| 안 | 구성 | 월 예상 |
|---|---|---|
| A. 전부 정액제 Free | beta(기존 Free)·admin·guide = Free 3개. business는 WAF 없는 종량제 배포(무료 사용량 안) | 약 0달러. 로그 없음, 규칙 5개 |
| B. beta만 Pro(권장) | beta Pro, admin·guide·business Free 3개 | 15달러. beta에 WAF 로그·25개 규칙·SQL 보호 |
| C. 전부 종량제 | Web ACL 1개를 4개 배포가 공유, 관리형 공통 규칙+IP 요청량 규칙 | 약 7~8달러(5+1+1+요청 0.07). CloudFront는 상시 무료 사용량 안. 기존 Free 해지 필요 |

공통 사항:
- ACM 인증서, Route 53 ALIAS 변경, EC2→CloudFront 전송은 추가 비용이 없다.
- 원본 우회 차단 방식:
  - 보안 그룹을 CloudFront 전용 대역으로 좁히면 Caddy의 Let's Encrypt 갱신(HTTP/TLS 검증)이 막힌다. 그래서 CloudFront가 붙이는 비밀 원본 헤더를 Caddy에서 검사하는 방식을 우선한다.
  - DNS 검증으로 바꾸면 Caddy 이미지 교체가 필요하다.
- 트래픽이 지금의 10배여도 Free 기준량 안이다. 규칙은 COUNT 모드로 2주 관찰한 뒤 BLOCK을 결정한다.

재개할 때 순서:
1. 콘솔에서 beta 배포의 현재 요금제(Free 여부)를 확인한다.
2. A·B·C 중 하나를 선택하고, 그 시점의 가격표를 다시 확인한다.
3. admin·guide·business용 배포를 만든다(ACM 인증서, 원본 `beta-origin`, Host 전달 정책).
4. 원본 비밀 헤더를 CloudFront에 넣고, Caddy가 이를 검사하게 한다(ACME 경로는 제외).
5. Web ACL에 관리형 공통 규칙과 IP 요청량 규칙을 COUNT로 넣는다.
6. Route 53 레코드를 ALIAS로 전환한다.
7. 2주 관찰 후 BLOCK 전환을 결정한다. 각 단계마다 이전 상태로 되돌리는 방법(DNS 원복)을 기록한다.

