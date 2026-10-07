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
