# AGENTS.md — crefans_server

- 공통 조사 규약: 애매한 요구사항·구현·검증이나 결정이 필요한 부분은 공식 공급사 문서·현행 법령·OWASP를 웹검색하여 업계 기준을 면밀히 조사한다. 출처·확인일·적용 판단과 미결정 사업 정책을 기록한다. 역할별 출시 검수 기준은 프론트 `docs/release-test-scenarios.md`이며, 공급자 대역 통과를 실제 PG/PASS/은행·운영 검증으로 간주하지 않는다.

- 크레팬스(팬·크리에이터 멤버십 플랫폼) 백엔드. NestJS + Prisma + MySQL. AWS Cognito 제거·자체 회원 인증·단일 원서버(docker compose, host Postfix SMTP) 배포를 준비 중. 
- 작업 전에 `PROGRESS.md`를 먼저 읽고, 작업 후 갱신한다. 신규 서비스 기준은 `docs/platform-api.md`, `docs/platform-implementation.md`, `infra/platform/`이다. `docs/local-member-migration.md`와 `infra/single-instance/`는 구형 인증 전환 참고 자료다. `docs/prd.md`·`docs/deployment-setup.md`의 Cognito 전제 내용은 구식.
- 운영 DB에 `migrate dev`/`db push`/`seed`를 실행하지 않는다. 비밀번호·인증 코드·AWS 키를 로그에 남기지 않는다.
- 활동 분야 정렬·아이콘은 `categories.service.ts`와 `category-catalog.ts`를 사용한다. 기존 sort_order/icon 컬럼·권한·Origin·감사 이력을 유지하고, 업로드는 제한된 이미지 재인코딩 후 저장한다. 공개 분야 아이콘 경로를 유료 미디어 공개 경로로 재사용하지 않는다.
- 핸들 중복 확인은 인증된 `/me/handle-availability`에서 본인을 제외한 회원·크리에이터(비활성 포함)를 확인하고 boolean만 반환한다. 예약하지 않으며 저장 시 재검사와 DB 고유 제약을 유지한다. 중복 충돌은 HANDLE_TAKEN으로 반환한다.
- `/creators`의 신규 목록은 첫 페이지 20명과 독립적으로 등록일·id 내림차순 최신6명을 조회한다. 광고 여부와 무관하며 검색어·분야·검색 공개·회원/크리에이터 활성 조건을 함께 적용한다.
- 프론트(crefans_front)의 인증 화면 계약: 회원가입 화면 안에서 이메일 코드 인증을 완료한다. PASS 필수/임시 이메일 가입은 서버 signupRequirements에 따른다. 코드 유효 10분, 재전송 쿨다운 3분.

- 신규 실제 서비스는 `src/platform/`의 독립 런타임(`/api/v1`)이다. API/구조/검증은 `docs/platform-implementation.md`, `docs/platform-api.md`, 외부 경계는 `docs/provider-contracts.md`. `/preview` 목업은 유지한다. 기존 비버전/Cognito 런타임에 신규 API를 섞지 않는다.
- 현재 개발 DB는 `.local/platform.env`의 127.0.0.1:3307 격리 DB다. 일반 `.env`를 실제 서비스 개발·테스트에 로드하지 않는다. 외부 계정 미설정 오류를 가짜 성공으로 바꾸지 않는다.

- 기존 `main`은 예전 배포 workflow 때문에 보존한다. 신규 플랫폼의 운영 배포 전환은 별도 작업이며 `dev`/복구 태그를 운영 출시 완료로 해석하지 않는다.

- 프론트 `npm run test:e2e`는 `tests/e2e-server.cjs`를 3012 loopback에서 실행한다. CREFANS_E2E 명시·무작위 제어 토큰·로컬3307 연결을 요구하며 전용 crefans_platform_e2e DB에만 migration을 적용한다. 일반 .env/운영 엔트리와 섞거나 테스트 제어 API를 배포하지 않는다. 공급사 대역과 실제 DB로 검사하며 실제 공급사 호출/송금 검증이 아니다.

## 검증 증거 필수 규약

- 2026-10-08 사용자 지시: 모든 작업의 완료 주장에는 검증 증거가 필수다. 시작할 때 요구사항별 합격 조건과 검증 범위를 정하고, 변경 후 그 조건을 실제로 확인한다. 변경 규모에 맞는 검사만 수행하며 단순 문구 변경에 불필요한 제품 테스트를 추가하지 않는다.
- 증거에는 대상 저장소·커밋과 미커밋 상태(필요하면 파일 SHA-256), 실행 명령·환경·시각·종료 코드·실제 결과를 남긴다. 문서에는 근거 코드/설정/테스트 경로를 연결하고 전체 순회라면 파일 목록·누락 검사·제외 범위도 기록한다. 비밀값·개인정보는 증거에 포함하지 않는다.
- 검사기가 오류를 탐지한다는 주장에는 잘못된 입력을 넣어 실패하는 대조 검사도 필요하다. 성공 로그만으로 모든 요구사항이 증명됐다고 확대하지 않는다. 수동 확인·자동 검사·공급자 대역·실공급자/운영 검증을 구분한다.
- 문서/코드/환경이 바뀌면 이전 증거의 유효성을 다시 평가한다. 스냅샷 갱신은 검증 자체가 아니며, 실패·미실행·미결정 항목은 그대로 공개한다. 근거 없는 “완벽”, “무결함”, “출시 가능”을 선언하지 않는다.
- 크레팬스 문서 검증은 프론트 `npm run check:docs`와 `docs/documentation-verification.md`를 따른다. 문서 인벤토리와 계약이 달라지면 관련 설명을 검토·갱신한 후 증거를 재생성한다.

## 서드파티 연결 재개 규칙

- 사용자가 나중에 서드파티 연결을 진행하겠다고 하면 프론트 `docs/third-party-setup.md`를 먼저 읽고 그 실행 순서·공식 신청 링크·사용자 역할·추가 개발·검증 기준을 안내한다. 오래된 계약/가격/공급사 절차는 공식 문서로 재확인한다. 키 입력만으로 PASS·지급대행·신규 S3 업로드가 완료된다고 안내하지 않는다.

## 운영 알림·방어

- `[crefans] operations` 전용 설정은 `TELEGRAM_OPERATIONS_*`. 사업 이벤트는 동일 DB 트랜잭션의 outbox에만 기록하고 발송은 별도로 재시도한다. 카드·계좌·본문·이메일·토큰·원문 query를 알림/로그에 넣지 않는다.
- IP는 socket 기본, 명시한 `TRUSTED_PROXY_IPS`의 Caddy가 덮어쓴 전용 헤더만 신뢰한다. Caddy 고정 IP/Compose 네트워크/환경설정을 함께 변경·검증한다. 운영 절차와 검증 범위는 `infra/platform/README.md` 및 PROGRESS 최신 로그를 따른다.

- 운영 콘솔 소스는 별도 crefans_admin이며 서비스프론트에 합치지 않는다. 운영 Compose는 기본+beta+admin을 함께 사용하고 관리자 API도 기존 guard/Origin/접속IP 규약을 지킨다.

- 감사 원장은 platform_audit_logs이며 Telegram outbox와 독립이다. 안전한 필드 허용 목록을 유지하고 사업 변경은 동일 트랜잭션으로 기록한다. 구현/보관/외부 보관·감시/검증 경계는 docs/operational-logging.md. test:audit와 관리자 E2E는 공유 격리 DB 사용 시 순차 실행한다.

- 분실·정지 카드 오류는 billing-failures의 공식 코드 허용 목록으로만 처리한다. 미확정 승인을 실패로 바꾸거나 새로운 주문으로 재청구하지 않는다. 복구 중 카드 교체/해지/기한/권한은 platform-billing-recovery 테스트를 실행하며, 서버 build/E2E 공유 DB 테스트는 반드시 순차 실행한다.

- 신규 운영 미디어는 `MEDIA_STORAGE=s3`의 비공개 S3이며 local은 개발/호환 경로다. 미디어 GET/HEAD/Range마다 캐시 적중을 포함해 현재 세션·구독·환불 권한을 검사한다. CDN은 viewer-request 권한 검사 후 비공개 S3 전송만 허용하며 공유 가능한 bearer URL은 금지. 직접 API 스트리밍은 동일 권한의 롤백/호환 경로다. 운영/회귀/롤백은 `docs/private-media.md`, 실 AWS 검사는 명시적 opt-in + 로컬 DB에서만 수행한다.

- 게시물 공개는 상품 전용(accessPlanId)과 최소 레벨(accessLevel)을 구분한다. 레벨 판정은 동일 크리에이터의 가입 당시 snapshot.rank 기준이며 상품 가격/현재 레벨로 추정하지 않는다. 기존 상품 전용 글·구독 조건을 자동 확대/변경하지 않고 본문·댓글·GET/HEAD/Range 권한을 함께 검증한다.

- 약관·개인정보·운영정책 원본은 server `src/platform/legal-documents.ts`의 코드 릴리스다. 관리자 DB문서로 덮어쓰지 않는다. 공개일(publishedAt)과 가입 적용 시행일(effectiveAt)/준비상태(signupReady)를 분리한다. 공개 화면과 가입 동의 본문/버전·해시를 일치시키고 미해결 필수사항·미래 시행본은 가입에 사용하지 않는다. 테스트 발행본 주입은 tests/ 격리 런타임에서만 한다.

- 가입 기준은 만19세 이상이다. 기본 PASS 모드는 서명된 공급사 결과·서버 proof를 검사한다. 사용자 요청의 임시 email-only 모드는 PASS를 보류할 수 있지만 연령 확인 체크를 본인/성인인증으로 취급하거나 identity_hash를 생성하지 않는다. 보호 콘텐츠·출금 인증과 법률문서 signupReady 검사는 유지한다. 실제 공급사 연결 전 대역 검증을 실연동 완료로 보고하지 않는다.

- Swagger는 `/api/v1/admin/docs/{user,studio,console}` 세 페이지다. 전용 API는 분리하고 실제 사용하는 공통 API만 함께 표시한다. 모든 문서·JSON/YAML·정적 파일에 회원·활성 관리자 guard를 적용하고 UI 요청 실행은 비활성화한다. route 변경 시 `src/platform/openapi-contract.ts`와 의미 문서를 갱신하며 `npm run test:openapi`로 합집합·분류·권한을 검증한다. 비밀값·실제 개인정보 예시는 금지한다.

- 운영 SSH: 2026-10-24 사용자가 현재 집 IP의 지속 허용을 승인했다. AWS `crefans-beta`의 TCP 22 관리 규칙 `sgr-0042cbcbcd1b74b35`은 기한 없이 유지하고 배포 후 정리에서 삭제하지 않는다. 정확한 /32·검증은 server `.local/home-ssh-20261024/verification.json`, 공개 증거는 server `docs/home-ssh-access-20261024.json`. IP 변경 시 허용 범위를 임의로 넓히지 않는다.

- 2026-10-25 베타 선택·개방 조건은 프론트 `docs/beta-role-test-plan.md`, 서버 적용 계약은 `docs/platform-api.md` 최신 베타 절을 따른다. BETA_MODE의 테스트 결제/실송금 차단, 신규 환불 snapshot·기존 계약 보존, PG 입금 대사와 광고 동의/철회 이력을 우회하지 않는다. 실제 처리 사실이 미확정이면 법률문서 signupReady를 임의로 해제하지 않는다.

- 콩 충전 대사는 미승인 pending·결제키 미저장 주문의 PG EXPIRED/ABORTED(approvedAt=null)만 주문번호·금액·KRW 검증 후 재고 예약을 종료할 수 있다. 저장된 결제키 불일치나 승인 결과 불일치를 무시하지 않고, 대사에서 새 결제 승인을 요청하지 않는다.

- 콩 후원은 server `docs/platform-implementation.md`의 콩 확장 설계를 따른다. 구형 Wallet/Transfer와 신규 Bean 원장을 자동 혼합하지 않고, 충전·후원·출금은 중복 집계하지 않는다. 공유 지갑/후원/출금과 독립 콘솔은 연결되어 있다. 기능/live 판매 기본 off 및 실공급자 미확인 경계·배포 상태는 PROGRESS.md에서 확인한다.

## 브랜치 규칙

- 새 작업은 최신 `origin/prod`에서 `feat/<작업명>` 생성 → `dev` 통합·검증 → `prod` 승격한다. `dev`에서 새 작업을 분기하지 않는다.
- dev/prod 직접 기능 개발·prod 직행·force push 금지. 기본 PR, 사용자 직접 통합 요청은 같은 순서의 로컬 merge와 일반 push 허용.
- 실행 방법·증거 기준은 `docs/branch-workflow.md`. prod 반영과 운영 배포는 별개다.

- 게시물 워터마크는 업로드 metadata의 watermarkEligible 버전이 있는 신규 크리에이터 미디어만 대상으로 한다. 기존 파일을 재저장 시 추론해 변환하거나 일괄 소급하지 않는다. 원본은 프로필·멤버십 사진을 위해 보존하고, 게시물만 새 UUID의 파생 파일을 참조한다. 완료 전 비공개·기존 구독/GET/HEAD/Range 권한을 유지한다. 상세는 docs/private-media.md.
