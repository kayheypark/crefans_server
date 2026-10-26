# 운영 사고 추적 로그

확인일: 2026-10-22. 신규 platform 런타임과 독립 crefans_admin 콘솔 대상이다. 구현 전 조사표는 관리자 저장소 `docs/logging-inventory-20261022.json`, 이번 실행 증거는 [logging-implementation-20261022.json](./logging-implementation-20261022.json)이다. 이번 변경은 로컬 검증이며 운영 배포·CloudWatch 실제 수신·새 외부 모니터 실행은 아직 하지 않았다.

## 기록과 조회

| 구분 | 구현·근거 | 기록 범위 |
| --- | --- | --- |
| 독립 감사 원장 | [audit.ts](../src/platform/audit.ts), [migration](../prisma/migrations/20261022020000_audit_logs/migration.sql) | `platform_audit_logs`. outbox 삭제와 독립. 사업 변경과 감사 insert는 동일 트랜잭션. source_id로 중복 억제, MySQL 경합은 locking read로 확인 |
| 요청 | [security.service.ts](../src/platform/security.service.ts) | 성공·4xx·5xx·중단499, 시각·소요시간·라우트 템플릿·신뢰된 IP/peer·요청 ID·확인된 actor. 클라이언트 X-Request-ID 무시, 서버 생성 UUID를 응답 헤더에 반환 |
| 오류 | [operations.service.ts](../src/platform/operations.service.ts), [http.ts](../src/platform/http.ts) | 오류 종류·내부 코드·허용 소스 위치·fingerprint·APP_RELEASE. 진단 이벤트와 Telegram outbox 연결 이벤트를 각각 기록. 원문 예외 메시지·SQL·HTTP payload 제외 |
| 인증·권한 | [auth.service.ts](../src/platform/auth.service.ts), [platform-auth.guard.ts](../src/platform/platform-auth.guard.ts) | 로그인/갱신 성공·실패, 로그아웃, HTTP401/403. 확인되지 않은 로그인 입력을 actor로 신뢰하지 않음 |
| 관리자 | [admin.controller.ts](../src/platform/admin.controller.ts), [financial-policy.ts](../src/platform/financial-policy.ts) | 인증된 관리자 GET 접근, 문의·신고·문서·카테고리·광고·금융정책 변경. 안전한 상태 전후 값, 변경 필드명. 문서 제목·본문은 SHA-256만 남김 |
| 서비스 활동 | [operations-events.ts](../src/platform/operations-events.ts), [studio.service.ts](../src/platform/studio.service.ts), [service.ts](../src/platform/service.ts) | 가입·구독/갱신/해지·게시물 등록/수정/삭제·프로필 변경 기존 outbox를 독립 감사 원장에도 보존. 프로필 원문/이미지 URL 제외 |
| 금융 | [finance.service.ts](../src/platform/finance.service.ts), [payment-provider.ts](../src/platform/payment-provider.ts), [bank-provider.ts](../src/platform/bank-provider.ts) | 주문 생성·카드 등록 결과·환불 요청/완료·출금 요청/처리/결과와 공급사 호출 시도/응답/불확실 결과. 내부 대상 ID·금액·attemptId·공급사 상태/코드로 연결 |
| 메일 | [member-mail.service.ts](../src/auth/local/member-mail.service.ts) | 전송 시도/결과·목적·Message-ID·SMTP 상태코드·수신/거부 건수. SMTP 접수와 실제 받은편지함 도착은 다름 |
| 배치 | [jobs.service.ts](../src/platform/jobs.service.ts), [operations.service.ts](../src/platform/operations.service.ts) | 실행별 jobId와 requestId, 처리 건수·실패·소요시간. 기존 즉시 처리/실패 알림·무작업 1시간 요약 유지. API watchdog은 마지막 배치 실행이 5분 넘으면 시간당 중복 억제 알림 |
| 브라우저 | [client-errors.ts](../src/platform/client-errors.ts), [telemetry.controller.ts](../src/platform/telemetry.controller.ts) | 서비스/콘솔 전역 오류·unhandled rejection·React error boundary. 오류 종류·허용 정적 JS 위치만. 페이지당 5건/중복 억제, 서버 IP별10건/분. `client_reported`는 비신뢰 보고이며 직접 보안 차단/Telegram 발송을 유발하지 않음 |
| HTTP 프록시 | [Caddyfile](../infra/platform/Caddyfile) | access + runtime 오류 로그에서 query 포함 URI·요청 헤더/TLS 상세·응답 헤더 삭제. 응답 request_id·상태·시간·IP 유지 |
| 콘솔 | [admin-logs.ts](../src/platform/admin-logs.ts) | `/console/logs`, 활성 ADMIN/SUPER_ADMIN만 조회. KST 기간 최대366일, 분류/수준/IP/요청/행위자/대상/배치/이벤트명 정확일치. 20건 페이지, 상세 관련 타임라인 최근100건·발송 상태 |

감사 API에는 수정·삭제 기능이 없다. DB 관리자까지 막는 불변 저장소나 서명된 감사 체인은 아니다. IP·회원 ID도 개인정보에 해당할 수 있으므로 접근은 관리자 권한으로 제한한다. 외부 공급사 원문·이메일·비밀번호·인증코드·세션/빌링/결제 키·카드/계좌번호·본문·query는 허용 목록에서 제외한다. 결제 전후 공급사 관찰 로그 저장 실패가 이미 성공한 승인을 재시도하게 만들지 않도록 best effort로 분리한다. 사업 트랜잭션 내 필수 감사 저장 실패는 해당 DB 변경과 outbox를 롤백한다. 이미 완료된 외부 결제는 기존 재조회/대사 경로로 회복한다.

API 응답 envelope는 기존 4개 필드를 유지한다. 요청 ID는 `X-Request-ID` 헤더이며, 콘솔 오류와 서비스 5xx 안내에도 표시된다. 로컬 서비스 프록시도 이 응답 헤더를 전달한다. CORS exposedHeaders에 추가했다. 브라우저 소스맵 공개는 켜지 않으며 브라우저 위치는 배포 JS 청크 위치다. API/worker는 `--enable-source-maps`, `APP_RELEASE`로 코드 위치를 확인한다. 모든 종류의 런타임 오류를 완전하게 포착한다는 뜻은 아니다.

## 보관·장애 경계

- `ACCESS_LOG_RETENTION_DAYS=7`: 일반 요청 기록의 기술적 기본 보관 기간. worker가 한 번에 최대1000건 삭제한다.
- `AUDIT_RETENTION_DAYS=0`: 요청 외 감사 기록 자동 삭제를 보류한다. 무기한 보관의 법적 정당성을 정한 값이 아니다. 목적별 보유기간·법정 보존·파기 정책은 운영자가 별도 확정해야 한다. 1~3650일로 설정 가능하다.
- 기존 delivered outbox/배치 실행 요약의 30일 정리와 독립이다. 원장은 외래 키로 계정 삭제에 연쇄 삭제되지 않는다. 과거 삭제된 기록을 복구하거나 이번 migration 이전 사건을 재구성하지 않는다.
- 로컬 DB/컨테이너 로그만으로 EC2 전체 장애·디스크 소실·DB 관리자 변조에 대비했다고 주장하지 않는다. 접근 로그 기록량과 인덱스 비용의 운영 부하 검증은 남아 있다.

## 서버 외부 보관 준비

[compose.cloudwatch.yml](../infra/platform/compose.cloudwatch.yml)은 선택 사항이다. 기본+beta+admin Compose 뒤에 마지막으로 적용한다. Docker Compose 2.24.4 이상에서 `!override`로 json-file 옵션을 완전히 교체한다. API/worker/Caddy만 대상이며 DB/Next 런타임 원문은 자동 외부 전송하지 않는다.

실제 연결 전에 AWS 로그 그룹·리전·보유기간·비용을 확정하고 EC2 역할에 [제한된 쓰기 권한 예시](../infra/platform/cloudwatch-role-policy.json.example)를 구체화한다. `LOGS_AWS_REGION`, `LOGS_GROUP`가 없으면 설정 검사가 실패한다. 그룹 자동 생성/삭제 권한은 부여하지 않는다. `non-blocking`, 4MiB 버퍼는 서비스 요청을 보호하지만 수집 장애/버퍼 초과 시 유실될 수 있다. CloudWatch 도착·보관기간·권한·장애 복구는 실제 AWS에서 별도 검증한다. DB 트랜잭션 감사 이벤트 전부를 이 stdout 전송만으로 백업했다고 해석하면 안 된다.

[platform-audit-export.cjs](../scripts/platform-audit-export.cjs)는 DB 감사 원장을 기간 지정 JSONL로 내보낸다. 실행 환경의 DATABASE_URL만 사용하며 기본 .env를 자동 읽지 않는다. 인자는 `from-ISO to-ISO absolute-output.jsonl`, 최대31일이다. 새 파일0600, 기존 파일 덮어쓰기 거부, 출력은 건수/기간/SHA-256만. 내용을 stdout에 덤프하지 않는다. 실행 중 변경되는 DB의 시점 백업·외부 자동 보관·복원 보장은 아니며, 파일은 접근 통제된 별도 저장소로 옮기고 해시를 대조한다.

## 외부 장애 감시 준비

[platform-external-monitor.cjs](../scripts/platform-external-monitor.cjs), [환경 예시](../infra/platform/external-monitor.env.example), [service](../infra/platform/crefans-monitor.service), [timer](../infra/platform/crefans-monitor.timer)를 **별도 호스트**에 설치한다. Node20 이상과 flock/systemd를 사용한다. 운영 서버와 같은 EC2에 두면 전체 장애 감시가 되지 않는다. 서비스/API·관리자 HTTPS 3곳을 검사하고 3회 연속 실패와 복구 전환에만 `[crefans] operations` 채널로 보낸다. 설정값/쿠키/응답본문/예외 원문은 알림에 넣지 않는다. 타이머 주기는 실행 종료 후60초이며 API/worker의 기존1시간 요약과 독립이다.

실행 호스트와 봇 설정은 아직 적용하지 않았다. 발송 성공 후 상태 파일 저장 전 프로세스 중단 시 중복 알림 가능성이 있으며 exactly-once를 보장하지 않는다. 감시 호스트 자체 장애와 Telegram 장애는 추가 외부 감시가 필요하다. AWS EC2 상태/메모리/OOM의 원인별 경보는 이 HTTP 가용성 검사와 별개다.

## 검증과 근거

`CREFANS_E2E=true node scripts/platform-audit-security-test.cjs`는 잠금으로 보호한 기존 loopback E2E DB에 migration을 적용하고 실제 MySQL 동시 차단/해제를 별도로 검사한다. 추가 DB 생성 권한을 요구하지 않는다.

`npm run test:audit`는 로컬3307 DB, 공급사/SMTP/Telegram 대역, Docker 설정 검사를 사용한다. HTTP5xx/권한거부, 마스킹, 감사 저장 실패 롤백, dedupe 경합, 금융 관찰 로그 실패, 보관기간, 브라우저 입력/제한, 외부 감시 장애/복구, export 권한/체크섬/덮어쓰기 거부를 검사한다. `python3 tests/platform-proxy.py`는 실제 로컬 Caddy 컨테이너의 정상/502 로그를 검사한다. 관리자 `npm run test:e2e`는 격리 MySQL + 실제 main + Chromium을 사용한다. 같은 E2E DB를 사용하는 서버 테스트와 동시 실행하지 않는다.

공식 자료 확인2026-10-22: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)의 actor/시각/상호작용 연결·민감정보 배제·권한·로그 장애 검증, [Caddy log](https://caddyserver.com/docs/caddyfile/directives/log)와 [log_append](https://caddyserver.com/docs/caddyfile/directives/log_append)의 중첩 필터/응답 헤더, [Docker awslogs](https://docs.docker.com/engine/logging/drivers/awslogs/)의 역할·스트림·로그 그룹 설정, [Compose merge](https://docs.docker.com/reference/compose-file/merge/)의 override 최소 버전을 적용했다. 보유기간·비용·사업 정책은 이 기술 문서로 확정하지 않았다.


### 정기결제 복구 추적 (2026-10-22)

`payment.failed` 감사에는 안전한 공급사 코드/실패 분류/회차를 기록하고 `subscription.payment_failed` 운영 이벤트를 시도별 중복 방지 키로 생성한다. 카드 교체 복구는 기존 `subscription.renewed`, 최종 중단은 `subscription.cancelled`로 연결된다. 이메일은 별도 `billing_notices` outbox와 `mail.attempt`/`mail.result`의 SMTP 접수 기록으로 추적한다. 카드 원문·빌링키·메일주소·SMTP 원문은 기록하지 않는다. 정상 worker에서 미복구 카드로 매분 재청구/실패 알람을 반복하지 않는다.
