# 단일 서버 플랫폼 배포

프론트/백엔드 두 저장소를 같은 부모 경로에 둔다. `/preview/*`는 목업으로 유지하고 `/service/*`는 실제 데이터 페이지다. Caddy가 HTTPS와 동일 출처 `/api/v1` 프록시를 제공한다. DB/API는 외부 포트를 열지 않는다. DB와 미디어는 영속 volume으로 분리한다.

1. `runtime.env.example` → `runtime.env`, `.env`에 APP_DOMAIN / DB_PASSWORD / DB_ROOT_PASSWORD 설정. 인증 비밀은 최소 64문자 무작위, DATA_ENCRYPTION_KEY는 32바이트 hex. URL 내 DB 비밀번호는 percent encode한다.
2. 두 저장소 검사·이미지 빌드 후 DB만 먼저 실행한다.
3. DB 백업/복구 검증 후 해당 이미지에서 `prisma migrate deploy`를 명시적으로 실행한다. API 시작 시 자동 migration/seed하지 않는다. 기존 구독의 가입 당시 snapshot은 마이그레이션 시 대조해야 한다. 과거 혜택을 현재 혜택으로 임의 복원하지 않는다.
4. API/frontend/worker/proxy 실행, `/api/v1/health` DB 준비 상태 확인.
5. DNS/TLS, HTTPOnly/Secure 쿠키, SMTP 테스트발송, PASS 어댑터 서명, Toss 테스트 키 결제/재시도/환불, 은행 테스트 환경, 볼륨 권한을 검증한다.
6. 수수료·정산·환불 정책 확정 후 설정한다. 은행 송금·미디어 삭제는 기본 off. 미디어 정리는 한국 시간 매일 19시, 보존기간 미설정이면 삭제하지 않는다.

## 운영 데이터 / 복구

MySQL 백업과 미디어 volume 백업은 같은 배포 버전으로 보관한다. `mysqldump --single-transaction` 또는 운영 DB의 일관성 스냅샷을 사용하고 별도 저장소·접근제어·보존 정책을 운영자가 설정한다. 회원 인증 토큰/암호/계좌/CI/메일코드는 로그 수집하지 않는다. 배포 롤백은 이전 앱 이미지와 호환되는 추가형 migration을 사용하고, DB 역 migration은 백업 복구 계획 없이 실행하지 않는다.

2026-10-07 검증 당시 Docker daemon이 로컬에서 꺼져 있어 이미지 실행 검증은 아직 수행하지 않았다. 로컬 MySQL(3307)과 API(3001)로 HTTP/DB 통합 검증을 수행한다. PASS/은행 공급자별 bridge 구현은 docs/provider-contracts.md의 경계에 연결해야 한다.

## 첫 설정과 이관

- 새 기본 계정이나 공용 관리자 비밀번호를 만들지 않는다. 확인된 운영 회원을 `platform:admin -- --member-id=<UUID> --apply`로 지정하고 관리자 v1 API로 활동 분야와 공개 약관·FAQ·공지를 등록한다. 약관 미게시 상태의 signup은 차단한다.
- `platform:audit`는 snapshot 누락·이전 평문 billing key·갱신 결제수단 누락 등을 숫자로만 보고한다. 운영 데이터에 실행하기 전 DATABASE_URL/runtime 파일을 명시한다. 과거 가입 조건은 확인한 원문을 이관하고 현재 멤버십으로 임의 대체하지 않는다.
- 기존 AWS 회원 import 도구는 유지하되 신규 API 런타임에 Cognito를 등록하지 않는다. 기존 S3 버킷은 비공개로 전환하고 실제 IAM/변환본 경로/Range 재생을 검증한다. 새 업로드는 로컬 영속 volume에 저장한다.
- PASS 콜백은 검증된 실명/안정적 CI/성인 확인을 포함한다. 성인 표시된 기존 게시물은 서버의 성인 본인인증 증명 없는 사용자에게 본문·미디어를 반환하지 않는다.
- `PLATFORM_FEE_BPS`, `SETTLEMENT_HOLD_DAYS`, `RENEWAL_MAX_RETRIES`, `RENEWAL_RETRY_HOURS`, 미디어 보존기간을 실제 사업 정책으로 확정한다. 값이 없는 결제·갱신·삭제를 임의 정책으로 실행하지 않는다.
- 인증/암호화 비밀값은 DB 백업과 별도로 안전하게 보관한다. CI HMAC과 기존 AES-GCM 데이터를 사용하므로 키 변경에는 재암호화/식별값 이관 계획이 필요하다.

## 작업 상태 확인

`platform_jobs`의 worker-health는 마지막 완료 시각과 작업별 실패 개수만 저장한다. 미디어 정리는 19시 이후 그날 한 번 claim하여, 19시에 서버가 꺼져 있었어도 같은 날 다시 시도한다. deletion=false 또는 보존기간 미설정이면 파일을 삭제하지 않는다. 멤버십 과거 버전·게시물·프로필 참조 파일은 유지한다.

정기 갱신/승인 불확실성/환불/은행 pending 작업은 DB 상태를 유지하며 같은 키로 재확인한다. 처리 중 결제·장기 pending 출금은 운영자가 점검한다. 로그에는 공급자 응답 전문·세션·계좌·이메일 코드·CI를 쓰지 않는다. 배포 설정 문법 검증은 수행했고 당시 Docker daemon이 꺼져 있어 이미지 실행·TLS/볼륨 검증은 미수행 기록이다. 이번 문서 감사에서 이를 운영 성공으로 갱신하지 않는다.

## 로컬 실제 토스 테스트 빌링
백엔드 저장소에서 `npm run dev:billing`로 API3001과 worker를 함께 시작한다. 기존 API를 먼저 종료하고 프론트3010은 중복 실행하지 않는다. `.local/platform.env`의 개별 test_ck/test_sk 키 및 로컬3307/crefans_platform_dev DB만 허용한다. 운영 키/다른 DB는 시작 거부한다. 첫 승인 후 구독 권한·내역을 저장하고 worker가 60초 간격으로 만기 갱신/불확실 승인/빌링키를 처리한다.
이 모드의 수수료10%/정산보류0일/재시도2회·1시간은 검증용이며 사업 정책 확정이 아니다. 미이용 전액 환불은 서버 이용 기록으로 판정하고 기간 제한용 구형 REFUND_WINDOW_DAYS는 쓰지 않는다. 송금과 파일 삭제는 비활성이다. 운영 배포는 확정된 정책과 라이브 빌링 계약/키를 기존 API·worker 컨테이너에 설정한다. 로컬 테스트 모드가 운영 실청구를 활성화하지 않는다.
