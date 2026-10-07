# PROGRESS: crefans_server

다른 에이전트가 이 파일만 읽고 이어받을 수 있도록 유지한다. 규약은 `AGENTS.md`.

## 현재 상태 (2026-10-07) — 실제 서비스 v1

- 사용자 요청: 모든 API·DB·단일 원서버 구조와 실제 프론트 연결을 작성하고 목업 링크 유지. 외부 이메일/결제 등 계정은 추후 제공. 현재 버전 커밋·브랜치 정리는 요청받았으며 운영 배포는 하지 않았다.
- 신규 독립 런타임 `src/platform/` + `/api/v1` 공통 성공/실패 envelope. 기존 Cognito 런타임과 분리. 파괴적 계약 변경은 `/api/v2`.
- 인증/가입 이메일 코드/PASS 서버 증명·약관 snapshot, 팬 피드/검색/프로필/댓글/메시지/팔로우/알림/설정/문의, 스튜디오 콘텐츠·멤버십 버전·구독자·통계·수익/정산·출금, 관리자 API와 worker 구현.
- 결제 가격·가입 조건 snapshot, 승인/원장 정확히 한 번 반영, 불확실 결제/환불 조회, 갱신 재시도, 암호화 결제수단/계좌, 6자리 PIN·5회 실패 30초 잠금·2분 금액/계좌 version grant, 출금 동시성 보호. 카드 인증 재요청은 중복 등록하지 않는다.
- PostgreSQL 등으로 변경하지 않고 기존 Prisma/MySQL 보존. 추가 migration 7개와 기존 2개를 격리 DB에 적용. `Posting.is_sensitive`는 서명된 성인 증명이 있어야 본문/미디어 접근 가능. 운영 데이터 이관이나 운영 DB 변경 없음.
- 로컬: front 3010, API 3001, MySQL 3307(`crefans_platform_dev`/`crefans_auth_test`), worker 분당 실행. 비밀값은 gitignore `.local/platform.env`, 기존 일반 `.env`는 운영 설정이므로 읽지 않는다. 은행 지급·미디어 실제 삭제 off.
- 재개 필수 문서: `docs/platform-implementation.md`(체크리스트/구조/검증/남은 일), `docs/platform-api.md`(계약), `docs/provider-contracts.md`(외부 경계), `infra/platform/README.md`(Compose·관리자·감사/운영). 프론트는 `docs/service-api-binding.md`.
- 최신 검증: Nest build, 플랫폼 도메인 17개(가입3/finance6/jobs2/billing6), front check 267개 및 분리된 복사본 production build 통과. HTTP13개 API3001 및 프론트3010 proxy 경유 통과(성인 권한·검색 공개 설정 포함). 기존 로컬 인증12개는 별도 테스트 DB에서 통과. 읽기 전용 개발 DB 감사는 모든 항목0, worker heartbeat failures={} 확인.

## 운영 전 남은 일

1. SMTP/Toss 계정·수수료/보류/환불/갱신 정책 입력 후 공급사 테스트 환경 확인.
2. PASS·은행 공식 SDK를 문서의 내부 bridge 계약에 연결. 계정 정보만으로 이 두 공급자 구현이 끝나는 것은 아니다.
3. 약관·정책·카테고리 등록/초기 관리자 지정, 기존 회원·구독 snapshot·billing key 암호화·S3 비공개 이관 감사.
4. Docker 실제 이미지/볼륨/TLS·백업 복구·부하·외부 결제 장애 운영 검증. Compose 문법까지만 확인(로컬 Docker daemon 미실행).
5. 보조 목록의 대규모 페이지 분리, 관리자 신규 UI·월별 세무 정산은 현재 목업 바인딩 범위 밖.

## 이전 상태 (2026-09-13)

- 브랜치 `feat/local-member-auth`(로컬 전용, 원격 미푸시). 수정 16개·신규 8개 파일이 미커밋 상태: 로컬 회원 인증(`src/auth/local/`), 마이그레이션 스크립트(`scripts/`), `prisma/migrations/20260910000000_local_members/`, `infra/single-instance/`, `docs/local-member-migration.md`.
- 결정(2026-09-13): Cognito를 쓰지 않고 자체 인증 + 단일 원서버로 배포한다. S3·MediaConvert·결제 연동은 당분간 유지.

## 핵심 결정

- 이메일 인증 코드: 유효 10분, 시도 5회, 재전송 쿨다운 3분(2026-09-13, 프론트 회원가입 정책과 통일). `LocalMemberService.issueCode`의 rate limit 180초.
- 회원가입 흐름: 프론트에서 코드 인증과 PASS 본인인증을 같은 화면에서 완료한 뒤 가입 요청. 현재 PASS 서버 증명 계약은 `docs/provider-contracts.md`에 작성되어 있으며 공급자 공식 SDK bridge 연결이 남아 있다.

## 다음 할 일

- PASS/은행 공급사 선택 및 공식 SDK bridge 연결(콜백·서버 증명 저장은 구현).
- `feat/local-member-auth` 변경 커밋·리뷰, 컨테이너 이미지 실행 검증(docs/local-member-migration.md '검증' 절 참고).

## 미해결 질문

- 이메일 인증 코드 재전송 제한을 IP 단위로도 둘지.

## 작업 로그

- 2026-09-13: 인증 코드 재전송 rate limit 60초→180초(`src/auth/local/local-member.service.ts`), 문서 반영. 빌드·테스트는 실행하지 않음. AGENTS.md·PROGRESS.md 신설.

### 2026-10-07 결제수단 등록 보완 완료
- BillingCustomer(공개 회원 ID와 별도 UUID), BillingRegistration(state 해시/30분 TTL/복귀 경로/암호화된 처리 중 authKey/lease)을 추가. `/billing/registrations`→Toss 인증→회원/시도 검증→멱등 발급. 기존 authKey 단독 등록 계약은 거부.
- 카드사 issuerCode/마스킹된 마지막 4문자 표시. 삭제 시 soft delete→PG DELETE→암호화 키 삭제, 실패는 5분 뒤 worker 재처리. 갱신/처리 중 결제 카드 삭제 차단. 인증 중 회원 비활성화도 발급된 키를 폐기한다.
- 격리 개발/테스트 DB에 9번째 migration 적용. Nest build, 도메인17/HTTP13 통과. front267/분리 production build 통과. API/worker 최신 빌드 재시작.
- 실제 Chrome에서 목업 동의·카드 선택·잘못된 인증 차단·등록·기본 변경·삭제/기본 복구와 실제 미설정 오류·취소/재시도·잘못된 콜백 거부·authKey 주소 제거 확인. 콘솔 error/warn 없음.
- Toss 키/공급사 테스트 카드 미입력으로 실제 PG 창·발급·폐기 실행은 미검증. SMTP/PASS/은행 등 기존 외부 입력·연동 과제는 운영 전 남은 일 유지. 문서의 공급자 DELETE 실패는 임의 성공으로 변환하지 않는다.

- 최종 프록시 검증: 프론트3010 경유 HTTP13개 통과. 브라우저 검증용 임시 회원/세션을 격리 개발 DB에서 제거했고 검증용 Chrome 탭만 닫았다.

### 2026-10-07 출시 준비 점검 (수정/배포 미실행)
- 현재 검사 통과는 로컬 코드/DB 범위이며 출시 승인 아님. 자동 브라우저 E2E 구성과 전체 경로 커버리지 측정 없음. frontend267에는 기존/공통 UI 검사도 포함된다.
- 배포 진입점: frontend app/page.tsx는 기존 LandingPage, Caddy는 전체 frontend 전달. legacy backend deploy workflow는 dist/src/main.js 실행. 신규 /service와 platform runtime으로 출시 경로/CI 전환 필요.
- 추가 코드 점검: 로그인 성공 뒤 화면 이동 없음; 프로필 avatar/cover 편집 계약·저장 경로 없음, 독립 공개 프로필 이미지의 media GET 공개 참조 권한 없음; billing retryBilling 내부 catch로 worker-health 실패 통계에 누락 가능. HTTP/브라우저 재현을 추가해야 하며 이번에는 정적 확인.
- 정산 응답은 revenue entry별 보류/가용 상태이며 월별 정산 마감/증빙 엔진은 아님. 관리자 API는 있지만 운영 UI 미구현. 보조 목록 무제한 관계 조회/대규모 페이지 처리 필요.
- 신규 외부 연동/운영: PASS·은행 공급자 SDK bridge, SMTP/Toss 공급자 테스트, 기존 데이터 이관, Docker/TLS/백업 복구/롤백/장애 경보/부하 검증 남음.
- 이번 npm audit --omit=dev: backend50(critical2/high15/moderate30/low3), frontend7(critical2/high4/moderate1). 실제 노출 경로·수정 버전 검토 및 호환성 검사 필요; advisory 개수는 악용 재현 결과가 아니다. 자동 audit fix/운영 수정 없음.
- 권장 순서: 출시 차단 결함/의존성 정리→격리 staging/CI→도메인·통합 음성/동시성/장애 테스트→실제 UI E2E→공급사 테스트→복구/부하/출시 리허설. 팬·크리에이터·운영자 역할별 전 과정을 실 데이터로 검증.

### 2026-10-07 현재 버전 보존·브랜치 정리
- 사용자 승인: 현재 버전을 보존하고 프론트/백엔드 브랜치 정리. 제품 동작은 변경하지 않는다.
- 기존 원격 기본 브랜치는 main 하나이며 dev/prod가 없음을 fetch로 확인. main은 기존 배포 연동 때문에 보존하고, prod는 기존 origin/main 기준, dev는 승인한 현재 작업 전체를 보존한 초기 개발 기준으로 구성한다.
- 두 리포지토리에 동일한 checkpoint/crefans-pre-launch-20261007 annotated tag로 복귀 지점을 만든다. 기존 기능 브랜치는 이력이 dev에 포함된 경우에만 삭제한다. 강제 push/reset/운영 배포/원격 기본 브랜치 변경 없음.
- .DS_Store 변경은 제품 커밋에서 제외하고 로컬 파일은 보존한다. 외부 자격증명과 격리 DB/미디어/환경 파일은 커밋하지 않는다.

- 브랜치 정리 검증: front check267, backend build/domain17/HTTP13/auth12 통과. 인증 테스트는 플랫폼 실행 환경을 상속하지 않는 격리 *_test DB 환경으로 검증했다. 적용된 SQL migration은 checksum 보존을 위해 원문 유지.
