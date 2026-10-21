# PROGRESS: crefans_server

다른 에이전트가 이 파일만 읽고 이어받을 수 있도록 유지한다. 규약은 `AGENTS.md`.

## 현재 상태 (2026-10-08) — 실제 서비스 v1·검증

- 사용자 요청: 모든 API·DB·단일 원서버 구조와 실제 프론트 연결을 작성하고 목업 링크 유지. 외부 이메일/결제 등 계정은 추후 제공. 현재 버전 커밋·브랜치 정리는 요청받았으며 운영 배포는 하지 않았다.
- 신규 독립 런타임 `src/platform/` + `/api/v1` 공통 성공/실패 envelope. 기존 Cognito 런타임과 분리. 파괴적 계약 변경은 `/api/v2`.
- 인증/가입 이메일 코드/PASS 서버 증명·약관 snapshot, 팬 피드/검색/프로필/댓글/메시지/팔로우/알림/설정/문의, 스튜디오 콘텐츠·멤버십 버전·구독자·통계·수익/정산·출금, 관리자 API와 worker 구현.
- 결제 가격·가입 조건 snapshot, 승인/원장 정확히 한 번 반영, 불확실 결제/환불 조회, 갱신 재시도, 암호화 결제수단/계좌, 6자리 PIN·5회 실패 30초 잠금·2분 금액/계좌 version grant, 출금 동시성 보호. 카드 인증 재요청은 중복 등록하지 않는다.
- 기존 Prisma/MySQL 보존. 초기 적용 9개 이후 결제 수명주기 migration이 추가됐다. 현재 migration 파일 목록은 `docs/current-contracts.md`이며 운영 적용 상태는 별도 검증한다. `Posting.is_sensitive`는 서명된 성인 증명이 있어야 본문/미디어 접근 가능. 운영 데이터 이관이나 운영 DB 변경 없음.
- 로컬: front 3010, API 3001, MySQL 3307(`crefans_platform_dev`/`crefans_auth_test`), worker 분당 실행. 비밀값은 gitignore `.local/platform.env`, 기존 일반 `.env`는 운영 설정이므로 읽지 않는다. 은행 지급·미디어 실제 삭제 off.
- 재개 필수 문서: `docs/platform-implementation.md`(체크리스트/구조/검증/남은 일), `docs/platform-api.md`(계약), `docs/provider-contracts.md`(외부 경계), `infra/platform/README.md`(Compose·관리자·감사/운영). 프론트는 `docs/service-api-binding.md`.
- 최신 실행 증거: 프론트 `docs/audit/evidence.json`의 명령·시각·종료 코드·소스 해시를 확인한다. 아래 로그의 테스트 수는 당시 실행 기록이다.

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
- 신규 플랫폼 컨테이너 이미지/TLS·운영 DB 이관·백업 복구·공급사/부하 검증(`infra/platform/README.md` 및 출시 시나리오 참조).

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

### 2026-10-07 구독 전용 콘텐츠 권한 보안 점검
- 격리 개발 DB/회원으로 실제 HTTP 재현: 미래 시작 구독이 권한을 얻는 문제, 유료 미디어를 공개 게시물/멤버십 표지에 재사용할 때 우회 노출, 개인별 JSON 캐시 금지 헤더 누락. 수정 전 권한 통합 6개 중 3개 실패 기록 `/tmp/crefans-access-before.log`.
- 구독 started_at 검사 추가. 공유 파일은 연결된 미삭제 유료/비공개/성인 게시물의 제한을 모두 만족해야 하며 공개 게시물/표지 연결로 제한을 낮추지 않는다. 작성자는 소유 파일 접근 유지. 모든 v1 응답(오류 포함) private,no-store와 Vary:Cookie를 설정한다.
- 작성자/정확한 멤버십 구독자 허용; 비로그인/미구독/다른 상품·작성자/미래 시작/만료/EXPIRED 차단, CANCELLED지만 남은 결제 기간은 허용. 게시물 숨김·초안·삭제·공개 기간, 댓글/답글/페이징, 이미지·영상 GET/HEAD/Range, 성인 인증 및 비활성 세션·viewer 위조 검사. 영상 fixture는 권한 검사 전용이며 재생 검증이 아님.
- Nest build 통과, front3010 프록시 HTTP19개·도메인17개 통과. 신규 권한 검사 6개는 npm run test:platform에 포함. frontend는 refresh 시작 시 이전 본문·댓글·결제 표시 상태를 제거하고 오래된 댓글 응답을 무시; check269개 통과. API3001 최신 빌드 재시작, 운영 배포 없음.
- 실제 AWS 버킷/CloudFront 공개 정책은 이번 점검에서 조회하지 않았다. 기존 S3는 비공개 이관 후 저장소 직접 URL 우회/Range를 별도로 검증해야 한다. 현재 신규 파일은 API가 보호하는 로컬 volume. 이미 정당하게 내려받은 콘텐츠의 복제/화면 녹화까지 접근제어로 회수할 수는 없다.

### 2026-10-08 출시 검수 계획과 공통 조사 규약
- 사용자 요청으로 Codex 전역·/Users/ethan·두 리포 AGENTS.md에 애매한 구현/검증/정책의 공식 웹 근거 조사 원칙 기록. 사실/권장/사업 결정 구분, 공급사 대역과 실연동 검증 구분.
- 프론트 docs/release-test-scenarios.md에 97개 시나리오: 인증10·권한12·팬/콘텐츠10·결제16·정기결제15·환불12·수익/정산/출금12·운영10. 계정/데이터 준비, 실행 방식, 합격 조건, 미결정 정책, 증거 양식과 출시 판정 포함.
- Toss v2/코어API/FAQ/멱등성, OWASP 권한/세션/거래승인/회귀, 현행 전자상거래법17·18조 및 공정위 지침 공식 자료 확인. 현재 갱신/환불/계좌 코드와 교차 검토.
- 이번 작업은 문서/지침 작성. 시나리오 실행·실금융·외부 발송·운영 배포 없음. ID97개 고유성/그룹 연속성/표 구조와 diff 공백 검사 통과. 기존 미커밋 미디어/권한 보완과 .DS_Store 변경 보존.

### 2026-10-08 외부 연동 환경값 입력란 준비
- 사용자 요청으로 무시된 .local/platform.env에 runtime 템플릿 기준 누락 설정 29개를 빈 값으로 추가. 기존 8개 설정값은 그대로 보존하고 파일 권한 600 유지.
- SMTP·Toss 테스트키·금융 정책·PASS/은행 브리지·공개 주소·미디어 정리·기존 S3 항목에 용도와 입력 기준 주석 추가. runtime.env.example도 같은 항목별 주석으로 보강하고 기존 기본값 유지.
- PASS/은행은 공급사 브리지 구현 선행 필요, 이체/파일 삭제는 빈 값 또는 false로 비활성임을 명시. 공급사 비밀값 입력·발송·결제·이체·서버 재시작 없음.
- 검증: 기존 값 보존, 추가 값이 모두 빈 값인지, 키 중복/누락 여부, 템플릿 값 보존 및 로컬 파일 Git 무시 확인. 런타임 코드 변경 없음.

### 2026-10-08 Toss 결제 수명주기 구현·검증
- 사용자 요청: Toss 테스트 연동 완료를 가정하고 로직 구현/검증. dev 기반 feat/billing-lifecycle-validation에서 기존 미커밋 변경을 보존했다. 공급사 응답 대역+실제 격리 MySQL/API를 사용했고, 실제 Toss 호출/실금융/운영 배포는 하지 않았다.
- 6개 재현 실패를 먼저 확인하고 보완. 처리 중/중복 오류의 미확인 상태, 같은 주문 조회 복구·15일 제한, 90초 lease, 금액/주문/키 검증, 승인 후 DB 실패 복구, confirmed-failure 별도 attempt 재시도 구현. retry API 추가.
- 자동 갱신: 카드 누락/거절의 제한 재시도·기본 카드 교체·snapshot 유지, 원래 월말 날짜 anchor, 비활성 회원/상품/크리에이터 중단, 동시 갱신 해지 후 auto_renew 재활성화 방지.
- 환불: 사전 공급사 조회 검증, 전액 취소 확인·한 번 원장 반영, 불확실 결과 복구·예약금, 확정 거절 paid 복귀, 과거 회차 환불 시 현재 결제 기간 보존. 환불 후 부족해진 접수 출금은 이체 차단.
- migration20261008000000_payment_lifecycle을 격리3307 DB에만 적용. Nest build, 도메인/결제 HTTP54개 및 기존 API/권한19개 통과. 프론트 check273개 통과. 공급사 출처/정책 경계는 docs/provider-contracts.md.
- Chrome 실제 /service 화면: 테스트 회원 로그인→결제→내 구독→갱신 해지→환불→결제 내역/환불 완료·새로고침 유지 확인. 검증 중 결제 내역 탭 유지 문제 보완. 임시 대역 API/회원/주문 정리 후 일반 API3001로 복구, front3010/MySQL3307 유지.
- 테스트 수수료/환불/재시도 값은 사업 정책으로 확정하지 않는다. 기존 전액 환불 시 수수료 유지·음수 잔액 처리의 정책 판단, 부분/일할 환불, 실제 공급사 창/승인/취소·PASS/은행·전체97 시나리오·운영 복구/부하는 남아 있다. 커밋/푸시 없음.

### 2026-10-08 이메일·PASS·은행 연동 가정 검증
- 기존 결제 검증의 후속으로 동일 브랜치에서 진행. 공급사 대역+실제 격리 MySQL/Nest HTTP, 실제 Nodemailer→loopback SMTP를 사용. 외부 메일/PASS/송금·운영 환경 수정 없음.
- 신규 도메인17/HTTP7 검사 추가, test:platform:domain 포함. 인증 만료/중복/오답/서명/state/CI·회원 바인딩, 가입 증명/약관, 재설정·이메일 변경 세션 폐기, 계좌 암호화/변경 버전, PIN 만료/재사용/금액 바인딩, pending/rejected/paid·응답 유실 동일 송금 키 검증.
- 신규24개와 전체 도메인/대역HTTP78개 통과, 일반 API 권한19개 및 front check273개 통과. 최초 실패는 테스트 fixture/session 필드·동기 throw·bootstrap 계약 가정 오류였으며 제품 결함으로 기록하지 않는다. 이번 백엔드 런타임 변경 없음.
- Chrome 실제 /service/studio/withdraw에서 오답 차단→정답 PIN 접수→출금 내역/예약금 감소 확인. 프론트 예금주 별칭 라벨 보완/재확인. 임시 대역 API/회원·주문 정리, 일반 API3001 복구. 출처/검증 경계 docs/provider-contracts.md 참조.
- 실제 공급사 SDK/송금 멱등성 계약/결과 조회/SMTP 전달성 및 전체 출시 검수는 남아 있다. 테스트 통과는 실제 공급사 연동 완료·출시 승인 아님. 커밋/푸시 없음.

### 2026-10-08 Playwright E2E 반복 테스트 런타임
- 두 리포 feat/playwright-validation, 기존 미커밋 변경 보존. tests/e2e-server.cjs는 명시적 E2E 모드/무작위 제어 토큰/loopback 전용 독립 테스트 엔트리다. 일반 .env를 로드하지 않고 로컬3307 설정 확인 후 crefans_platform_e2e 전용 DB에만 migration/fixture를 적용한다.
- 실제 Nest/Prisma/보호 API/쿠키와 공급사 대역을 조합. 역할별 회원·정책·전용 글·카드·주문·가용 수익, PASS 서명/메일 코드·결제 응답 유실/거절·갱신/출금 처리·세션 만료·이미지 첨부를 재현. 제어 API는 운영 코드에서 사용하지 않는다.
- 프론트 Playwright 전체47개(실제 서비스11·PC/모바일 목업36) 통과, Nest build·일반 권한/API19개·front check273개 통과. 전용 DB 회원/게시물/미디어/주문/구독/출금/인증/문서 잔여0, 개발 DB e2e 회원0 확인. 테스트3011/3012 종료, 일반 개발 front3010/API3001 실행/HTTP200 유지.
- CI 수동 실행 템플릿과 문서 준비, YAML 파싱 통과. 원격 실행/커밋/푸시/실제 공급사 호출 없음. 실행 가이드는 front/docs/service-api-binding.md; 테스트 대역 결과는 실제 공급사/운영 scheduler 전체/출시97개 전체 검증이 아니다.

### 2026-10-08 클라우드·영상 화질 조사
- 사용자 요청으로 AWS/NCP와 관리형 영상 대안 Cloudflare Stream의 공식 가격/인코딩/전송/인증 경계 조사. 권장안은 단일 앱 원서버 유지+AWS서울/비공개S3/CloudFront, 원본 보관+1080/720/480급HLS 자동화질. 최종 계약/배포 결정은 하지 않았다.
- 신규 업로드는 아직 단일 로컬 파일이며 ABR/인코딩/CDN 미구현임을 소스 확인. CloudFront 정액15/200달러·50TB의 allowance/성능 조정/eligibility/SLA 차이와 NCP전송84원/GB·출력별인코딩 요금을 비교, 전체 제품 비용과 구분.
- 유료 HLS 전체 파일 권한·짧은 서명/철회 지연, DB 복구/국외 처리/기존 성인 콘텐츠 질문의 법률·공급사 허용 판단을 기술 권장안과 구분. 현행법/공식 출처·확인일은 docs/platform-implementation.md에 기록. 코드 수정/배포/공급사 문의/테스트 재실행 없음.

### 2026-10-08 자본금 없는 초기 성장 비용 계산
- 등급5/50/100/1000구독자 동일비율, 총4/40/100크리에이터·구독당월100/300분·평균4Mbps 가정. AWS공식서울PriceList/Lightsail/CloudFront 상위allowance 재조회 및 산식 검산.
- 월예산환율1400원+VAT10%로4명약9만원,40명100분54만원/300분370만원,100명100분398만원/300분975만원. 평균2Mbps면100명100분약82만원으로낮아지는민감도와 CDN요청수/50TB초과구간 반영. 실측/견적/출시가능보장이아닌조건부예산.
- 무자본초기는4GBVM한대/외부DB백업/비공개영상CDN으로월8~10만원 검증운영 권장안. 각종외부인증/PG/은행비용·인건비/관리형DB별도. 상세가정/가격근거/계산은docs/platform-implementation.md에기록, 코드/배포/외부과금변경없음.

### 2026-10-08 문서 전수 현행화·검증 증거

- 문서 전체를 Git 추적+ignore되지 않은 미추적 파일로 인벤토리화했다. 현재 안내/혼합 역사/구형/에셋 생성 기록/계층도 원문을 분류하고 코드·설정·검사 경계를 대조했다.
- README/실행 안내·확정 API 래퍼·화면 카탈로그·프로필 여백 예외·멤버십 snapshot·PASS/PIN·media worker 상태의 오래된 설명을 수정했다. 구형 Cognito/비버전 API/Lambda/사업안은 경고와 현재 계약 링크를 추가해 보존했다. 계층도 원문은 그대로 유지한다.
- 공통 지침 두 곳과 양쪽 리포 AGENTS에 완료 주장별 합격 조건/실제 명령·결과/소스 해시·만료/미검증 경계 규약을 추가했다.
- 재현 도구: 프론트 `check:docs`, `test:docs`, `docs:contracts`, `docs:record`, `docs:prove`. 전체 현황/검토 근거는 `docs/audit/manifest.json`, 실제 실행 결과/시각/해시는 `docs/audit/evidence.json`(모두 프론트)에 저장한다. 최신 실행 결과는 증거 파일이 기준이며 실패·스냅샷만 저장한 경우를 완료 테스트로 해석하지 않는다.
- 자동 검사는 자연어 전체의 진실성·실제 공급사/운영 DB/배포/부하·복구를 보장하지 않는다. 자세한 범위는 프론트 `docs/documentation-verification.md`를 따른다.

### 2026-10-09 Google Workspace SMTP 실연동 및 스팸 진단

- 기존 Workspace에 crefans.com 별칭 도메인 인증/Gmail 활성화. 승인된 MX 전환, Google+기존 SES SPF 병합, Google 2048비트 DKIM 등록. 기존 SES/DMARC DNS 보존.
- 사용자 직접 2단계 인증·앱 비밀번호 생성 및 무시된 .local/platform.env 입력. Gmail SMTP 587 STARTTLS 인증 verify 통과. 로컬 SMTP 설정 준비, API 프로세스 재시작/운영 배포 없음.
- 승인한 수신 주소로 최초 테스트 및 설정 보완 후 재검증 2회. 최초 메일은 기본 도메인 발신 주소로 재작성되어 SPF NONE/DMARC FAIL. Workspace Gmail Send mail as에 기존 crefans.com 사용자 별칭 등록 후 발신 주소 유지, DKIM/DMARC PASS 확인.
- 반송 도메인 grade.im root TXT에 Google SPF 추가(기존 소유권 TXT 보존). 권한 DNS/로컬 DNS 조회 반영 확인. 최종 실제 Gmail 원본에서 SPF/DKIM/DMARC 모두 PASS, DKIM crefans.com 확인.
- 최종 메일도 스팸함 분류: Gmail 표시 사유는 이전 스팸과 유사함. 인증 통과를 받은편지함 도착 보장이나 전체 회원 인증 시나리오 완료로 간주하지 않는다. 전용 noreply 발신 주소/앱 실제 인증 코드 전달성/운영 발송 한도 검증은 남아 있다.
- 공식 근거(2026-10-09): https://support.google.com/mail/answer/81126 및 https://support.google.com/mail/answer/180707 . 증거: /tmp/crefans-smtp-auth-verification.json, /tmp/crefans-smtp-spam-diagnosis.json, /tmp/crefans-smtp-final-authentication.png. 비밀값·전체 메일 헤더는 작업 기록에 저장하지 않음.

### 2026-10-09 no-reply 발신 주소 변경

- 사용자 요청으로 Workspace 사용자 no-reply 별칭 및 Gmail Send mail as `CREFANS <no-reply@crefans.com>` 등록. 해당 주소로 실제 확인 메일 수신·확인 완료. 기존 사용자/발신 별칭 유지.
- Git ignored `.local/platform.env`의 SMTP_FROM만 변경(0600 유지), 로컬 API3001을 dev:platform으로 재시작. 실제 SMTP 테스트 수신 메일의 From이 요청 주소와 일치함을 Chrome Gmail에서 확인. Gmail 스팸 분류는 여전히 남아 있으며 주소 변경을 전달성 해결로 간주하지 않는다. 직전 네이버 비교 메일은 사용자 정상 수신 확인.
- 검증 증거: /tmp/crefans-no-reply-verification.json 및 /tmp/crefans-no-reply-received.png. 기존 미커밋 변경 보존, 운영 배포/커밋 없음.

### 2026-10-09 승인 메일 템플릿 적용 및 전체 발송 기능 검증

- 인증 메일 3종 HTML/text/CID 로고 적용, 이메일 변경 전용 제목/본문 분리. 승인된 11종 중 나머지 8종은 렌더러 준비만 완료, 이벤트 연결은 미완료. 실제 공급자 인증 3종 수신 후 코드 소비 확인. Gmail 스팸 분류 유지, PASS 실설정 미완료.
- 재설정 발송 제한의 시간 구간 경계 문제 수정. 프론트 이메일 변경 code 누락을 E2E 실패로 재현 후 수정. 실제 테스트 임시 계정/세션/코드 정리.
- npm run test:mail 53개, 프론트 이메일 관련 E2E 3개, front check 273개 통과. 상세 범위/제외/공식 근거는 docs/provider-contracts.md, 기계 판독 증거는 프론트 docs/audit/mail-verification-20261009.json. 기존 작업 유지, 커밋/푸시/운영 배포 없음.

### 2026-10-09 서드파티 연결 재개 지침

- 후속 연결 요청 시 프론트 docs/third-party-setup.md를 먼저 읽고 추천하도록 AGENTS.md에 기록했다. 공급사 최신 조건 재확인과 키 입력/추가 개발 구분을 유지한다. 코드·환경·외부 서비스 변경 없음.

### 2026-10-21 토스 테스트 키 실연동 및 단건결제 연결
- 두 저장소 dev와 HEAD가 동일한 상태에서 feat/toss-test-integration 생성. 기존 미커밋 변경 보존, 커밋/푸시/가입비 결제 없음. 토스 개발 연동 체험 상점의 API 개별 연동 test 키만 server/.local/platform.env(0600, ignored)에 저장. 운영 키 없음.
- 실제 Chrome /service에서 합성 회원으로 카드 등록→빌링키 발급→1,000원 첫 승인 확인. 실제 Toss sandbox 조회와 DB 대조: 중복 승인 억제, 임시로 만기시킨 구독의 갱신 승인, 갱신 해지, 최초/갱신 2건 전액 취소, 빌링키 폐기/암호문 삭제 통과. 실제 출금 없음.
- 단건결제: payment-window/confirm API, SDK 일반 카드창, /service/payment/success|fail 연결. 기존 주문 금액/소유권/동시성/멱등/복구/원장을 재사용하고 한 달 이용권은 auto_renew=false. /preview 유지. 실서비스에 '한 달만 결제하기' 진입 추가.
- 실브라우저에서 카드 등록 성공 후 refresh가 결과 컴포넌트를 unmount하고 재등록 확인을 반복하는 결함 발견. 결과 화면에서 전역 refresh를 제거, 이동 시 데이터 재조회 유지. 회귀 검사 추가.
- 단건 창 신한·국민 모두 실제 카드사 인증 필요. 사용자가 지금 인증 어렵다고 답하여 일반 단건 최종 승인/실공급자 취소는 미검증. 창 호출만 성공을 승인 성공으로 기록하지 않음. 추후 신규 주문으로 카드사 인증→confirm→토스 NORMAL/DONE·DB 권한·환불 대조 필요.
- 검증: front npm run check(레이어·타입·274 tests) PASS, server npm run build 및 billing/payment lifecycle/HTTP 45 tests PASS. 금액 변조·타인 주문·중복·응답 유실은 공급사 대역+실DB 검사. docs/audit/toss-verification-20261021.json(front)에 범위/소스 해시/실공급자 결과 기록. 전체 E2E·운영 계약·실청구 검증 아님.
- 로컬 MySQL3307 및 front3010 실행. 마지막 코드 반영 후 API 재실행(node .local/toss-api.cjs)이 승인 단계에서 거절되어 API3001 종료 상태. 재실행 전 사용자 승인 필요. 임시 검증 launcher는 test 키+로컬 dev DB 강제, 수수료1000bps/보류0일/환불30일을 프로세스 안에만 설정(사업 정책 확정 아님), worker 미실행.
- 인수인계: server/.local/toss-fixture.json(0600)에 합성 fan/creator/plan/oneTimeOrder와 합성 로그인 정보, .local/toss-live-check.cjs의 audit/billing/one-time 모드 및 .local/toss-provider-evidence.json 존재. billing 모드는 이미 완료했으므로 다시 실행하지 말 것. 현재 단건 주문은 만료 가능. 미결제 테스트 fixture는 후속 인증을 위해 보존, 완료 후 대상 ID만 정리. 키/합성 비밀번호를 로그·문서에 출력하지 말 것.

### 2026-10-21 빌링 실서비스 상시 연결 후속
- 기존 /service 카드 등록→checkout→구독/결제 내역 연결에 API와 갱신 worker를 함께 실행하는 npm run dev:billing 추가. scripts/platform-billing-test.cjs는 로컬3307/crefans_platform_dev + 개별 test 키만 허용한다. API/worker 종료를 묶고 60초 갱신/승인 재조회/빌링키 처리 작업을 실행한다. 실제 청구 없음.
- 임시 개발 정책: 수수료1000bps, 정산보류0일, 환불30일, 재시도2회/1시간. 프로세스에만 설정하며 운영 정책/라이브 키는 변경하지 않음. 송금과 미디어 파일 삭제는 이 모드에서 비활성. 운영은 기존 배포 API/worker와 확정 정책·계약된 빌링 MID/live 키 필요.
- 백엔드3001 재실행 완료, front3010/DB3307 실행 중. 합성 테스트 회원으로 실제 Chrome 카드 재등록/멤버십 선택/1,000원 빌링 첫 승인/내 구독 DB 연결 재검증. 활성 구독과 등록 카드는 후속 사용 확인을 위해 유지(환불/삭제한 앞선 검증 건과 구분).
- backend build, 결제/설정/HTTP 47 tests PASS. 로컬 전용 launcher에 live 키·다른 DB 거부 대조 검사 포함. worker-health 완료/실패0 확인. Front 코드 변경 없음, 직전274 tests 증거 유지. 일반 단건 카드사 인증은 여전히 미검증.
- 검증 증거: front docs/audit/billing-binding-20261021.json 및 /tmp/crefans-billing-subscription-active.png. 후속 서버 시작은 server에서 npm run dev:billing, frontend는 기존3010 사용. 구형 .local/toss-api.cjs 대신 저장소 스크립트 사용. 실제 이용자 회원가입은 PASS 실연동 필요(기존 미해결).

### 2026-10-21 미이용 구독 전액 환불 API 사전 준비
- 사용자 확정: 기본 구독 종료는 갱신 해지 예약. 별도로 해당 크리에이터 유료 콘텐츠 미이용 결제는 100% 환불 API를 마련하되 진입 버튼은 두지 않는다. 기존 결제 상세 환불 버튼/확인 UI 제거, API/action은 보존. 종전 임시 환불30일 정책은 폐기, REFUND_WINDOW_DAYS는 현재 미사용.
- DB nullable usage_tracking_started_at/content_accessed_at 추가(migration 20261021070000). 신규 승인/갱신부터 추적, 도입 전 결제는 REFUND_USAGE_UNKNOWN으로 자동 환불 거부/수동 확인. 현재 Chrome 테스트용 활성 구독은 도입 전 결제이므로 미이용이라고 소급 판정하지 않는다.
- 서버가 유료 본문/미디어 제공 전에 현재 회차 최초 이용을 기록한다. 피드·프로필 피드·상세·모아보기·댓글·반응·미디어 직접 GET/HEAD/Range 포함. 기본 bootstrap은 유료 본문/미디어를 제외; /service/me?tab=saved|liked만 본인 collection query 요청. 공개 콘텐츠/프로필 정보/결제/설정/잠긴 콘텐츠/소유자 조회는 소비하지 않음. 화면 밖 콘텐츠·미디어 전송 중단/저장소 오류는 허용된 제공 요청 시점부터 보수적으로 이용 처리한다.
- GET /api/v1/checkout/:id/refund-eligibility 추가, POST /checkout/:id/refund에서 member 잠금 아래 재검사. 환불 청구 선행 시 refunding 동안 콘텐츠 비공개, 콘텐츠 선행 시 자동 환불 거부. 회차별 분리, 중복/응답 유실 재조회 유지. 전액 취소 확정 시 gross 전액 반환·fees/net 0 반전, 이후 독립 결제 보존. 법정/오결제 등 수동 예외 권리까지 배제하지 않는다.
- 로컬 격리3307 DB에 migration 적용, API3001+갱신 worker를 새 코드로 재시작. 실제 PG 취소는 실행하지 않았다. front check(레이어/타입/274 tests), backend build 및 접근보안/빌링/설정/환불 HTTP·DB 60 tests PASS. 공급사 대역+합성 계정/로컬 DB 검증이며 운영 금융/전체 E2E 검증 아님.
- 근거/정책 상세: server docs/provider-contracts.md, front docs/service-api-binding.md. 소스 해시/명령/환경/범위 증거: front docs/audit/unused-refund-20261021.json. 후속: 필요할 때 환불 가능 여부 API에 UI 연결, 과거 결제 수동 심사·운영 예외 화면·운영 PG 검증 별도. 커밋/푸시 없음, 기존 미커밋 작업 보존.

### 2026-10-21 누적 작업 브랜치 정리
- 원격 fetch/prune 확인: dev는 작업 시작 HEAD와 같고, feat/toss-test-integration에 누적 미커밋 코드/테스트/문서를 보존해 PR을 통해 dev로 통합한다. prod/main에는 반영하지 않는다. 단건/빌링/미이용 환불, SMTP 템플릿, 공급사/Playwright/문서 검증 등 동일 사용자 요청의 누적 작업을 함께 보존한다.
- 중복 feat 브랜치는 dev에 이미 포함된 동일 시작 커밋만 가리킨다. 독자 커밋이 없는 로컬 브랜치만 -d로 정리한다. 현재 작업 브랜치는 PR 통합 확인 후 정리하며 강제 push/히스토리 재작성은 하지 않는다.
- Finder .DS_Store 변경은 코드 커밋에서 제외하고 별도 Git stash로 보존한다. ignored .local/env/인증 자료는 stage하지 않는다. 새/변경 텍스트의 실제 키 형태 검사와 staged 파일 목록·diff --check 확인을 수행한다.
- 직전 코드 검증(front check 274, backend build+60 tests) 및 unused-refund-20261021.json 소스 해시를 보존한다. 이번 정리는 애플리케이션 코드 변경 없이 커밋/브랜치 정리이며 Playwright workflow 기본 backend ref만 dev로 갱신한다. 문서 계약/스냅샷을 갱신하고 check:docs를 재확인한다. 실제 결제/환불/운영 배포 없음.

#### 브랜치 정리 실제 결과 및 원격 전송 보류
- 코드 보존 커밋: `5a5c23e`. 현재 로컬 브랜치는 feat/toss-test-integration이며 dev/main/prod는 변경하지 않았다. 각 저장소에서 dev의 조상으로 확인된 중복 feat 브랜치 5개만 git branch -d로 삭제했다. 삭제 대상에 독자 커밋이 없음을 merge-base --is-ancestor로 확인했다.
- .DS_Store 변경은 각 저장소 stash@{0} "Finder metadata preserved before branch cleanup"에 보존했다. git status --short 빈 결과로 작업 트리 정리를 확인했다. .local/env는 ignored 상태, stage된 파일에는 포함하지 않았다. credential-like 패턴 대조 입력 탐지/대상 파일 무검출, staged diff --check 통과. 이 검사는 모든 비밀정보의 부재를 보장하는 완전한 탐지는 아니다.
- GitHub 원격 fetch는 성공했다. 두 origin은 공개 저장소이며, 자동 승인 심사가 공개 저장소로 전체 코드/문서/검증 기록을 push하는 명시 승인이 부족하다는 이유로 전송을 거절했다. 우회 전송하지 않았다. 원격 기능 브랜치/PR/merge는 만들지 않았으며, 사용자가 공개 업로드를 승인하면 기능 브랜치를 push하고 PR을 통해 dev에 통합한 뒤 로컬/원격 기능 브랜치를 정리한다. 운영 main/prod는 그대로 유지한다.
- 문서 계약과 snapshot 재생성 및 npm run check:docs PASS(56문서/81 API/41화면/11 migrations). snapshot-only-not-test-proof이며 기존 274/60 코드 검사 증거를 별도로 보존한다. 이번 추가 커밋은 작업 상태/증거 문서 기록이다.
