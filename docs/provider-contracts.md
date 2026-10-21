# 외부 공급자 설정과 어댑터 경계

SMTP는 Nodemailer SMTP transport로 직접 연동한다. Toss Payments는 공식 REST/SDK로 직접 연동한다. PASS와 은행은 계약 공급자가 아직 정해지지 않아 공급자별 암호화/서명 프로토콜을 추측하지 않는다. `IdentityProvider` / `BankProvider`는 **아래 내부 어댑터 프로토콜**을 사용하는 코드다. 계약 공급사의 공식 SDK를 연결하는 어댑터 구현은 별도 필요하며 계정값만 넣는 것으로 PASS/은행 운영 연동이 완성되는 것은 아니다.

## SMTP

`MEMBER_MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. 미설정이어도 API 서버는 시작한다. 메일 요청만 오류로 반환한다. 코드 원문을 로그에 쓰지 않는다.

## Toss Payments

`TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `DATA_ENCRYPTION_KEY`(32바이트 hex), `PLATFORM_FEE_BPS`(사업자 확정값), `SETTLEMENT_HOLD_DAYS`, `REFUND_WINDOW_DAYS`, `RENEWAL_MAX_RETRIES`, `RENEWAL_RETRY_HOURS`. 빌링키 발급은 `/v1/billing/authorizations/issue`, 승인은 `/v1/billing/{billingKey}`, 조회는 `/v1/payments/orders/{orderId}`, 취소는 `/v1/payments/{paymentKey}/cancel`.

참고: https://docs.tosspayments.com/reference, https://docs.tosspayments.com/guides/v2/billing/integration. 서버의 결제 구매자 ID는 공개 회원 ID와 별도의 BillingCustomer 무작위 UUID이며 클라이언트가 전달한 customerKey/가격을 신뢰하지 않는다. 공급자와 서버 주문 모두 동일한 멱등 키를 사용한다. 타임아웃은 승인 실패로 단정하지 않고 processing 주문을 보존하여 조회/동일 주문 재시도로 복구한다.

## PASS 내부 어댑터

`PASS_ADAPTER_URL`, `PASS_ADAPTER_SECRET`, `PASS_CALLBACK_SECRET`, `PUBLIC_API_ORIGIN`. HTTPS 어댑터에 Bearer 인증으로 POST `/verifications`: `{attemptId,purpose,callbackUrl}`. 응답 `{reference,redirectUrl}`. 공급자 검증을 마친 어댑터가 콜백 POST `{attemptId,reference,verified:true,name:<공급자가 확인한 실명>,adultVerified:<공급자가 확인한 만19세 이상 여부>,identity:<안정적 CI 식별값>}`를 보낸다. `x-pass-signature` = 원문 body의 HMAC-SHA256 hex. 외부 브라우저 결과는 신뢰하지 않는다. 서비스는 CI를 HMAC으로만 저장하고 가입/출금PIN 목적·사용자·만료·일회용 소비를 검사한다. 원문 CI는 일반 DB/로그에 저장하지 않는다.

## 은행 내부 어댑터

`BANK_ADAPTER_URL`, `BANK_ADAPTER_SECRET`. Bearer 인증, `Idempotency-Key` 헤더. holder는 사용자 입력 별칭이 아니라 PASS로 확인된 회원 실명이다. POST `/accounts/verify` `{bank,account,holder}` → `{verified:boolean}`. POST `/transfers` `{bank,account,holder,amount}` → `{status:'paid'|'pending'|'rejected'}`. 같은 키 재요청은 같은 송금 작업의 최신 결과를 반환해야 한다. 계좌 번호는 AES-256-GCM 암호화로만 보관한다. 실 이체는 `BANK_PAYOUTS_ENABLED=true`일 때만 실행한다. 접수와 지급 완료는 분리한다.

## 운영 전 확인이 필요한 정책

PASS 공급사, 연령/중복 계정/탈퇴 재가입, 수수료와 정산 보류/환불, 은행 실명검증, 미디어 보존기간은 확정값을 환경·정책에 넣어야 한다. 외부 자격증명 없는 로컬 검증은 자체 API/DB 범위이며 실제 메일·PASS·결제·은행이체 성공을 증명하지 않는다.

### 빌링 등록과 삭제
등록 시도는 해시된 state, 30분 만료, 회원, 승인된 서비스 복귀 경로를 저장한다. authKey는 처리 중에만 암호화하여 보존하고 완료/확정 실패/만료 시 지운다. 공급자 발급에는 등록 ID를 동일한 멱등키로 사용한다. 카드사는 공식 issuerCode, 카드 표시는 마스킹된 번호의 마지막 4문자를 그대로 사용한다.
삭제는 `DELETE /v1/billing/{billingKey}`가 성공한 뒤 암호화 키를 지운다. 네트워크/공급사 오류는 5분 뒤 worker 재시도하며, 미확인 404 오류를 임의 성공으로 바꾸지 않는다. 반복 해제 실패는 공급사 조회·운영 확인이 필요하다. 기존 카드의 nullable customer_key는 이전 회원 식별자로 승인하는 호환 경로를 유지한다.
실제 PG 등록창/발급/폐기 검증은 계정·키 및 공급사 테스트 카드가 입력된 후 진행해야 한다. 현재 검증은 격리 DB와 공급자 대역이며 실제 금융 작업을 실행하지 않았다.

### 결제 수명주기 검증 (2026-10-08)

공식 Toss 문서 확인일은 2026-10-08이다. [멱등성](https://docs.tosspayments.com/reference/using-api/authorization)은 키 보존 기간 15일과 처리 중 409의 같은 키 재요청을 설명한다. [API](https://docs.tosspayments.com/reference)의 자동결제 타임아웃 권고에 따라 65초를 사용한다. [오류 코드](https://docs.tosspayments.com/reference/error-codes)와 [빌링 가이드](https://docs.tosspayments.com/guides/v2/billing/integration)를 근거로 서비스 worker가 갱신 일정을 관리한다.

- 같은 미확인 승인 시도는 같은 provider orderId/멱등키를 사용한다. 네트워크·5xx·처리 중/중복 오류는 확정 실패로 간주하지 않는다. 조회 후 복구하며 15일을 넘긴 미확인 승인은 자동 새 결제를 중단하고 운영 확인을 요구한다.
- 카드 거절 등 확정 실패 후 명시적 재시도에는 attempt를 증가시켜 별도 provider orderId/멱등키를 사용한다. 최초 결제와 자동 갱신 재시도를 분리한다. 주문·카드·가격·customerKey는 서버가 검증한다.
- 결제/환불 작업의 90초 DB lease는 동시 실행을 제한한다. 승인 결과의 주문 ID·금액·키를 검증하고 구독·원장·알림은 transaction에서 한 번 반영한다. 공급사 성공 뒤 DB 실패는 조회로 복구한다.
- 환불 전 조회의 주문/키/금액을 검증하고, 전액 취소 CANCELED 및 balanceAmount=0을 확인한 뒤 원장을 반영한다. 확정 거절은 paid로 복구하며 미확인 취소는 refunding과 출금 예약금을 유지한다. 완료된 취소 재조회는 다시 취소하지 않는다.
- 이전 회차 환불이 이후 독립적으로 결제된 이용 기간을 제거하지 않는다. 현재 회차 환불은 권한을 종료한다. 갱신 중 해지는 다시 자동 갱신을 켜지 않고 이미 결제한 기간을 보존한다.

검증 범위: 격리 MySQL과 공급사 응답 대역을 이용한 서버 54개(기존17+결제 수명주기31+결제 HTTP6), 별도 실제 API 권한 회귀19개, 프론트 검사273개. Chrome 실제 서비스 화면에서 테스트 회원 로그인·결제·구독·갱신 해지·전액 환불·결제 내역 새로고침을 확인했다. 임시 회원/주문 및 대역 API는 정리하고 일반 개발 API로 복구했다. 실제 Toss 창/테스트 승인·매입/취소 내역 및 실금융은 실행하지 않았다.

수수료·보류 기간·환불 가능 기간·갱신 재시도 값은 테스트에서만 주입했다. 사업자 정책으로 확정한 것이 아니다. 현재 전액 환불 원장은 기존 계약대로 플랫폼 수수료를 유지하므로 음수 수익/출금 가능 잔액이 발생할 수 있다. 실제 수수료 반환·일할/부분 환불·사용량 차감·시간대별 갱신 기준은 운영 정책 결정과 추가 공급사 검증이 필요하다. PASS/은행 bridge 구현·전체 출시 시나리오97개 및 운영 복구/부하 검증 완료를 의미하지 않는다.

### 이메일·PASS·은행 연동 가정 검증 (2026-10-08)

토스 다음 단계로 기존 내부 어댑터 계약을 실제 격리 DB/API에서 검증했다. 공급사 공식 SDK가 구현됐다는 의미는 아니다. PASS/은행은 axios 요청의 대상·Bearer 인증·요청 본문·멱등키를 검사하는 테스트 대역, 메일은 메모리 대역 및 loopback SMTP 수신 서버를 사용했다. 외부 발송·본인인증·송금은 없다. 로컬 환경 키/정책값은 변경하지 않았다.

추가 테스트 `tests/platform-provider-lifecycle.test.cjs` 17개와 `tests/platform-provider-http.test.cjs` 7개:

- 이메일: 동시 요청 한 번 발송, 세션/서비스 인스턴스가 바뀌어도 3분 제한, 만료/오답5회 제한, 동시 정답 일회용 증명, 발송 실패 시 성공 응답 금지. 실제 Nodemailer SMTP 전송과 수신 거절은 로컬 프로토콜 서버로 검증.
- PASS: HTTPS 이동 주소·비밀키 비노출, 서명·reference·시도 만료·state 검사, 실패/다른 계정 CI 거부, 중복 콜백 증명 한 번 생성, CI 해시·proof 암호화 저장. 출금 PIN 증명은 목적/회원/만료/일회용이며 PIN 변경은 기존 출금 인증을 폐기한다.
- 가입/인증 HTTP: 이메일+PASS 증명·필수 약관으로 가입, HttpOnly 로그인 쿠키, 비밀번호 재설정 후 이전 세션 폐기·코드 재사용 차단. 이메일 변경도 대상·코드 검사 후 전체 세션을 폐기한다.
- 은행: 계좌 소유권, 서버 본인인증 실명 사용(입력 별칭은 실명 아님), 암호화 계좌/마스킹 표시, 계좌 변경 중 응답 버전 불일치 거부. PIN 출금 인증은 금액·계좌에 묶이며 만료·재사용을 거부한다.
- 이체: 명시적 활성화 전 차단, pending 예약 유지, paid 한 번 반영, 응답 유실은 동일 키 재요청, rejected 예약 해제, 알 수 없는 응답은 미확인 유지. 정확히 한 번의 실제 송금은 공급사 bridge가 동일 키에 같은 송금 결과를 반환하는 계약을 지켜야 한다.

Chrome 실제 서비스에서 합성 회원 로그인→출금 검토→오답 PIN 거부→정답 접수→내역 확인→가용액 5,000→4,000원 감소를 확인했다. 사용자 별칭을 예금주 실명으로 오해할 수 있는 검토 화면의 제목을 '예금주 별칭'으로 수정하고 재확인했다. 검증용 대역 API·회원·주문을 정리하고 일반 API3001을 복구했다.

전체 서버 도메인/대역 HTTP 검사78개, 별도 일반 API 권한 회귀19개, 프론트 check273개 통과. 모든97개 출시 시나리오를 실행했다는 의미는 아니다. SMTP 공급사 실제 수신/스팸·SPF/DKIM/DMARC, PASS 계약 공급사 SDK/암호화 전문, 은행의 멱등성·이체 결과 조회·실명검증 실연동은 추가 검증해야 한다.

근거 확인일 2026-10-08: [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)의 서버 측 거래 데이터 바인딩·일회용 인증·실행 직전 검증을 출금 테스트에 적용했다. [Nodemailer SMTP](https://nodemailer.com/smtp) 및 [오류 계약](https://nodemailer.com/errors)은 연결 확인과 실제 발송 수락을 구분하므로 SMTP 수신 거절을 별도로 검사했다. 테스트는 내부 bridge 계약의 검증이며, 미선정 PASS/은행 공급사의 공식 계약을 추정해 확정하지 않았다.


### 실제 SMTP 템플릿 및 이메일 전체 기능 검증 (2026-10-09)

신규 `/api/v1` 런타임의 외부 메일 발송 지점은 `src/platform/auth.service.ts`(회원가입 코드), `src/auth/local/local-member.service.ts`(비밀번호 재설정 코드), `src/platform/email-change.service.ts`(이메일 변경 코드)다. 구형 Cognito/Lambda 런타임은 이번 출시 범위에서 제외한다. 실제 SMTP는 `MemberMailService` 하나로 전송한다.

- 승인 디자인은 `src/auth/local/mail/templates.ts`에 HTML/일반 텍스트와 CID PNG 본문 로고로 반영했다. 인증 3종은 실제 연결됨. 나머지 8종(상태 분기 포함 notice 10개)은 렌더러만 준비되었고 결제/환불/출금 등의 이벤트 발송은 아직 연결하지 않았다. 준비된 템플릿을 실제 알림 기능 완료로 해석하지 않는다. 수신함 프로필 이미지/BIMI는 본문 로고와 별도이며 이번에 설정하지 않았다.
- 제목/본문에 앰대시를 사용하지 않는다. 동적 문구의 앰대시 정리, HTML 이스케이프, 액션 URL 출처 제한과 잘못된 코드/URL 차단을 `tests/mail-templates.test.cjs`에서 검사한다.
- 발견/수정: 이메일 변경 프론트가 입력한 코드를 API에 누락하던 문제(`components/crefans/AccountPages.tsx`, 프론트)를 Playwright로 재현 후 수정했다. 비밀번호 재설정 재발송은 고정 시간 구간 제한 대신 DB 잠금과 실제 sent_at 비교로 3분 간격을 보장한다.
- `npm run test:mail`: 빌드 및 53개 템플릿/HTTP/DB/공급사 대역 검사 통과. `tests/platform-mail.integration.test.cjs`는 실제 Nest HTTP/격리 개발 DB/Nodemailer/loopback SMTP로 인증 코드 만료·오답5회·중복 소비·동시 발송·재전송·소유자/주소 바인딩·기존 세션 폐기·SMTP 거절을 검증한다. 외부 SMTP 계정 대신 로컬 SMTP 서버를 사용하며 기존 개인 계정은 수정하지 않는다.
- 프론트 `npm run test:e2e -- --project=chromium --grep '메일|회원가입 이메일'`: 회원가입, 비밀번호 재설정, 이메일 변경 3개 시나리오 통과. 이메일 변경은 수정 전 요청에 code가 없어서 실패했고 수정 후 통과했다. 비밀번호 재설정 테스트의 최초 실패는 필수 표시가 포함된 이메일 필드 선택자 오류였으며 제품 오류와 구분한다. PASS/메일은 이 E2E에서 대역이다. `npm run check` 273개 및 타입/레이어 검사 통과.
- 실제 Google SMTP: 승인된 Gmail 수신함에서 인증 3종의 메일을 직접 읽어 코드를 확보했다. 회원가입은 실제 3010 화면에서 인증 완료, 오답/쿨다운 차단. 재설정/이메일 변경은 임시 로컬 계정과 실제 3001 API로 수신 코드 확인, 이전 세션/비밀번호 차단 및 재사용 거절 확인. 테스트 계정·세션·코드는 정리했다. 실제 PASS 미설정이므로 실가입 완료는 미검증이다.
- 3종 모두 실제 Gmail에서 스팸함 분류. 새 HTML의 네이버/Outlook/다크 모드/전체 클라이언트 렌더링·전달성은 미검증이다. 기존 네이버 일반 텍스트 수신 성공을 새 템플릿 검증으로 확대하지 않는다.
- 증거: 프론트 `docs/audit/mail-verification-20261009.json`에 실행 명령/결과, 소스 SHA-256, 저장소/커밋/미커밋 상태, 실공급자와 대역 범위를 기록한다. 전체 제품 무결함·출시 가능 보장이 아니다.

공식 근거 확인일 2026-10-09: [Nodemailer embedded images](https://nodemailer.com/message/embedded-images), [message configuration](https://nodemailer.com/message), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). HTML+text 대체 본문과 CID 이미지를 사용하고, 코드의 일회성/만료/시도 제한을 검증했다. OWASP의 응답 시간 균일화 등 모든 권고를 이번 테스트 통과만으로 충족했다고 주장하지 않는다.

## 2026-10-21 실제 토스 테스트 환경 검증
개발 연동 체험 상점 API 개별 test 키로 카드 등록·최초 1,000원 빌링·갱신·해지·2건 전액 환불·빌링키 삭제를 실제 sandbox 및 로컬 DB와 대조했다. 정상/중복 승인/정산 원장 1건과 암호문 폐기를 확인했다. 단건 /checkout/:id/payment-window 및 /confirm은 SDK 일반결제창과 연결했으며, 실제 카드사 인증이 필요하여 사용자가 후속 진행 예정이다. 단건 실제 승인/환불은 미검증이다. 한 달 단건 권한은 next_billing_date=null, auto_renew=false이며 동일 주문/금액/소유권과 결제 식별자를 확인한다.
공식 근거(2026-10-21): [빌링 SDK](https://docs.tosspayments.com/guides/v2/billing/integration), [일반결제 SDK](https://docs.tosspayments.com/guides/v2/payment-window/integration), [테스트 환경](https://docs.tosspayments.com/guides/v2/get-started/environment). 테스트 승인은 실제 청구/정산이 아니다. 운영 빌링은 별도 계약 필요. 미결정 수수료/환불 정책은 테스트 프로세스에만 임시 값을 주입했다.

### 미이용 구독 결제의 전액 환불 (2026-10-21)

- 사용자 확정: 기본 종료는 갱신 해지 예약이다. 별도로 구독 결제 후 해당 크리에이터의 유료 콘텐츠를 이용하지 않았다면 전액 환불 API를 제공하되 진입 버튼은 만들지 않는다. 기존 결제 상세의 환불 버튼도 제거했다. 미이용 자동 환불에는 종전 임시 `REFUND_WINDOW_DAYS=30`을 적용하지 않는다. 이 설정은 현재 미사용이다.
- `GET /api/v1/checkout/:id/refund-eligibility`: 주문 소유자만 조회 가능. `{eligible,reason,amount,currency}`이며 사용 가능할 때 금액은 주문 전액이다. 이 응답은 안내용이다. 실제 `POST /api/v1/checkout/:id/refund`가 잠금 아래 다시 검사한다. 이미 완료한 요청 재실행은 멱등 성공한다. 처리 중·미결제·타인 주문·진행 중인 갱신 결제는 실행할 수 없다.
- `checkout_orders.usage_tracking_started_at`은 신규 승인/갱신의 권한 생성과 함께 기록한다. nullable migration이며 과거 결제를 미이용으로 소급 간주하지 않는다. 추적 시작이 없는 과거 결제는 `REFUND_USAGE_UNKNOWN`으로 자동 환불을 거부하고 수동 확인한다. `content_accessed_at`은 현재 결제 회차의 최초 콘텐츠 제공 시각이다. 브라우저가 보내는 시청 완료·조회 비콘에 의존하지 않는다.
- 이용 판정: 유료 본문·미디어가 제공되는 피드, 크리에이터 피드, 게시물 상세, 저장/좋아요 모아보기, 댓글·반응 API 및 유료 미디어 직접 요청(GET/HEAD/Range)의 서버 권한 경계다. 해당 페이지가 반환한 유료 콘텐츠는 화면 밖/재생 전이어도 제공 시작으로 취급한다. 전송 중단·저장소 실패에도 허용된 미디어 요청이 있었다면 보수적으로 이용 기록을 남긴다. 공개 콘텐츠·프로필 기본 정보·탐색·결제/설정 화면·잠긴 콘텐츠·소유자의 조회는 소비하지 않는다. 이 기준은 법률상 제공 개시의 완전한 판정이라고 주장하지 않는다.
- 공통 `/bootstrap`은 유료 본문/미디어를 제공하지 않는다. `?collection=saved|liked`만 해당 회원의 실제 저장/좋아요 항목을 노출하고 이용을 기록한다. 임의 collection 값이나 다른 항목은 유료 본문을 열지 않는다. `/posts`, `/posts/:id`, `/media/:id/file`은 실제 제공 전에 기록한다. 목업은 그대로이며 실서비스 모아보기는 이 query를 사용한다.
- 콘텐츠 제공과 환불 청구는 같은 member DB row를 먼저 잠근다. 콘텐츠가 먼저면 이용 기록으로 환불을 거부한다. 환불 청구가 먼저면 `refunding` 회차의 콘텐츠를 제공하지 않는다. 공급사 결과가 불확실할 때도 잠금을 해제한 뒤 `refunding`을 유지하고 콘텐츠 제공을 막는다. 재시도는 조회/동일 멱등키 취소를 재사용한다. 갱신 회차별 기록은 분리하며 이전 회차의 조회가 새 회차 미이용 여부를 덮어쓰지 않는다.
- 전액 취소 확정은 공급사 주문/키/총액/CANCELED/잔액0 확인 후 거래에서 1회 반영한다. 반환액은 gross 전액, 플랫폼 수수료와 creator net은 0으로 되돌린다(플랫폼이 PG에 실제 부담하는 취소 비용은 별도 사업 비용). 현재 회차는 이용 종료/갱신 중단, 이후 독립 결제 회차는 보존한다. 공급사 대역 검사와 실제 토스 운영 환불은 구분한다.
- 공식 근거 확인일 2026-10-21: [토스 API 취소 계약](https://docs.tosspayments.com/reference), [멱등키 규약](https://docs.tosspayments.com/reference/using-api/authorization), [전자상거래법 제17조](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024961473). 고객의 미이용 전액 환불 정책과 공급사 취소 기술을 구현한다. 법정 철회/계약 불이행 등 예외 권리를 이 API의 이용 판정만으로 배제하지 않는다. 운영 수동 예외 처리 UI는 이번 범위가 아니다.
- 검증 코드: `tests/platform-payment-lifecycle.test.cjs`, `tests/platform-payment-http.test.cjs`, `tests/platform-access.integration.test.cjs`; 프론트 `tests/crefans-creator.test.cjs`. 실행 결과/소스 해시는 프론트 `docs/audit/unused-refund-20261021.json`에 기록한다.
