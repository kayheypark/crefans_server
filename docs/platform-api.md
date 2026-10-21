# CREFANS v1 API 계약

새 서비스의 HTTP 진입점은 `/api/v1`. 실행은 `src/platform/main.ts`, 별도 자동 작업은 `src/platform/worker.ts`. 기존 앱의 비버전 API와 Cognito 컨트롤러는 이 런타임에 등록하지 않는다. 파괴적인 응답·의미 변경은 `/api/v2`로 분리한다.

## 공통 규약

```json
{"success":true,"data":{},"errorMessage":null,"errorCode":null}
```

```json
{"success":false,"data":null,"errorMessage":"로그인이 필요합니다.","errorCode":"UNAUTHORIZED"}
```

HTTP 상태는 보존한다. 400 입력, 401 세션, 403 권한, 404 없음, 409 상태/멱등 충돌, 429 제한, 503 공급자/설정 미준비. 내부 오류는 DB·외부 키·스택을 응답에 노출하지 않는다. `/media/:id/file`은 권한 확인된 바이너리/Range 응답이므로 성공 시 JSON을 감싸지 않는다.

인증은 HTTPOnly access/refresh 쿠키. 운영은 Secure·동일 출처. 쓰기 요청은 출처 검사, PASS 콜백은 원문 서명 검사. refresh 토큰은 일회용 회전한다. 프론트는 401에 단일 갱신·재요청, 지원 브라우저에서는 탭 사이 Web Locks로 중복 갱신을 직렬화한다. 일반 API에서 클라이언트 사용자 ID·가격·권한·인증완료 boolean을 신뢰하지 않는다.

아래 경로에는 `/api/v1`을 붙인다. 사용자 표시용 필드와 내부 DB snake_case를 섞지 않는다. 날짜 표시는 한국 시간 `YYYY-MM-DD`, 예약 시각은 ISO datetime, 금액은 정수 KRW. 목록의 필드별 계약은 `types/crefans*.ts`, 서버 변환은 `PlatformService`·studio/finance service에 있다.

## 인증과 공통 조회

| Method | 경로 | 인증 / 요청 · 응답 |
| --- | --- | --- |
| GET | /health | 공개; DB 준비 상태와 version |
| GET | /bootstrap | 선택 인증; 현재 사용자·팬 화면 데이터·계정 설정 |
| GET | /session | 회원; 세션 유효 여부 |
| GET | /common | 선택 인증; 공지·FAQ·정책·내 결제수단 |
| POST | /auth/signup/email/request | email; 6자리 코드, 10분 유효·180초 재요청 제한 |
| POST | /auth/signup/email/verify | email, code; 일회용 email proof |
| POST | /identity/start | purpose=signup 또는 withdrawal-pin; attemptId/state/redirectUrl |
| POST | /identity/status | attemptId, state; 완료 시 서버 proof; URL에 증명값을 넣지 않음 |
| POST | /identity/callback | 공급자 원문 HMAC, reference·목적·만료 검증 |
| POST | /auth/identity | 과거 호출 호환용, PASS_NOT_CONFIGURED |
| POST | /auth/signup | email/password/nickname/terms/privacy/marketing + 두 서버 proof |
| POST | /auth/login | email/password; 쿠키 발급 |
| POST | /auth/refresh | refresh 쿠키; 기존 토큰 폐기 후 회전 |
| POST | /auth/logout | access 또는 refresh로 회원 세션 철회, 쿠키 삭제 |
| POST | /auth/forgot-password | email; SMTP 코드 요청 |
| POST | /auth/reset-password | email/code/password; 기존 세션 철회 |

`/auth/identity`는 과거 호출에 대해 PASS_NOT_CONFIGURED를 반환하는 호환용 경로다. 새 프론트는 /identity/start/status를 사용한다. signup은 공개된 이용약관·개인정보처리방침을 요구하고 수락 시점 원문 snapshot을 기록한다. PASS의 실명/CI/성인 확인은 서명된 공급자 결과만 사용한다. CI 원문 대신 HMAC을 저장한다.

## 팬 서비스

| Method | 경로 | 동작 |
| --- | --- | --- |
| GET | /creators | 공개 검색; query/category/cursor, 20개 + nextCursor, 공개 검색 설정 준수 |
| GET | /profiles/:id | UUID·회원 핸들·크리에이터 핸들 조회; 판매 멤버십 포함 |
| GET | /profiles/:id/following | 팔로잉 공개 또는 본인만 조회 |
| GET | /posts | creatorId/cursor; 20개 + nextCursor |
| GET | /posts/:id | 직접 게시물 조회; 서버가 유료 본문·미디어 차단 |
| GET | /posts/:id/comments-page | offset; 댓글 10개 + nextOffset |
| GET | /posts/:id/comments | parentId가 있으면 2뎁스 답글; 권한·전역/게시물 댓글 설정 검증 |
| POST | /posts/:id/comments | 회원; body, 선택 parentId/mentions(최대 100) |
| PUT | /posts/:id/like | 회원; enabled |
| PUT | /posts/:id/save | 회원; enabled |
| PUT | /members/:id/follow | 회원; enabled, 상태 변화 이력 저장 |
| PUT | /members/:id/block | 회원; enabled |
| POST | /members/:id/messages | 회원; body, 양방향 차단 검증 |
| POST | /reports | 회원; id, kind=USER/POSTING |
| PUT | /notifications/read | 회원; ids, 본인 알림만 처리 |
| PUT | /me/profile | 회원; name(닉네임), bio |
| PUT | /me/settings | 회원; section=password/notifications/privacy 등 |
| POST | /me/email/request | 회원; 새 email, 현재 회원과 대상에 묶인 코드 |
| POST | /me/email/confirm | 회원; email/code, 변경 후 세션 철회 |
| POST | /me/inquiries | 회원; category/title/message |
| POST | /me/withdraw | 회원; 자동 갱신·처리 중 출금 확인 후 탈퇴/세션 철회 |

피드·탐색·댓글은 서버 페이지 조회를 사용한다. bootstrap의 최초 공개 크리에이터/게시물 목록은 제한된 초기 데이터이며, 직접 프로필·저장/좋아요·구독/팔로우·메시지 관계는 추가 조회한다. 다른 회원의 이메일·실명·CI·계좌 번호는 공개 DTO에 포함하지 않는다. 탈퇴한 댓글 작성자는 익명 표시한다.

## 크리에이터 스튜디오

| Method | 경로 | 동작 |
| --- | --- | --- |
| GET | /studio/overview | 본인 프로필·시작 여부·콘텐츠·멤버십·가입자·지표 |
| GET | /studio/community | 본인 게시물 댓글/답글·메시지 상대방/대화 |
| POST | /studio/start | name/handle/bio/category |
| PUT | /studio/profile | 위 정보 + about/links(youtube/instagram/facebook) |
| PUT | /studio/activity | active |
| PUT | /studio/comments-setting | enabled; 게시물 설정보다 우선 |
| POST | /studio/content | id?, title/body/media/commentsEnabled/accessPlanId/status/scheduledAt |
| POST | /studio/content/:id/delete | 소유권 검증 후 soft delete |
| POST | /studio/memberships | id?, name/price/benefits/image; immutable version 생성 |
| PUT | /studio/memberships/:id | active 또는 deleted; 삭제 시 유효 구독 확인 |
| PUT | /studio/comments/:id | hidden, 본인 게시물만 |
| POST | /studio/comments/:id/reply | body, 2뎁스·댓글 수 반영 |
| GET | /studio/reports/:id | revenue/subscribers/followers, startDate/endDate |
| POST | /media | 소유권 있는 업로드; image 5MB/video 300MB |
| GET | /media/:id/file | owner/게시물 권한/공개 멤버십 이미지에 따른 파일 응답 |

이미지와 동영상 합계 게시물당 최대 10개. 소유자·중복·처리완료 여부와 첨부 순서를 서버에서 검사한다. 이미지 재인코딩, 비디오는 MP4/WebM 컨테이너 확인. 업로드는 임시 디스크 + 스트리밍 프록시, 원서버 media volume에 저장한다. 기존 S3 자료는 승인 후 SDK 스트리밍으로 읽으며, 지원된 변환본을 우선한다. S3 버킷의 공개 접근/기존 공개 URL은 운영 이관 시 차단해야 한다.

`Posting.is_sensitive` 콘텐츠는 서명된 성인 확인 증명 없이는 본문·미디어를 제공하지 않는다.

최초 발행과 예약 발행은 팔로워/유효 구독자에게 중복 없는 발행 알림을 생성하고 알림 설정을 확인한다. 예약 발행·일일 정리는 worker가 담당한다.

## 결제·구독·정산·출금

| Method | 경로 | 동작 |
| --- | --- | --- |
| GET | /billing/config | 회원의 server customerKey + 공개 Toss clientKey |
| POST | /billing/registrations | returnPath; registrationId/state/private customerKey, 30분 만료 |
| POST | /billing/methods | registrationId/state/authKey/customerKey; 시도·회원 결합 검증, 암호화된 billing key 저장, returnPath 반환 |
| PUT | /billing/methods/:id | operation=default/delete, 소유권·갱신/처리 중 결제 검증; 삭제 후 PG 빌링키 해제 및 실패 재처리 |
| POST | /checkout | planId/requestId; 서버 가격·가입 조건 snapshot으로 주문 생성 |
| GET | /checkout/:id | 본인 주문만 |
| POST | /checkout/:id/retry | failed 최초 주문만 명시적 재시도, 갱신 주문 거부 |
| POST | /checkout/:id/payment-window | 본인 pending 최초 주문; 서버 금액/주문번호와 SDK 키 반환, 한 달 단건 모드 고정 |
| POST | /checkout/:id/confirm | 본인 주문; paymentKey/orderId/amount 검증 후 토스 일반결제 승인, 자동 갱신 없는 한 달 권한 |
| POST | /checkout/:id/pay | methodId?; 서버 승인·공급자/DB 멱등 처리 |
| GET | /checkout/:id/refund-eligibility | 본인 주문; 서버 이용 기록 기준 전액 환불 가능 여부/사유/금액 |
| POST | /checkout/:id/refund | 소유권·추적 이력·미이용 확인; 실제 전액 취소 후 수수료/원장/권한 반영 |
| POST | /subscriptions/:creator/cancel | 자동 갱신 해지, 남은 권한 유지 |
| GET | /studio/finance | 원장/정산 보류/출금 가능/신청/지급 내역 |
| POST | /studio/accounts | id?, bank/holderAlias/accountNumber; AES-GCM 보관 |
| POST | /studio/accounts/:id/verify | PASS 실명과 은행 예금주 검증 |
| PUT | /studio/accounts/:id/default | 확인된 본인 계좌만 |
| POST | /studio/pin | pin=6자리 + withdrawal-pin용 본인 proof |
| POST | /studio/withdraw/review | amount/accountId; 서버 잔액 검토 |
| POST | /studio/withdraw/verify | pin/amount/accountId; 2분 금액·계좌 version 지정 grant |
| POST | /studio/withdraw | amount/accountId/requestId/authorizationId |

동일 카드 인증 재요청은 등록을 중복 생성하지 않는다. 결제 내역은 서버 주문의 결제일·paid/refunding/refunded 상태를 표시한다.

주문은 pending → processing → paid 또는 failed. 타임아웃은 processing을 유지하며 worker가 공급자를 조회한다. 동일 승인으로 구독/수익 원장이 두 번 생성되지 않는다. 가입 금액·혜택은 snapshot, 수수료·보류 기간은 승인 요청 직전에 고정한다. 갱신은 이전 구독 조건을 사용하며 확정 실패의 재시도 횟수/간격은 사업 설정을 따른다. 환불 불확실성은 refunding으로 유지하고 재확인한다.

계좌와 PIN/CI 증명·빌링키는 일반 조회에서 반환하지 않는다. PIN은 목적이 분리된 scrypt hash이며 5회 실패 시 30초 잠근다. 출금은 creator 행 잠금·잔액 재검증·grant 소비·requestId 멱등 처리를 한 transaction에서 수행한다. 접수 중 계좌 편집을 막는다. 은행은 요청 키를 유지하여 재조회·송금 중복 방지를 담당한다. 로컬 접수는 은행 지급 완료와 다르다.

## 관리자·운영

관리자 DB 역할 검증을 추가로 적용한다. 공개 signup은 관리자 역할을 받지 않는다.

| Method | 경로 | 동작 |
| --- | --- | --- |
| GET | /admin/inquiries | 문의 조회 |
| POST | /admin/inquiries/:id/reply | 문의 답변 |
| GET | /admin/reports | 신고 조회 |
| POST | /admin/reports/:id/resolve | 신고 처리 |
| GET | /admin/documents | 서비스 문서 조회 |
| POST | /admin/documents | FAQ/공지/약관/개인정보/운영정책 등록 |
| POST | /admin/categories | 활동 분야 등록/활성화 |
| POST | /admin/creators/:id/promotion | 주목할 크리에이터 광고 배치 설정 |

첫 관리자는 `scripts/platform-admin.cjs`에 기존 확인된 회원 ID와 --apply를 명시해 운영자가 지정한다. 스크립트는 기본 비밀번호나 임의 계정을 만들지 않는다. 기존 DB 이관 전 `scripts/platform-audit.cjs`로 과거 snapshot·평문 billing key·미확인 PASS·미완료 작업을 숫자로만 점검한다.

## 검증과 운영 경계

코드/DB/프론트 바인딩 검증은 `docs/platform-implementation.md`. SMTP·Toss 계정은 환경값 주입 후 해당 서비스 테스트 환경에서 확인한다. PASS/은행은 공급사 공식 SDK를 내부 어댑터 계약에 연결해야 한다(`docs/provider-contracts.md`). 기존 Cognito 회원/과거 구독 조건/스토리지 이관, Docker 실제 컨테이너·TLS·부하·장애 복구 검증은 운영 전 별도 수행한다. 현재 원장의 정산 내역은 지급 가능 시각이 있는 개별 수익 건이며, 세무용 월별 증빙/세금계산서 기능을 의미하지 않는다.

## 구독 전용 게시물 접근 보안 (2026-10-07)

- 본문·첨부 미디어·댓글/답글은 서버에서 동일 게시물 권한을 검증한다. 권한 없는 게시물 응답은 홍보용 제목/작성자/집계 등 메타데이터만 유지하며 body는 빈 문자열, media는 빈 배열이다. 댓글/파일은 403을 반환한다.
- 지정 상품이 있는 게시물은 해당 상품의 구독만 인정한다. 구독 시작 <= 현재 < 종료 및 ONGOING/CANCELLED 상태를 요구한다. 자동 갱신 해지 후 남은 이용 기간은 유지하고 만료/환불 완료로 EXPIRED가 된 구독은 거부한다. 과거 레벨 방식 게시물의 snapshot 레벨 계약은 유지한다.
- 미디어는 원본/변환본 직접 주소 대신 권한 API로 제공한다. 공유된 파일에 유료·비공개·성인 제한이 있으면 모든 해당 제한을 만족해야 한다. 공개 글/멤버십 표지에 같은 파일을 재사용해도 제한을 낮추지 않는다. 여러 상품에서 파일을 공유하면 모든 연결 상품의 권한이 필요하므로 각각 업로드하는 편이 적절하다.
- v1 응답은 private, no-store; 작성자 본인 파일을 제외한 직접 파일 GET/HEAD/Range에도 동일 검사를 적용한다. 배포 프록시/CDN에서 이 정책을 덮어쓰지 않는다. 기존 S3 공개 정책 확인은 별도 운영 검증 과제다.
- 권한 회귀 검사: npm run test:platform (기존 HTTP13개 + 권한6개), 격리 3307 개발 DB 전용이며 테스트 회원/파일은 종료 시 삭제한다.

## 결제 상태와 재시도 (2026-10-08)

- `POST /api/v1/checkout/:id/retry`: 소유한 최초 결제 failed 주문의 명시적 재시도. 미만료 주문을 pending으로 바꾸고 attempt를 한 번 증가시킨다. 중복 요청은 현 상태 반환. 갱신 주문은 worker가 관리하며 `RENEWAL_MANAGED`로 거부한다. 이후 기존 `/pay`로 현재 기본 카드를 사용한다.
- pending → processing → paid. 승인 미확인은 processing을 유지하고 같은 주문 `/pay` 또는 worker 조회로 복구한다. 확정 거절은 failed. 다른 회원 주문/카드 사용은 거부한다.
- paid → refunding → refunded. 미확인 취소는 refunding 유지, 확정 취소 거절은 paid 복구. refunded 반복 요청은 성공 응답이며 원장을 중복 반영하지 않는다.
- CheckoutOrder는 locked_until·processing_started_at·paid_at·period_end를 기록한다. migration `20261008000000_payment_lifecycle`을 운영 반영 전 검토해야 한다(현재 격리 개발 DB만 적용).
- 스튜디오 finance.summary.refundReserved는 미확인 환불에 필요한 예약액이다. available에서 차감하며, 환불로 잔액이 부족해진 접수 출금은 `PAYOUT_BALANCE_CHANGED`로 이체를 막는다.

미이용 결제 환불 준비(2026-10-21): `GET /api/v1/checkout/:id/refund-eligibility`는 본인 주문의 `{eligible,reason,amount,currency}`를 공통 응답 envelope로 제공한다. `POST /api/v1/checkout/:id/refund`는 서버 기록상 미이용인 결제만 전액 취소하며, 조회 이력·과거 추적 미지원 결제를 거부한다. 프론트 진입은 없다. `/bootstrap?collection=saved|liked`는 해당 컬렉션의 유료 콘텐츠만 노출/소비 기록하고 기본 bootstrap은 유료 본문·미디어를 제외한다. 상세 판정·동시성·예외는 `provider-contracts.md`의 미이용 환불 절을 따른다.
