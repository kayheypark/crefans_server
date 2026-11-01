# 코드에서 추출한 현재 계약

이 문서는 프론트 `npm run docs:contracts`로 재생성한다. `check:docs`가 코드에서 다시 추출해 전체 내용을 비교한다. 추출은 등록된 Nest 컨트롤러의 명시적 decorator와 화면 카탈로그 AST를 사용한다. 실행 중인 운영 서버·DB 적용 상태·공급사 성공의 증거는 아니다.

## 등록된 /api/v1 라우트

| Method | 경로 | 근거 |
| --- | --- | --- |
| GET | `/api/v1/admin/advertising/products` | `src/platform/advertising.controller.ts::products` |
| POST | `/api/v1/admin/advertising/products` | `src/platform/advertising.controller.ts::create` |
| DELETE | `/api/v1/admin/advertising/products/:id` | `src/platform/advertising.controller.ts::remove` |
| PUT | `/api/v1/admin/advertising/products/:id` | `src/platform/advertising.controller.ts::update` |
| POST | `/api/v1/admin/auth/login` | `src/platform/admin-auth.ts::login` |
| POST | `/api/v1/admin/auth/logout` | `src/platform/admin-auth.ts::logout` |
| POST | `/api/v1/admin/auth/refresh` | `src/platform/admin-auth.ts::refresh` |
| POST | `/api/v1/admin/beans/charges/:id/receipt` | `src/platform/beans.controller.ts::receipt` |
| POST | `/api/v1/admin/beans/charges/:id/refund` | `src/platform/beans.controller.ts::refund` |
| GET | `/api/v1/admin/beans/overview` | `src/platform/beans.controller.ts::overview` |
| POST | `/api/v1/admin/beans/promotions` | `src/platform/beans.controller.ts::grant` |
| GET | `/api/v1/admin/beans/receivables` | `src/platform/beans.controller.ts::receivables` |
| POST | `/api/v1/admin/beans/receivables/:id/settle` | `src/platform/beans.controller.ts::settle` |
| GET | `/api/v1/admin/beans/wallets/:id` | `src/platform/beans.controller.ts::wallet` |
| POST | `/api/v1/admin/beans/withdrawals/:id/approve` | `src/platform/beans.controller.ts::approve` |
| POST | `/api/v1/admin/beans/withdrawals/:id/manual-result` | `src/platform/beans.controller.ts::manualResult` |
| POST | `/api/v1/admin/beans/withdrawals/:id/reject` | `src/platform/beans.controller.ts::reject` |
| GET | `/api/v1/admin/categories` | `src/platform/admin.controller.ts::categories` |
| POST | `/api/v1/admin/categories` | `src/platform/admin.controller.ts::category` |
| PUT | `/api/v1/admin/categories/:id` | `src/platform/admin.controller.ts::updateCategory` |
| DELETE | `/api/v1/admin/categories/:id/icon` | `src/platform/admin.controller.ts::resetCategoryIcon` |
| POST | `/api/v1/admin/categories/:id/icon` | `src/platform/admin.controller.ts::categoryIcon` |
| GET | `/api/v1/admin/categories/:id/icon/:version` | `src/platform/admin.controller.ts::categoryImage` |
| PUT | `/api/v1/admin/categories/order` | `src/platform/admin.controller.ts::categoryOrder` |
| POST | `/api/v1/admin/client-errors` | `src/platform/admin.controller.ts::clientError` |
| GET | `/api/v1/admin/comments/:id/moderation` | `src/platform/moderation.ts::commentHistory` |
| POST | `/api/v1/admin/comments/:id/moderation` | `src/platform/moderation.ts::comment` |
| POST | `/api/v1/admin/creators/:id/promotion` | `src/platform/admin.controller.ts::promotion` |
| PUT | `/api/v1/admin/creators/:id/verification` | `src/platform/admin.controller.ts::verification` |
| GET | `/api/v1/admin/dashboard` | `src/platform/admin.controller.ts::dashboard` |
| GET | `/api/v1/admin/documents` | `src/platform/admin.controller.ts::documents` |
| POST | `/api/v1/admin/documents` | `src/platform/admin.controller.ts::document` |
| GET | `/api/v1/admin/financial-policy` | `src/platform/admin.controller.ts::financialPolicy` |
| PUT | `/api/v1/admin/financial-policy` | `src/platform/admin.controller.ts::setFinancialPolicy` |
| GET | `/api/v1/admin/financial-policy/history` | `src/platform/admin.controller.ts::financialPolicyHistory` |
| GET | `/api/v1/admin/inquiries` | `src/platform/admin.controller.ts::inquiries` |
| POST | `/api/v1/admin/inquiries/:id/reply` | `src/platform/admin.controller.ts::reply` |
| GET | `/api/v1/admin/invites` | `src/platform/signup-invites.controller.ts::list` |
| POST | `/api/v1/admin/invites` | `src/platform/signup-invites.controller.ts::create` |
| DELETE | `/api/v1/admin/invites/:id` | `src/platform/signup-invites.controller.ts::revoke` |
| PUT | `/api/v1/admin/invites/:id` | `src/platform/signup-invites.controller.ts::update` |
| GET | `/api/v1/admin/logs` | `src/platform/admin.controller.ts::logs` |
| GET | `/api/v1/admin/logs/:id` | `src/platform/admin.controller.ts::logDetail` |
| POST | `/api/v1/admin/marketing/campaigns` | `src/platform/admin.controller.ts::campaign` |
| GET | `/api/v1/admin/me` | `src/platform/admin.controller.ts::me` |
| POST | `/api/v1/admin/me/password` | `src/platform/admin.controller.ts::password` |
| GET | `/api/v1/admin/me/profile` | `src/platform/admin.controller.ts::profile` |
| PUT | `/api/v1/admin/me/profile` | `src/platform/admin.controller.ts::saveProfile` |
| POST | `/api/v1/admin/me/totp/enable` | `src/platform/admin-totp.ts::enable` |
| POST | `/api/v1/admin/me/totp/setup` | `src/platform/admin-totp.ts::setup` |
| GET | `/api/v1/admin/members` | `src/platform/admin.controller.ts::members` |
| POST | `/api/v1/admin/members/:id/erase` | `src/platform/moderation.ts::erase` |
| POST | `/api/v1/admin/members/:id/referral` | `src/platform/admin.controller.ts::referralLink` |
| GET | `/api/v1/admin/members/:id/suspension` | `src/platform/moderation.ts::memberHistory` |
| POST | `/api/v1/admin/members/:id/suspension` | `src/platform/moderation.ts::member` |
| GET | `/api/v1/admin/members/:id/terms` | `src/platform/signup-invites.controller.ts::terms` |
| PUT | `/api/v1/admin/members/:id/terms` | `src/platform/signup-invites.controller.ts::saveTerms` |
| GET | `/api/v1/admin/operators` | `src/platform/admin.controller.ts::operators` |
| POST | `/api/v1/admin/operators` | `src/platform/admin.controller.ts::createOperator` |
| DELETE | `/api/v1/admin/operators/:id` | `src/platform/admin.controller.ts::deactivateOperator` |
| PUT | `/api/v1/admin/operators/:id` | `src/platform/admin.controller.ts::updateOperator` |
| POST | `/api/v1/admin/operators/:id/password-reset` | `src/platform/admin.controller.ts::resetOperator` |
| GET | `/api/v1/admin/overview` | `src/platform/admin.controller.ts::overview` |
| GET | `/api/v1/admin/payments` | `src/platform/admin.controller.ts::payments` |
| GET | `/api/v1/admin/posts` | `src/platform/admin.controller.ts::posts` |
| GET | `/api/v1/admin/posts/:id/moderation` | `src/platform/moderation.ts::postHistory` |
| POST | `/api/v1/admin/posts/:id/moderation` | `src/platform/moderation.ts::post` |
| POST | `/api/v1/admin/posts/:id/review` | `src/platform/moderation.ts::review` |
| GET | `/api/v1/admin/referrals` | `src/platform/admin.controller.ts::referrals` |
| PUT | `/api/v1/admin/referrals/settings` | `src/platform/admin.controller.ts::referralSettings` |
| GET | `/api/v1/admin/reports` | `src/platform/admin.controller.ts::reports` |
| POST | `/api/v1/admin/reports/:id/resolve` | `src/platform/admin.controller.ts::resolve` |
| GET | `/api/v1/admin/revenue` | `src/platform/admin.controller.ts::revenue` |
| POST | `/api/v1/admin/revenue/:id/receipt` | `src/platform/admin.controller.ts::receipt` |
| GET | `/api/v1/admin/settlement-accounts` | `src/platform/admin.controller.ts::settlementAccounts` |
| POST | `/api/v1/admin/settlement-accounts/:id/verify` | `src/platform/admin.controller.ts::verifyAccount` |
| GET | `/api/v1/admin/withdrawals` | `src/platform/admin.controller.ts::withdrawals` |
| POST | `/api/v1/admin/withdrawals/:id/manual-result` | `src/platform/admin.controller.ts::manualResult` |
| POST | `/api/v1/auth/forgot-password` | `src/platform/auth.controller.ts::forgot` |
| POST | `/api/v1/auth/identity` | `src/platform/auth.controller.ts::identity` |
| POST | `/api/v1/auth/login` | `src/platform/auth.controller.ts::login` |
| POST | `/api/v1/auth/logout` | `src/platform/auth.controller.ts::logout` |
| POST | `/api/v1/auth/refresh` | `src/platform/auth.controller.ts::refresh` |
| POST | `/api/v1/auth/reset-password` | `src/platform/auth.controller.ts::reset` |
| POST | `/api/v1/auth/signup` | `src/platform/auth.controller.ts::signup` |
| POST | `/api/v1/auth/signup/email/request` | `src/platform/auth.controller.ts::request` |
| POST | `/api/v1/auth/signup/email/verify` | `src/platform/auth.controller.ts::verify` |
| POST | `/api/v1/beans/charges` | `src/platform/beans.controller.ts::create` |
| GET | `/api/v1/beans/charges/:id` | `src/platform/beans.controller.ts::charge` |
| POST | `/api/v1/beans/charges/:id/confirm` | `src/platform/beans.controller.ts::confirm` |
| POST | `/api/v1/beans/charges/:id/payment-window` | `src/platform/beans.controller.ts::window` |
| POST | `/api/v1/beans/charges/:id/refund` | `src/platform/beans.controller.ts::refund` |
| GET | `/api/v1/beans/charges/:id/refund-quote` | `src/platform/beans.controller.ts::refundQuote` |
| GET | `/api/v1/beans/tips` | `src/platform/beans.controller.ts::tips` |
| GET | `/api/v1/beans/wallet` | `src/platform/beans.controller.ts::wallet` |
| POST | `/api/v1/beans/webhook` | `src/platform/beans.controller.ts::webhook` |
| GET | `/api/v1/billing/config` | `src/platform/finance.controller.ts::config` |
| POST | `/api/v1/billing/methods` | `src/platform/finance.controller.ts::method` |
| PUT | `/api/v1/billing/methods/:id` | `src/platform/finance.controller.ts::methodState` |
| POST | `/api/v1/billing/registrations` | `src/platform/finance.controller.ts::registration` |
| GET | `/api/v1/bootstrap` | `src/platform/controller.ts::bootstrap` |
| GET | `/api/v1/categories/:id/icon/:version` | `src/platform/controller.ts::categoryIcon` |
| POST | `/api/v1/checkout` | `src/platform/finance.controller.ts::checkout` |
| GET | `/api/v1/checkout/:id` | `src/platform/finance.controller.ts::order` |
| POST | `/api/v1/checkout/:id/confirm` | `src/platform/finance.controller.ts::confirm` |
| POST | `/api/v1/checkout/:id/pay` | `src/platform/finance.controller.ts::pay` |
| POST | `/api/v1/checkout/:id/payment-window` | `src/platform/finance.controller.ts::window` |
| POST | `/api/v1/checkout/:id/refund` | `src/platform/finance.controller.ts::refund` |
| GET | `/api/v1/checkout/:id/refund-eligibility` | `src/platform/finance.controller.ts::refundEligibility` |
| POST | `/api/v1/checkout/:id/retry` | `src/platform/finance.controller.ts::retry` |
| GET | `/api/v1/common` | `src/platform/controller.ts::common` |
| GET | `/api/v1/creators` | `src/platform/controller.ts::creators` |
| POST | `/api/v1/creators/:id/tips` | `src/platform/beans.controller.ts::tip` |
| GET | `/api/v1/health` | `src/platform/controller.ts::health` |
| POST | `/api/v1/identity/callback` | `src/platform/identity.controller.ts::callback` |
| POST | `/api/v1/identity/start` | `src/platform/identity.controller.ts::start` |
| POST | `/api/v1/identity/status` | `src/platform/identity.controller.ts::status` |
| GET | `/api/v1/marketing/unsubscribe` | `src/platform/marketing.controller.ts::confirmation` |
| POST | `/api/v1/marketing/unsubscribe` | `src/platform/marketing.controller.ts::unsubscribe` |
| POST | `/api/v1/me/email/confirm` | `src/platform/controller.ts::emailConfirm` |
| POST | `/api/v1/me/email/request` | `src/platform/controller.ts::emailRequest` |
| GET | `/api/v1/me/handle-availability` | `src/platform/controller.ts::handleAvailability` |
| POST | `/api/v1/me/inquiries` | `src/platform/controller.ts::inquiry` |
| PUT | `/api/v1/me/profile` | `src/platform/controller.ts::profile` |
| PUT | `/api/v1/me/profile/photos` | `src/platform/controller.ts::profilePhotos` |
| GET | `/api/v1/me/referral` | `src/platform/controller.ts::referral` |
| GET | `/api/v1/me/referral/history` | `src/platform/controller.ts::referralHistoryList` |
| PUT | `/api/v1/me/settings` | `src/platform/controller.ts::settings` |
| POST | `/api/v1/me/withdraw` | `src/platform/controller.ts::withdraw` |
| POST | `/api/v1/media` | `src/platform/media.controller.ts::upload` |
| GET | `/api/v1/media/:id/edge-authorize` | `src/platform/media.controller.ts::edgeAuthorize` |
| GET | `/api/v1/media/:id/file` | `src/platform/media.controller.ts::download` |
| GET | `/api/v1/media/:id/origin-file` | `src/platform/media.controller.ts::originDownload` |
| GET | `/api/v1/media/:id/status` | `src/platform/media.controller.ts::status` |
| PUT | `/api/v1/members/:id/block` | `src/platform/controller.ts::block` |
| PUT | `/api/v1/members/:id/follow` | `src/platform/controller.ts::follow` |
| POST | `/api/v1/members/:id/messages` | `src/platform/controller.ts::message` |
| PUT | `/api/v1/members/:id/messages/read` | `src/platform/controller.ts::readMessages` |
| PUT | `/api/v1/notifications/read` | `src/platform/controller.ts::read` |
| GET | `/api/v1/posts` | `src/platform/controller.ts::posts` |
| GET | `/api/v1/posts/:id` | `src/platform/controller.ts::post` |
| GET | `/api/v1/posts/:id/comments` | `src/platform/controller.ts::comments` |
| POST | `/api/v1/posts/:id/comments` | `src/platform/controller.ts::comment` |
| GET | `/api/v1/posts/:id/comments-page` | `src/platform/controller.ts::commentPage` |
| DELETE | `/api/v1/posts/:id/comments/:commentId` | `src/platform/controller.ts::deleteComment` |
| PUT | `/api/v1/posts/:id/comments/:commentId` | `src/platform/controller.ts::editComment` |
| PUT | `/api/v1/posts/:id/like` | `src/platform/controller.ts::like` |
| GET | `/api/v1/posts/:id/mention-candidates` | `src/platform/controller.ts::mentionCandidates` |
| PUT | `/api/v1/posts/:id/save` | `src/platform/controller.ts::save` |
| GET | `/api/v1/profiles/:id` | `src/platform/controller.ts::profileData` |
| GET | `/api/v1/profiles/:id/connections` | `src/platform/controller.ts::profileConnections` |
| GET | `/api/v1/profiles/:id/following` | `src/platform/controller.ts::profileFollowing` |
| POST | `/api/v1/reports` | `src/platform/controller.ts::report` |
| GET | `/api/v1/session` | `src/platform/controller.ts::session` |
| POST | `/api/v1/studio/accounts` | `src/platform/finance.controller.ts::account` |
| PUT | `/api/v1/studio/accounts/:id/default` | `src/platform/finance.controller.ts::defaultAccount` |
| POST | `/api/v1/studio/accounts/:id/verify` | `src/platform/finance.controller.ts::verifyAccount` |
| PUT | `/api/v1/studio/activity` | `src/platform/studio.controller.ts::activity` |
| GET | `/api/v1/studio/advertising/products` | `src/platform/advertising.controller.ts::products` |
| GET | `/api/v1/studio/bean-finance` | `src/platform/beans.controller.ts::studio` |
| POST | `/api/v1/studio/bean-withdrawal-quotes` | `src/platform/beans.controller.ts::review` |
| POST | `/api/v1/studio/bean-withdrawals` | `src/platform/beans.controller.ts::withdraw` |
| POST | `/api/v1/studio/bean-withdrawals/verify` | `src/platform/beans.controller.ts::verify` |
| PUT | `/api/v1/studio/comments-setting` | `src/platform/studio.controller.ts::comments` |
| PUT | `/api/v1/studio/comments/:id` | `src/platform/studio.controller.ts::moderate` |
| DELETE | `/api/v1/studio/comments/:id/replies/:replyId` | `src/platform/studio.controller.ts::deleteReply` |
| PUT | `/api/v1/studio/comments/:id/replies/:replyId` | `src/platform/studio.controller.ts::updateReply` |
| POST | `/api/v1/studio/comments/:id/reply` | `src/platform/studio.controller.ts::reply` |
| GET | `/api/v1/studio/community` | `src/platform/studio.controller.ts::community` |
| POST | `/api/v1/studio/content` | `src/platform/studio.controller.ts::saveContent` |
| POST | `/api/v1/studio/content/:id/delete` | `src/platform/studio.controller.ts::deleteContent` |
| GET | `/api/v1/studio/finance` | `src/platform/finance.controller.ts::financeData` |
| POST | `/api/v1/studio/memberships` | `src/platform/studio.controller.ts::membership` |
| PUT | `/api/v1/studio/memberships/:id` | `src/platform/studio.controller.ts::state` |
| GET | `/api/v1/studio/overview` | `src/platform/studio.controller.ts::overview` |
| POST | `/api/v1/studio/pin` | `src/platform/finance.controller.ts::pin` |
| PUT | `/api/v1/studio/profile` | `src/platform/studio.controller.ts::profile` |
| GET | `/api/v1/studio/reports/:id` | `src/platform/studio.controller.ts::report` |
| POST | `/api/v1/studio/start` | `src/platform/studio.controller.ts::start` |
| GET | `/api/v1/studio/tips` | `src/platform/beans.controller.ts::received` |
| POST | `/api/v1/studio/withdraw` | `src/platform/finance.controller.ts::withdraw` |
| POST | `/api/v1/studio/withdraw/review` | `src/platform/finance.controller.ts::review` |
| POST | `/api/v1/studio/withdraw/verify` | `src/platform/finance.controller.ts::verifyPin` |
| POST | `/api/v1/subscriptions/:creator/cancel` | `src/platform/finance.controller.ts::cancel` |
| POST | `/api/v1/telemetry/browser-errors` | `src/platform/telemetry.controller.ts::report` |

GET 라우트의 Express HEAD 처리 및 OPTIONS/CORS는 별도 명시 decorator 목록에 추가하지 않는다. 바이너리 미디어 예외와 권한 의미는 [API 계약](./platform-api.md)을 따른다.

## 목업 카탈로그 전체

| 경로 | 메뉴명 |
| --- | --- |
| `/preview/beans` | 지갑 |
| `/preview/beans/referral` | 친구 초대 이벤트 |
| `/preview/beans/charges` | 충전 내역 |
| `/preview/beans/history` | 콩 내역 |
| `/preview/beans/tips` | 후원 내역 |
| `/preview/beans/charge` | 콩 충전 |
| `/preview/beans/success` | 콩 충전 완료 |
| `/preview/landing` | 랜딩페이지 |
| `/preview/explore` | 탐색하기 |
| `/preview/creator/haneul` | 크리에이터 프로필 |
| `/preview/membership/haneul` | 멤버십 구독 |
| `/preview/signup` | 회원가입 |
| `/preview/login` | 로그인 |
| `/preview/feed` | 홈 |
| `/preview/post/behind?locked=1` | 게시물 상세 |
| `/preview/messages` | 메시지 |
| `/preview/notifications` | 알림 |
| `/preview/me` | 내 프로필 |
| `/preview/subscriptions` | 내 구독 |
| `/preview/settings` | 설정 |
| `/preview/support` | 고객센터 |
| `/preview/following` | 팔로잉 목록 |
| `/preview/followers` | 팔로워 목록 |
| `/preview/payment-methods` | 결제수단 관리 |
| `/preview/studio/advertising` | 광고상품 |
| `/preview/studio/beans` | 콩 후원·출금 |
| `/preview/studio` | 대시보드 |
| `/preview/studio/start` | 크리에이터 시작하기 |
| `/preview/studio/content` | 게시물 |
| `/preview/studio/content/new` | 게시물 작성 |
| `/preview/studio/memberships` | 멤버십 |
| `/preview/studio/subscribers` | 구독자 |
| `/preview/studio/messages` | 메시지 |
| `/preview/studio/comments` | 댓글 |
| `/preview/studio/analytics` | 통계 요약 |
| `/preview/studio/reports/revenue` | 순수익 리포트 |
| `/preview/studio/reports/subscribers` | 구독자 리포트 |
| `/preview/studio/reports/followers` | 팔로워 리포트 |
| `/preview/studio/earnings` | 수익 현황 |
| `/preview/studio/settlements` | 정산 내역 |
| `/preview/studio/withdraw` | 출금 신청 |
| `/preview/studio/withdrawals` | 출금 내역 |
| `/preview/studio/accounts` | 정산 계좌 |
| `/preview/studio/security` | 출금 PIN 설정 |
| `/preview/studio/settings` | 크리에이터 설정 |
| `/preview/events` | 이벤트 안내 |
| `/preview/events/feedback` | 네이버페이 1만원 상품권 이벤트 |
| `/preview/events/creator-advertising` | 주목할 크리에이터 광고상품 30일 이벤트 |
| `/preview/events/promotion-beans` | 프로모션 100콩 이벤트 |
| `/preview/events/founding-badge` | 원년멤버 한정판 뱃지 이벤트 |
| `/preview/guide/fan` | 팬 이용안내 |
| `/preview/guide/creator` | 크리에이터 이용안내 |
| `/preview/reset-password` | 비밀번호 재설정 |
| `/preview/notices` | 공지사항 |
| `/preview/legal/terms` | 이용약관 |
| `/preview/legal/privacy` | 개인정보처리방침 |
| `/preview/legal/policy` | 운영정책 |

카탈로그에 없는 편집/상세/query 변형은 프론트 화면 검수 문서의 추가 경로와 라우터가 기준이다. 이 목록 자체가 모든 동적 URL의 존재 검증은 아니다.

## 환경 템플릿 키와 npm 명령

실제 `.env`/비밀 runtime 파일은 읽거나 값/해시를 수집하지 않는다. 아래는 예시 파일의 키 이름만이다. 런타임의 모든 선택적 환경변수 목록과 같다고 가정하지 않는다.

### front

환경 키: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `NEXT_PUBLIC_LANDING_USE_ASSETS`, `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`, `CREFANS_PREVIEW_LOGIN_HASH`

| 명령 | package.json 실행문 |
| --- | --- |
| `npm run dev` | `next dev` |
| `npm run build` | `next build` |
| `npm run start` | `next start` |
| `npm run check:layers` | `node scripts/check-layers.cjs` |
| `npm run typecheck` | `tsc --noEmit --incremental false` |
| `npm run test` | `node --test tests/*.test.cjs` |
| `npm run check` | `npm run check:layers && npm run typecheck && npm test` |
| `npm run test:e2e` | `playwright test` |
| `npm run test:e2e:ui` | `playwright test --ui` |
| `npm run test:e2e:headed` | `playwright test --headed` |
| `npm run test:e2e:report` | `playwright show-report` |
| `npm run test:e2e:install` | `playwright install chromium` |
| `npm run check:docs` | `python3 scripts/check-docs.py` |
| `npm run docs:contracts` | `python3 scripts/check-docs.py --contracts` |
| `npm run docs:record` | `python3 scripts/check-docs.py --record` |
| `npm run docs:prove` | `python3 scripts/check-docs.py --prove` |
| `npm run test:docs` | `python3 scripts/check-docs.py --self-test` |

### server

환경 키: `DATABASE_URL`, `AUTH_PROVIDER`, `LOCAL_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `HOST`, `PORT`, `NODE_ENV`, `FRONTEND_ORIGINS`, `ADMIN_ORIGINS`, `PUBLIC_API_ORIGIN`, `MEDIA_ROOT`, `MEMBER_MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PLATFORM_FEE_BPS`, `SETTLEMENT_HOLD_DAYS`, `REFUND_WINDOW_DAYS`, `RENEWAL_MAX_RETRIES`, `RENEWAL_RETRY_HOURS`, `SIGNUP_IDENTITY_MODE`, `SIGNUP_EMAIL_ALLOWLIST`, `PASS_ADAPTER_URL`, `PASS_ADAPTER_SECRET`, `PASS_CALLBACK_SECRET`, `BANK_ADAPTER_URL`, `BANK_ADAPTER_SECRET`, `BANK_PAYOUTS_ENABLED`, `MEDIA_ORPHAN_GRACE_DAYS`, `MEDIA_DELETE_ENABLED`, `MEDIA_STORAGE`, `S3_MEDIA_BUCKET`, `MEDIA_EDGE_SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_UPLOAD_BUCKET`, `S3_PROCESSED_BUCKET`, `TELEGRAM_OPERATIONS_BOT_TOKEN`, `TELEGRAM_OPERATIONS_CHAT_ID`, `TRUSTED_PROXY_IPS`, `APP_ENV`, `ACCESS_LOG_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `APP_RELEASE`, `OPERATIONS_WATCHDOG_ENABLED`, `BETA_MODE`, `MARKETING_MAIL_ENABLED`, `MARKETING_PUBLIC_ORIGIN`, `MARKETING_UNSUBSCRIBE_SECRET`, `BEAN_LEDGER_ENABLED`, `BEAN_LIVE_PAYMENTS_APPROVED`, `CREFANS_PREVIEW_LOGIN_HASH`

| 명령 | package.json 실행문 |
| --- | --- |
| `npm run build` | `nest build` |
| `npm run start` | `node dist/src/main.js` |
| `npm run dev` | `ts-node src/main.ts` |
| `npm run test` | `echo "Error: no test specified" && exit 1` |
| `npm run test:auth` | `node --test tests/local-members.test.cjs` |
| `npm run members:export` | `ts-node scripts/export-cognito-members.ts` |
| `npm run members:import` | `ts-node scripts/migrate-members.ts` |
| `npm run members:audit` | `ts-node scripts/audit-members.ts` |
| `npm run dev:platform` | `node scripts/platform-dev.cjs` |
| `npm run start:platform` | `node dist/src/platform/main.js` |
| `npm run worker:platform` | `node dist/src/platform/worker.js` |
| `npm run test:platform` | `CREFANS_E2E=true node --test tests/platform.integration.test.cjs tests/platform-access.integration.test.cjs` |
| `npm run test:platform:domain` | `CREFANS_E2E=true node --test tests/platform-auth.test.cjs tests/platform-finance.test.cjs tests/platform-jobs.test.cjs tests/platform-billing.test.cjs tests/platform-payment-lifecycle.test.cjs tests/platform-payment-http.test.cjs tests/platform-provider-lifecycle.test.cjs tests/platform-provider-http.test.cjs tests/platform-financial-policy.test.cjs` |
| `npm run platform:audit` | `node scripts/platform-audit.cjs` |
| `npm run platform:admin` | `node scripts/platform-admin.cjs` |
| `npm run test:mail` | `npm run build && CREFANS_E2E=true node --test tests/mail-templates.test.cjs tests/platform-mail.integration.test.cjs tests/platform-auth.test.cjs tests/platform-provider-lifecycle.test.cjs tests/platform-provider-http.test.cjs` |
| `npm run dev:billing` | `npm run build && node scripts/platform-billing-test.cjs` |
| `npm run test:policy` | `npm run build && CREFANS_E2E=true node --test tests/platform-financial-policy.test.cjs` |
| `npm run test:operations` | `CREFANS_E2E=true node --test --test-concurrency=1 tests/platform-security.test.cjs tests/platform-operations.test.cjs tests/platform-operations-events.test.cjs tests/platform-operations-http.test.cjs tests/platform-billing-activity.test.cjs` |
| `npm run test:audit` | `npm run build && CREFANS_E2E=true node --test --test-concurrency=1 tests/platform-audit.test.cjs tests/platform-audit-export.test.cjs tests/platform-external-monitor.test.cjs tests/platform-log-config.test.cjs tests/platform-security.test.cjs tests/platform-operations.test.cjs tests/platform-operations-events.test.cjs tests/platform-operations-http.test.cjs` |
| `npm run test:openapi` | `npm run build && CREFANS_E2E=true node --test tests/platform-openapi.test.cjs` |
| `npm run test:beans` | `npm run build && CREFANS_E2E=true node --test --test-concurrency=1 tests/platform-beans.test.cjs tests/platform-bean-ledger.test.cjs tests/platform-openapi.test.cjs` |

## migration 파일 목록

- `0_init`
- `20260910000000_local_members`
- `20261007000000_platform_v1`
- `20261007010000_platform_hardening`
- `20261007020000_platform_jobs`
- `20261007030000_platform_completion`
- `20261007040000_platform_audit`
- `20261007050000_platform_age_gate`
- `20261007060000_billing_registration`
- `20261008000000_payment_lifecycle`
- `20261021070000_unused_content_refund`
- `20261021080000_db_financial_policy`
- `20261021160000_platform_security_ip`
- `20261021161000_operational_events`
- `20261022020000_audit_logs`
- `20261022030000_billing_recovery`
- `20261024120000_creator_verification`
- `20261025100000_beta_policy`
- `20261025110000_marketing_delivery_claim`
- `20261025120000_bean_ledger`
- `20261025130000_bean_product`
- `20261026090000_post_supporters`
- `20261026100000_profile_connections`
- `20261026110000_post_tip_setting`
- `20261026120000_tip_attribution`
- `20261028120000_admin_permissions`
- `20261028150000_admin_accounts`
- `20261029020000_ad_products`
- `20261029120000_signup_invites`
- `20261029150000_creator_term_changes`
- `20261029180000_moderation`
- `20261029190000_report_privacy_reason`
- `20261030090000_post_review`
- `20261030100000_member_purge`
- `20261030110000_backfill_withdrawn`
- `20261030140000_comment_edited`
- `20261030200000_pilot_followups`
- `20261030230000_admin_totp`
- `20261031180000_unify_handles`
- `20261031230000_profile_cover`
- `20261101090000_referrals`
- `20261101120000_referral_hold`
- `20261101150000_media_watermark`
- `20261101150000_platform_settings`

## Prisma 전체 정의 (86 models · 15 enums)

아래는 `prisma/schema.prisma` 원문이다. 필드·관계·제약·인덱스를 생략하지 않는다. 기존 모델의 Cognito 주석은 과거 호환 필드 이름이며 플랫폼 인증 방식은 Member 자체 세션이다. 배포된 DB 스키마와 일치하는지는 대상 DB에서 별도 검증한다.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

/// 사용자 프로필
/// 사용자의 추가 프로필 정보를 관리
model UserProfile {
  /// 사용자 ID (Cognito의 userSub)
  user_id    String   @id
  /// 소개글
  bio        String?  @db.Text
  /// 프로필 배경 사진(media original_url). 크리에이터는 creators.cover 와 같은 값
  cover      String?  @db.Text
  /// 생성 일시
  created_at DateTime @default(now())
  /// 수정 일시
  updated_at DateTime @updatedAt

  @@map("user_profiles")
}

/// 토큰 타입 정의
/// 시스템에서 사용되는 모든 토큰의 타입을 관리
model TokenType {
  /// 토큰 타입 고유 식별자
  id          String               @id @default(uuid())
  /// 토큰 심볼
  symbol      String               @unique
  /// 토큰 타입 이름
  name        String
  /// 토큰 설명
  description String?
  /// 생성 일시
  created_at  DateTime             @default(now())
  /// 수정 일시
  updated_at  DateTime             @updatedAt
  /// 토큰 가격 (KRW 기준)
  price       Decimal              @db.Decimal(18, 4)
  payments    PaymentTransaction[]
  transfers   Transfer[]
  wallets     Wallet[]

  @@map("token_types")
}

/// 토큰 지갑
/// 실제 토큰이 보관되는 지갑
model Wallet {
  /// 지갑 고유 식별자
  id             String            @id @default(uuid())
  /// 지갑 주소 (UUID)
  address        String            @unique
  /// 토큰 타입 ID
  token_type_id  String
  /// 보유 수량
  amount         Decimal           @default(0.0000) @db.Decimal(18, 4)
  /// 생성 일시
  created_at     DateTime          @default(now())
  /// 수정 일시
  updated_at     DateTime          @updatedAt
  transfers_from Transfer[]        @relation("FromWallet")
  transfers_to   Transfer[]        @relation("ToWallet")
  ownerships     WalletOwnership[]
  token_type     TokenType         @relation(fields: [token_type_id], references: [id])

  @@index([token_type_id], map: "wallets_token_type_id_fkey")
  @@map("wallets")
}

/// 지갑 소유권
/// 지갑의 소유권 정보를 관리
model WalletOwnership {
  /// 소유권 고유 식별자
  id         String    @id @default(uuid())
  /// 지갑 ID
  wallet_id  String
  /// 소유자 아이디 (Cognito의 userSub)
  owner_id   String
  /// 소유권 시작 일시
  started_at DateTime  @default(now())
  /// 소유권 종료 일시 (null인 경우 현재 소유 중)
  ended_at   DateTime?
  /// 생성 일시
  created_at DateTime  @default(now())
  /// 수정 일시
  updated_at DateTime  @updatedAt
  wallet     Wallet    @relation(fields: [wallet_id], references: [id])

  @@unique([wallet_id, owner_id, started_at])
  @@map("wallet_ownerships")
}

model Transfer {
  /// 전송 고유 식별자
  id                  String        @id @default(uuid())
  /// 트랜잭션 해시 (UUID)
  tx_hash             String        @unique
  /// 토큰 타입 ID
  token_type_id       String
  /// 전송 수량
  amount              Decimal       @db.Decimal(18, 4)
  /// 전송 사유
  reason              Int           @db.TinyInt
  /// 관련 엔티티 ID (예: 상품 ID)
  reference_id        String?
  /// 전송 상태
  status              CommonStatus  @default(PENDING)
  /// 생성 일시
  created_at          DateTime      @default(now())
  /// 수정 일시
  updated_at          DateTime      @updatedAt
  /// 전송 후 잔액 (송신자)
  from_balance_after  Decimal       @db.Decimal(18, 4)
  /// 전송 전 잔액 (송신자)
  from_balance_before Decimal       @db.Decimal(18, 4)
  /// 전송 후 잔액 (수신자)
  to_balance_after    Decimal       @db.Decimal(18, 4)
  /// 전송 전 잔액 (수신자)
  to_balance_before   Decimal       @db.Decimal(18, 4)
  subscription_id     String?
  transfer_reason_id  String
  /// 송신 지갑 주소
  from_wallet_address String
  /// 수신 지갑 주소
  to_wallet_address   String
  from_wallet         Wallet        @relation("FromWallet", fields: [from_wallet_address], references: [address])
  subscription        Subscription? @relation(fields: [subscription_id], references: [id])
  to_wallet           Wallet        @relation("ToWallet", fields: [to_wallet_address], references: [address])
  token_type          TokenType     @relation(fields: [token_type_id], references: [id])

  @@index([from_wallet_address], map: "transfers_from_wallet_address_fkey")
  @@index([subscription_id], map: "transfers_subscription_id_fkey")
  @@index([to_wallet_address], map: "transfers_to_wallet_address_fkey")
  @@index([token_type_id], map: "transfers_token_type_id_fkey")
  @@map("transfers")
}

/// 크리에이터 카테고리
/// 크리에이터의 분류를 위한 카테고리 정보 (관리자 페이지에서 관리)
model CreatorCategory {
  /// 카테고리 고유 식별자
  id          String    @id @default(uuid())
  /// 카테고리 이름
  name        String    @unique
  /// 카테고리 설명
  description String?   @db.Text
  /// 카테고리 색상 코드 (예: #FF5722)
  color_code  String?   @db.VarChar(7)
  /// 카테고리 이모지/아이콘
  icon        String?
  /// 정렬 순서
  sort_order  Int       @default(0)
  /// 활성 상태
  is_active   Boolean   @default(true)
  /// 삭제 여부
  is_deleted  Boolean   @default(false)
  /// 삭제 일시
  deleted_at  DateTime?
  /// 생성 일시
  created_at  DateTime  @default(now())
  /// 수정 일시
  updated_at  DateTime  @updatedAt
  creators    Creator[]

  @@index([sort_order])
  @@index([is_active])
  @@map("creator_categories")
}

/// 크리에이터 정보
/// 크리에이터로 전환한 사용자의 정보를 관리
model Creator {
  /// 크리에이터 고유 식별자
  id          String           @id @default(uuid())
  /// 사용자 ID (Cognito의 userSub)
  user_id     String           @unique
  /// 활성 상태
  is_active   Boolean          @default(true)
  /// 크리에이터 전환 일시
  created_at  DateTime         @default(now())
  /// 수정 일시
  updated_at  DateTime         @updatedAt
  /// 카테고리 ID (선택사항)
  category_id String?
  display_name String?
  handle String? @unique
  bio String? @db.Text
  about String? @db.Text
  links Json?
  avatar String? @db.Text
  cover String? @db.Text
  comments_enabled Boolean @default(true)
  promoted Boolean @default(false)
  /// Administrator-issued creator badge; independent of identity verification.
  is_verified Boolean @default(false)
  category    CreatorCategory? @relation(fields: [category_id], references: [id])

  @@index([category_id])
  @@map("creators")
}

/// 전송사유타입(초기 데이터인 seed 있음)
model TransferReason {
  /// 전송사유 고유 식별자
  id          String   @id @default(uuid())
  /// 전송사유 이름
  name        String
  /// 전송사유 설명
  description String?
  /// 생성 일시
  created_at  DateTime @default(now())
  /// 수정 일시
  updated_at  DateTime @updatedAt

  @@map("transfer_reasons")
}

/// 멤버십 상품
/// 크리에이터가 판매하는 멤버십 상품 정보를 관리
model MembershipItem {
  /// 멤버십 상품 고유 식별자
  id             String         @id @default(uuid())
  /// 멤버십 상품 이름
  name           String
  /// 멤버십 레벨 (차등 열람을 위한 등급)
  level          Int            @default(1)
  /// 크리에이터 ID (Cognito의 userSub)
  creator_id     String
  /// 가격 (KRW 기준)
  price          Decimal        @db.Decimal(18, 4)
  /// 반복 결제 단위
  billing_unit   PeriodUnit
  /// 반복 결제 주기 상수 (예: 1개월, 3개월, 1년)
  billing_period Int            @default(1)
  /// 무료 체험 기간 단위
  trial_unit     PeriodUnit     @default(DAY)
  /// 무료 체험 기간 상수 (예: 7일, 1개월)
  trial_period   Int?           @default(0)
  /// 생성 일시
  created_at     DateTime       @default(now())
  /// 수정 일시
  updated_at     DateTime       @updatedAt
  /// 멤버십 혜택 (콤마로 구분된 문자열)
  benefits       String         @db.Text
  /// 삭제 일시
  deleted_at     DateTime?
  /// 멤버십 설명
  description    String?        @db.Text
  /// 활성 상태
  is_active      Boolean        @default(true)
  /// 삭제 여부
  is_deleted     Boolean        @default(false)
  image String? @db.Text
  version Int @default(1)
  subscriptions  Subscription[]

  @@index([creator_id])
  @@index([creator_id, level], map: "membership_items_creator_level_idx")
  @@map("membership_items")
}

/// 구독 정보
/// 크리에이터와 구독자 간의 구독 관계를 관리
model Subscription {
  /// 구독 고유 식별자
  id                    String               @id @default(uuid())
  /// 구독자 ID (Cognito의 userSub)
  subscriber_id         String
  /// 구독 시작 일시
  started_at            DateTime             @default(now())
  /// 구독 종료 일시 (null인 경우 현재 구독 중)
  ended_at              DateTime?
  /// 구독 상태
  status                SubscriptionStatus   @default(ONGOING)
  /// 구독 금액
  amount                Decimal              @db.Decimal(18, 4)
  plan_snapshot Json?
  billing_method_id String?
  /// 자동 갱신 여부 (유저가 구독 취소시 자동 갱신여부가 false로 업데이트됨)
  auto_renew            Boolean              @default(true)
  /// 생성 일시
  created_at            DateTime             @default(now())
  /// 수정 일시
  updated_at            DateTime             @updatedAt
  membership_item_id    String
  /// TossPayments 빌링키
  billing_key           String?
  /// 마지막 결제일
  last_payment_date     DateTime?
  /// 다음 결제 예정일
  next_billing_date     DateTime?
  /// 결제 실패 횟수
  payment_failure_count Int                  @default(0)
  payment_transactions  PaymentTransaction[]
  membership_item       MembershipItem       @relation(fields: [membership_item_id], references: [id])
  transfers             Transfer[]

  @@unique([subscriber_id, membership_item_id, started_at])
  @@index([membership_item_id], map: "subscriptions_membership_item_id_fkey")
  @@map("subscriptions")
}

/// 미디어
/// 포스팅에 첨부되는 미디어 파일 정보
model Media {
  /// 미디어 고유 식별자
  id                String            @id @default(uuid())
  /// 미디어 타입
  type              MediaType
  /// 원본 파일명
  original_name     String
  /// 저장된 파일명
  file_name         String
  /// 파일 경로 (legacy)
  file_path         String?
  /// 파일 크기 (bytes)
  file_size         Int
  /// MIME 타입
  mime_type         String
  /// 썸네일 경로 (legacy)
  thumbnail_path    String?
  /// 메타데이터 (JSON)
  metadata          Json?
  /// 삭제 여부
  is_deleted        Boolean           @default(false)
  /// 삭제 일시
  deleted_at        DateTime?
  /// 생성 일시
  created_at        DateTime          @default(now())
  /// 수정 일시
  updated_at        DateTime          @updatedAt
  /// 원본 파일 URL
  original_url      String
  /// 처리 완료 일시
  processed_at      DateTime?
  /// 처리된 파일 URL들 (JSON)
  processed_urls    Json?
  /// 처리 작업 ID (MediaConvert Job ID)
  processing_job_id String?
  /// 처리 상태
  processing_status ProcessingStatus  @default(UPLOADING)
  /// S3 처리된 키들 (JSON)
  s3_processed_keys Json?
  /// S3 업로드 키
  s3_upload_key     String
  /// 썸네일 URL들 (JSON)
  thumbnail_urls    Json?
  /// 소유자 ID (Cognito userSub)
  user_sub          String
  /// 재생 길이 (초 단위, 비디오만 해당)
  duration          Float?
  deleteQueue       MediaDeleteQueue?
  postings          PostingMedia[]

  @@map("medias")
}

/// 포스팅 조회 이력
/// 포스팅의 조회 이력을 관리
model PostingView {
  /// 조회 이력 고유 식별자
  id         String   @id @default(uuid())
  /// 포스팅 ID
  posting_id String
  /// 조회자 ID (Cognito의 userSub)
  viewer_id  String?
  /// 조회자 IP
  viewer_ip  String?
  /// 조회자 User Agent
  viewer_ua  String?
  /// 생성 일시
  created_at DateTime @default(now())
  posting    Posting  @relation(fields: [posting_id], references: [id])

  @@unique([posting_id, viewer_id, viewer_ip])
  @@map("posting_views")
}

/// 포스팅
/// 크리에이터가 작성하는 게시글
model Posting {
  /// 포스팅 고유 식별자
  id                        String         @id @default(uuid())
  /// 제목
  title                     String
  /// 내용
  content                   String         @db.Text
  /// 상태
  status                    PostingStatus  @default(DRAFT)
  /// 멤버십 전용 여부
  is_membership             Boolean        @default(false)
  /// 멤버십 레벨 (멤버십 전용인 경우)
  membership_level          Int?
  /// 공개 시작 일시
  publish_start_at          DateTime?
  /// 공개 종료 일시
  publish_end_at            DateTime?
  /// 전체 조회수
  total_view_count          Int            @default(0)
  /// 고유 조회수
  unique_view_count         Int            @default(0)
  /// 좋아요 수
  like_count                Int            @default(0)
  /// 댓글 수
  comment_count             Int            @default(0)
  /// 발행 일시
  published_at              DateTime?
  /// 보관 일시
  archived_at               DateTime?
  /// 삭제 여부
  is_deleted                Boolean        @default(false)
  /// 삭제 일시
  deleted_at                DateTime?
  /// 생성 일시
  created_at                DateTime       @default(now())
  /// 수정 일시
  updated_at                DateTime       @updatedAt
  /// 개별 구매 허용 여부
  /// 운영자 숨김(약관 8조). null이면 정상. 작성자 본인 외에는 목록·상세·미디어에서 제외
  hidden_at                 DateTime?
  hidden_reason             String?        @db.VarChar(500)
  hidden_by                 String?        @db.VarChar(191)
  /// 베타 사후 검수: 운영자가 확인한 시각. 작성자가 수정하면 다시 null(미검수)
  reviewed_at               DateTime?
  reviewed_by               String?        @db.VarChar(191)
  allow_individual_purchase Boolean        @default(false)
  /// 개별 구매 가격 (원)
  individual_purchase_price Decimal?       @db.Decimal(10, 0)
  /// 공개 여부
  is_public                 Boolean        @default(true)
  /// 민감한 콘텐츠 여부
  is_sensitive              Boolean        @default(false)
  /// 크리에이터 ID (Cognito의 userSub)
  user_sub                  String
  /// 댓글 허용 여부
  allow_tips                Boolean        @default(true)
  allow_comments            Boolean        @default(true)
  access_plan_id String?
  scheduled_at DateTime?
  comments                  Comment[]
  likes                     PostingLike[]
  medias                    PostingMedia[]
  views                     PostingView[]

  @@index([status, is_deleted, reviewed_at, created_at], map: "postings_review_queue_idx")
  @@map("postings")
}

/// 포스팅-미디어 관계
/// 포스팅과 미디어의 다대다 관계를 관리
model PostingMedia {
  /// 관계 고유 식별자
  id              String    @id @default(uuid())
  /// 포스팅 ID
  posting_id      String
  /// 미디어 ID
  media_id        String
  /// 정렬 순서
  sort_order      Int       @default(0)
  /// 무료 공개 여부
  is_free_preview Boolean   @default(false)
  /// 삭제 여부
  is_deleted      Boolean   @default(false)
  /// 삭제 일시
  deleted_at      DateTime?
  /// 생성 일시
  created_at      DateTime  @default(now())
  /// 수정 일시
  updated_at      DateTime  @updatedAt
  media           Media     @relation(fields: [media_id], references: [id])
  posting         Posting   @relation(fields: [posting_id], references: [id])

  @@unique([posting_id, media_id])
  @@index([media_id], map: "posting_medias_media_id_fkey")
  @@map("posting_medias")
}

/// 댓글
/// 포스팅에 달리는 댓글
model Comment {
  /// 댓글 고유 식별자
  id             String        @id @default(uuid())
  /// 포스팅 ID
  posting_id     String
  /// 작성자 ID (Cognito의 userSub)
  author_id      String
  /// 태그된 사용자 ID (Cognito의 userSub)
  tagged_user_id String?
  /// 내용
  content        String        @db.Text
  /// 부모 댓글 ID (대댓글인 경우)
  parent_id      String?
  /// 삭제 여부
  is_deleted     Boolean       @default(false)
  /// 삭제 일시
  deleted_at     DateTime?
  /// 생성 일시
  created_at     DateTime      @default(now())
  /// 수정 일시
  updated_at     DateTime      @updatedAt
  hidden Boolean @default(false)
  mentions Json?
  /// Set when the author edits the body; shown as "수정됨".
  edited_at DateTime?
  likes          CommentLike[]
  parent         Comment?      @relation("CommentToComment", fields: [parent_id], references: [id])
  children       Comment[]     @relation("CommentToComment")
  posting        Posting       @relation(fields: [posting_id], references: [id])

  @@index([parent_id], map: "comments_parent_id_fkey")
  @@index([posting_id], map: "comments_posting_id_fkey")
  @@map("comments")
}

/// 포스팅 좋아요
/// 포스팅에 대한 좋아요 정보
model PostingLike {
  /// 좋아요 고유 식별자
  id         String    @id @default(uuid())
  /// 포스팅 ID
  posting_id String
  /// 사용자 ID (Cognito의 userSub)
  user_id    String
  /// 삭제 여부
  is_deleted Boolean   @default(false)
  /// ��제 일시
  deleted_at DateTime?
  /// 생��� 일시
  created_at DateTime  @default(now())
  /// 수정 일시
  updated_at DateTime  @updatedAt
  posting    Posting   @relation(fields: [posting_id], references: [id])

  @@unique([posting_id, user_id])
  @@map("posting_likes")
}

/// 댓글 좋아요
/// 댓글에 대한 좋아요 정보
model CommentLike {
  /// 좋아요 고유 식별자
  id         String    @id @default(uuid())
  /// 댓글 ID
  comment_id String
  /// 사용자 ID (Cognito의 userSub)
  user_id    String
  /// 삭제 여부
  is_deleted Boolean   @default(false)
  /// 삭제 일시
  deleted_at DateTime?
  /// 생성 일시
  created_at DateTime  @default(now())
  /// 수정 일시
  updated_at DateTime  @updatedAt
  comment    Comment   @relation(fields: [comment_id], references: [id])

  @@unique([comment_id, user_id])
  @@map("comment_likes")
}

/// 얼리버드 회원
/// 얼리버드로 가입한 사용자들을 관리하여 추후 혜택을 제공
model Earlybird {
  /// 고유 식별자
  id          String    @id @default(uuid())
  /// 사용자 ID (Cognito의 userSub)
  user_sub    String    @unique
  /// 가입 일시
  joined_at   DateTime  @default(now())
  /// 혜택 지급 여부
  rewarded    Boolean   @default(false)
  /// 혜택 지급 일시
  rewarded_at DateTime?
  /// 생성 일시
  created_at  DateTime  @default(now())
  /// 수정 일시
  updated_at  DateTime  @updatedAt

  @@map("earlybirds")
}

/// 사용자 팔로우 관계
/// 사용자 간의 팔로우/팔로잉 관계를 관리
model UserFollow {
  /// 고유 식별자
  id           String    @id @default(uuid())
  /// 팔로우를 하는 사용자 ID (Cognito의 userSub)
  follower_id  String
  /// 팔로우를 받는 사용자 ID (Cognito의 userSub)
  following_id String
  /// 팔로우 시작 일시
  followed_at  DateTime  @default(now())
  /// 삭제 일시 (언팔로우 시점)
  deleted_at   DateTime?
  /// 생성 일시
  created_at   DateTime  @default(now())
  /// 수정 일시
  updated_at   DateTime  @updatedAt

  @@unique([follower_id, following_id])
  @@index([follower_id])
  @@index([following_id])
  @@index([followed_at])
  @@index([deleted_at])
  @@map("user_follows")
}

/// 미디어 삭제 큐
/// S3에서 삭제될 미디어 파일들을 관리하는 큐
model MediaDeleteQueue {
  /// 큐 고유 식별자
  id               String      @id @default(uuid())
  /// 미디어 ID
  media_id         String      @unique
  /// S3 키 (삭제할 파일 경로)
  s3_key           String
  /// 원본 파일 URL (백업용)
  original_url     String
  /// 큐에 추가된 이유
  queue_reason     QueueReason
  /// 유예기간 종료일
  grace_period_end DateTime
  /// 처리 상태
  status           QueueStatus @default(PENDING)
  /// 재시도 횟수
  retry_count      Int         @default(0)
  /// 에러 메시지
  error_message    String?     @db.Text
  /// 큐에 추가된 일시
  queued_at        DateTime    @default(now())
  /// 처리 완료 일시
  processed_at     DateTime?
  /// 생성 일시
  created_at       DateTime    @default(now())
  /// 수정 일시
  updated_at       DateTime    @updatedAt
  media            Media       @relation(fields: [media_id], references: [id])

  @@index([status])
  @@index([grace_period_end])
  @@index([queued_at])
  @@index([queue_reason])
  @@map("media_delete_queue")
}

/// 관리자 계정
/// 시스템 관리를 위한 관리자 계정 정보
model Admin {
  /// 관리자 고유 식별자
  id         String    @id @default(uuid())
  /// 사용자 ID (Cognito의 userSub 또는 별도 관리자 계정)
  user_sub   String    @unique
  /// 관리자 이름
  name       String
  /// 관리자 이메일
  email      String    @unique
  /// 관리자 역할
  role       AdminRole @default(MODERATOR)
  /// 활성 상태
  is_active  Boolean   @default(true)
  /// 마지막 로그인 일시
  last_login DateTime?
  /// 생성 일시
  created_at DateTime  @default(now())
  /// 수정 일시
  updated_at DateTime  @updatedAt
  /// 생성한 사용자 ID (상위 관리자)
  created_by String?
  /// 메뉴별 권한 {menu:{view,create,update,delete}}. null이면 기존 역할 기본값
  permissions Json?
  /// 임시 비밀번호로 생성·초기화되어 첫 로그인 시 변경 필요
  must_change_password Boolean @default(false)
  /// 운영자 전용 비밀번호(scrypt). 팬·크리에이터 회원 계정과 분리
  password_hash String? @db.VarChar(255)
  /// 운영자 연락처
  phone String @default("") @db.VarChar(32)
  /// 2차 인증(TOTP, 2026-10-30): 암호화한 비밀값, 등록 대기 비밀값, 등록 시각, 마지막 사용 시간창, 복구코드 해시, 미등록 유예 종료
  totp_secret_encrypted String? @db.Text
  totp_pending_encrypted String? @db.Text
  totp_enabled_at DateTime?
  totp_last_step Int?
  totp_recovery Json?
  totp_grace_until DateTime?
  sessions AdminSession[]

  @@map("admins")
}

/// 운영 콘솔 로그인 세션. 회원 세션(member_sessions)과 분리
model AdminSession {
  id           String   @id @default(uuid())
  admin_id     String
  access_hash  String   @unique @db.Char(64)
  refresh_hash String   @unique @db.Char(64)
  access_until DateTime
  expires_at   DateTime
  created_at   DateTime @default(now())
  admin        Admin    @relation(fields: [admin_id], references: [id], onDelete: Cascade)
  @@index([admin_id])
  @@index([expires_at])
  @@map("admin_sessions")
}

/// 사용자 신고
/// 사용자가 부적절한 콘텐츠나 행동을 신고하는 기능
model UserReport {
  /// 신고 고유 식별자
  id          String       @id @default(uuid())
  /// 신고자 ID (Cognito의 userSub)
  reporter_id String
  /// 신고 대상 유형
  target_type ReportTarget
  /// 신고 대상 ID (포스팅 ID, 댓글 ID, 사용자 ID 등)
  target_id   String
  /// 신고 사유
  reason      ReportReason
  /// 상세 설명
  description String?      @db.Text
  /// 신고 상태
  status      ReportStatus @default(PENDING)
  /// 처리 관리자 ID
  admin_id    String?
  /// 처리 결과 메모
  admin_note  String?      @db.Text
  /// 처리 일시
  resolved_at DateTime?
  /// 생성 일시
  created_at  DateTime     @default(now())
  /// 수정 일시
  updated_at  DateTime     @updatedAt

  @@index([target_type, target_id])
  @@index([reporter_id])
  @@index([status])
  @@map("user_reports")
}

/// 사용자 정지 이력
/// 사용자의 정지/활성화 이력을 관리
model UserSuspension {
  /// 정지 이력 고유 식별자
  id         String           @id @default(uuid())
  /// 대상 사용자 ID (Cognito의 userSub)
  user_id    String
  /// 정지 유형
  type       SuspensionType
  /// 정지 사유
  reason     String           @db.Text
  /// 정지 시작 일시
  start_date DateTime         @default(now())
  /// 정지 종료 일시 (null인 경우 무기한)
  end_date   DateTime?
  /// 정지 상태
  status     SuspensionStatus @default(ACTIVE)
  /// 처리 관리자 ID
  admin_id   String
  /// 생성 일시
  created_at DateTime         @default(now())
  /// 수정 일시
  updated_at DateTime         @updatedAt

  @@index([user_id])
  @@index([status])
  @@map("user_suspensions")
}

/// 결제 거래 내역
/// TossPayments를 통한 실제 결제 거래 기록
model PaymentTransaction {
  /// 거래 고유 식별자
  id              String        @id @default(uuid())
  /// 주문번호 (클라이언트에서 생성)
  order_id        String        @unique
  /// TossPayments 결제키
  payment_key     String?       @unique
  /// 결제 요청 사용자 ID (Cognito userSub)
  user_id         String
  /// 결제 금액 (원)
  amount          Decimal       @db.Decimal(10, 0)
  /// 구매할 토큰 수량
  token_amount    Decimal       @db.Decimal(18, 4)
  /// 토큰 타입 ID
  token_type_id   String
  /// 결제 상태
  status          PaymentStatus @default(PENDING)
  /// 결제 방법 (카드, 가상계좌 등)
  method          String?
  /// 결제 승인 일시
  approved_at     DateTime?
  /// 결제 취소 일시
  cancelled_at    DateTime?
  /// 결제 실패 사유
  failure_code    String?
  /// 결제 실패 메시지
  failure_message String?
  /// TossPayments 응답 원본 (JSON)
  raw_response    Json?
  /// 생성 일시
  created_at      DateTime      @default(now())
  /// 수정 일시
  updated_at      DateTime      @updatedAt
  /// 구독 ID (정기결제용)
  subscription_id String?
  /// 자동결제 빌링키
  billing_key     String?
  /// 정기결제 여부
  is_recurring    Boolean       @default(false)
  subscription    Subscription? @relation(fields: [subscription_id], references: [id])
  token_type      TokenType     @relation(fields: [token_type_id], references: [id])

  @@index([user_id])
  @@index([status])
  @@index([order_id])
  @@index([subscription_id], map: "payment_transactions_subscription_id_fkey")
  @@index([token_type_id], map: "payment_transactions_token_type_id_fkey")
  @@map("payment_transactions")
}

/// 게시판
/// 공지사항 및 이벤트 게시글
model Board {
  /// 게시글 고유 식별자
  id           String        @id @default(uuid())
  /// 게시글 제목
  title        String
  /// 게시글 내용
  content      String        @db.Text
  /// 카테고리 ID
  category_id  String
  /// 중요 게시글 여부
  is_important Boolean       @default(false)
  /// 요약/미리보기 텍스트
  excerpt      String?       @db.Text
  /// 작성자 (관리자)
  author       String        @default("크리팬스 관리자")
  /// 조회수
  views        Int           @default(0)
  /// 공개 상태
  is_published Boolean       @default(true)
  /// 발행 일시
  published_at DateTime?
  /// 삭제 여부
  is_deleted   Boolean       @default(false)
  /// 삭제 일시
  deleted_at   DateTime?
  /// 생성 일시
  created_at   DateTime      @default(now())
  /// 수정 일시
  updated_at   DateTime      @updatedAt
  board_views  BoardView[]
  category     BoardCategory @relation(fields: [category_id], references: [id])

  @@index([category_id])
  @@index([is_published])
  @@index([published_at])
  @@index([created_at])
  @@map("boards")
}

/// 게시글 조회 기록
/// IP별 게시글 조회 기록을 관리하여 중복 조회수 증가를 방지
model BoardView {
  /// 조회 기록 고유 식별자
  id         String   @id @default(uuid())
  /// 게시글 ID
  board_id   String
  /// 조회자 IP 주소
  ip_address String
  /// 조회 일시
  viewed_at  DateTime @default(now())
  board      Board    @relation(fields: [board_id], references: [id], onDelete: Cascade)

  @@unique([board_id, ip_address])
  @@index([board_id])
  @@index([ip_address])
  @@index([viewed_at])
  @@map("board_views")
}

/// 게시판 카테고리 테이블
/// 게시판의 카테고리를 동적으로 관리
model BoardCategory {
  /// 카테고리 고유 식별자
  id          String   @id @default(uuid())
  /// 카테고리 코드 (NOTICE, EVENT 등)
  code        String   @unique
  /// 카테고리 이름
  name        String
  /// 카테고리 설명
  description String?
  /// 정렬 순서
  sort_order  Int      @default(0)
  /// 공개 상태
  is_public   Boolean  @default(true)
  /// 활성 상태
  is_active   Boolean  @default(true)
  /// 생성 일시
  created_at  DateTime @default(now())
  /// 수정 일시
  updated_at  DateTime @updatedAt
  boards      Board[]

  @@index([sort_order])
  @@index([is_public])
  @@index([is_active])
  @@map("board_categories")
}

enum CommonStatus {
  PENDING
  SUCCESS
  FAILED

  @@map("CommonStatus")
}

enum PeriodUnit {
  DAY
  WEEK
  MONTH
  YEAR

  @@map("period_units")
}

/// 구독 상태
enum SubscriptionStatus {
  ONGOING
  EXPIRED
  CANCELLED

  @@map("subscription_statuses")
}

/// 미디어 타입
enum MediaType {
  IMAGE
  VIDEO
  AUDIO

  @@map("media_types")
}

/// 포스팅 상태
enum PostingStatus {
  DRAFT
  PUBLISHED
  ARCHIVED

  @@map("posting_statuses")
}

/// 미디어 처리 상태
enum ProcessingStatus {
  UPLOADING
  PROCESSING
  COMPLETED
  FAILED

  @@map("processing_statuses")
}

/// 큐 추가 이유
enum QueueReason {
  ORPHANED
  SOFT_DELETED
  EXPIRED

  @@map("queue_reasons")
}

/// 큐 처리 상태
enum QueueStatus {
  PENDING
  READY
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED

  @@map("queue_statuses")
}

/// 관리자 역할
enum AdminRole {
  SUPER_ADMIN
  ADMIN
  MODERATOR

  @@map("admin_roles")
}

/// 신고 대상 유형
enum ReportTarget {
  USER
  POSTING
  COMMENT

  @@map("report_targets")
}

/// 신고 사유
enum ReportReason {
  SPAM
  HARASSMENT
  INAPPROPRIATE
  COPYRIGHT
  FRAUD
  PRIVACY
  OTHER

  @@map("report_reasons")
}

/// 신고 상태
enum ReportStatus {
  PENDING
  REVIEWED
  RESOLVED
  REJECTED

  @@map("report_statuses")
}

/// 정지 유형
enum SuspensionType {
  WARNING
  TEMPORARY
  PERMANENT

  @@map("suspension_types")
}

/// 정지 상태
enum SuspensionStatus {
  ACTIVE
  EXPIRED
  LIFTED

  @@map("suspension_statuses")
}

/// 결제 상태
enum PaymentStatus {
  PENDING
  APPROVED
  CANCELLED
  FAILED
  REFUNDED

  @@map("payment_statuses")
}
//
/// Identity key is the original Cognito sub; existing business tables are untouched.
model Member {
  id                 String   @id @db.VarChar(191)
  email              String   @unique @db.VarChar(191)
  cognito_username   String?  @unique @db.VarChar(191)
  password_hash      String?  @db.VarChar(255)
  name               String   @db.VarChar(255)
  nickname           String   @db.VarChar(191)
  preferred_username String   @unique @db.VarChar(191)
  phone_number       String   @default("") @db.VarChar(64)
  picture            String?  @db.Text
  email_verified     Boolean  @default(false)
  enabled            Boolean  @default(true)
  status             String   @default("UNCONFIRMED") @db.VarChar(32)
  migrated_at        DateTime?
  created_at         DateTime @default(now())
  updated_at         DateTime @updatedAt
  identity_hash String? @unique @db.Char(64)
  // Operator suspension (terms §8). suspended_until null with suspended_at set means indefinite.
  suspended_at       DateTime?
  suspended_until    DateTime?
  suspension_reason  String?  @db.VarChar(500)
  // Withdrawal (decision 2026-10-29): personal data is purged 30 days after withdrawn_at; purged_at marks completion.
  withdrawn_at       DateTime?
  purged_at          DateTime?
  sessions           MemberSession[]
  challenges         MemberChallenge[]
  @@index([nickname])
  @@index([withdrawn_at, purged_at])
  @@map("members")
}

model MemberSession {
  id           String   @id @default(uuid())
  member_id    String   @db.VarChar(191)
  access_hash  String   @unique @db.Char(64)
  refresh_hash String   @unique @db.Char(64)
  access_until DateTime
  expires_at   DateTime
  created_at   DateTime @default(now())
  member       Member @relation(fields: [member_id], references: [id], onDelete: Cascade)
  @@index([member_id])
  @@index([expires_at])
  @@map("member_sessions")
}

model MemberChallenge {
  member_id  String @db.VarChar(191)
  purpose    String @db.VarChar(24)
  digest     String @db.Char(64)
  attempts   Int @default(0)
  expires_at DateTime
  sent_at    DateTime @default(now())
  target_email String? @db.VarChar(191)
  member     Member @relation(fields: [member_id], references: [id], onDelete: Cascade)
  @@id([member_id, purpose])
  @@index([expires_at])
  @@map("member_challenges")
}

/// Shared across processes; keys are hashes, not emails or IP addresses.
model AuthRateBucket {
  id         String @id @db.Char(64)
  count      Int @default(1)
  expires_at DateTime
  @@index([expires_at])
  @@map("auth_rate_buckets")
}


model AccountPreference {
  marketing_consent_id String? @db.VarChar(191)
  member_id String @id @db.VarChar(191)
  content_alert Boolean @default(true)
  message_alert Boolean @default(true)
  marketing_alert Boolean @default(false)
  show_activity Boolean @default(true)
  allow_search Boolean @default(true)
  show_followers Boolean @default(true)
  show_following Boolean @default(true)
  updated_at DateTime @updatedAt
  @@map("account_preferences")
}
model SavedPost {
  member_id String @db.VarChar(191)
  posting_id String
  created_at DateTime @default(now())
  @@id([member_id, posting_id])
  @@map("saved_posts")
}
model MemberBlock {
  member_id String @db.VarChar(191)
  target_id String @db.VarChar(191)
  created_at DateTime @default(now())
  @@id([member_id, target_id])
  @@map("member_blocks")
}
model DirectMessage {
  id String @id @default(uuid())
  sender_id String @db.VarChar(191)
  recipient_id String @db.VarChar(191)
  body String @db.Text
  read_at DateTime?
  created_at DateTime @default(now())
  @@index([recipient_id, created_at])
  @@index([sender_id, recipient_id, created_at])
  @@map("direct_messages")
}
model MemberNotification {
  id String @id @default(uuid())
  member_id String @db.VarChar(191)
  actor_id String? @db.VarChar(191)
  type String
  text String
  path String
  read_at DateTime?
  created_at DateTime @default(now())
  @@index([member_id, created_at])
  @@map("member_notifications")
}
model SupportTicket {
  id String @id @default(uuid())
  member_id String @db.VarChar(191)
  category String
  title String
  message String @db.Text
  reply String? @db.Text
  status String @default("pending")
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([member_id, created_at])
  @@map("support_tickets")
}
model ServiceDocument {
  id String @id @default(uuid())
  kind String
  title String
  category String @default("")
  content Json
  pinned Boolean @default(false)
  published Boolean @default(false)
  updated_at DateTime @updatedAt
  @@index([kind, published])
  @@map("service_documents")
}
model SignupChallenge {
  email String @id @db.VarChar(191)
  code_hash String @db.Char(64)
  attempts Int @default(0)
  sent_at DateTime
  expires_at DateTime
  proof_hash String? @db.Char(64)
  verified_at DateTime?
  @@map("signup_challenges")
}
model IdentityProof {
 adult_verified Boolean @default(false)
 verified_name String? @db.VarChar(80)
  id String @id @default(uuid())
  token_hash String @unique @db.Char(64)
  provider_reference String @unique
  member_id String? @db.VarChar(191)
  attempt_id String @unique
  purpose String @default("signup")
  identity_hash String @db.Char(64)
  expires_at DateTime
  consumed_at DateTime?
  @@map("identity_proofs")
}
model MembershipVersion {
  id String @id @default(uuid())
  membership_id String
  version Int
  snapshot Json
  created_at DateTime @default(now())
  @@unique([membership_id, version])
  @@map("membership_versions")
}
model BillingMethod {
  unavailable_at DateTime?
  unavailable_reason String? @db.VarChar(80)
  id String @id @default(uuid())
  member_id String @db.VarChar(191)
  billing_key_encrypted String @db.Text
  customer_key String? @db.VarChar(36)
  masked_number String? @db.VarChar(24)
  revoked_at DateTime?
  revoke_retry_at DateTime?
  revoke_attempts Int @default(0)
  label String
  last_four String @db.Char(4)
  is_default Boolean @default(false)
  deleted_at DateTime?
  created_at DateTime @default(now())
  @@index([member_id])
  @@map("billing_methods")
}
model BillingNotice {
  id String @id @default(uuid())
  dedupe_key String @unique @db.VarChar(191)
  member_id String @db.VarChar(191)
  subscription_id String @db.VarChar(191)
  order_id String? @db.VarChar(191)
  kind String @db.VarChar(40)
  action_required Boolean @default(false)
  attempts Int @default(0)
  retry_at DateTime @default(now())
  locked_until DateTime?
  completed_at DateTime?
  outcome String? @db.VarChar(40)
  created_at DateTime @default(now())
  @@index([completed_at, retry_at])
  @@map("billing_notices")
}
model CheckoutOrder {
  usage_tracking_started_at DateTime?
  content_accessed_at DateTime?
  locked_until DateTime?
  processing_started_at DateTime?
  paid_at DateTime?
  period_end DateTime?
  attempts Int @default(0)
  retry_at DateTime?
  id String @id @default(uuid())
  member_id String @db.VarChar(191)
  membership_id String
  snapshot Json
  amount Int
  status String @default("pending")
  payment_key String? @unique
  subscription_id String?
  billing_method_id String?
  period_start DateTime?
  idempotency_key String @unique
  failure_code String?
  expires_at DateTime
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([member_id, created_at])
  @@map("checkout_orders")
}
model RevenueEntry {
  receipt_confirmed_at DateTime?
  receipt_reference String? @db.VarChar(191)
  received_amount Int?
  id String @id @default(uuid())
  creator_id String @db.VarChar(191)
  order_id String @unique
  title String
  gross Int
  reversals Int @default(0)
  fees Int
  net Int
  available_at DateTime
  created_at DateTime @default(now())
  @@index([creator_id, available_at])
  @@map("revenue_entries")
}
model SettlementAccount {
  id String @id @default(uuid())
  creator_id String @db.VarChar(191)
  bank String
  holder_alias String
  last_four String @db.Char(4)
  account_encrypted String? @db.Text
  verified Boolean @default(false)
  version Int @default(1)
  is_default Boolean @default(false)
  created_at DateTime @default(now())
  @@index([creator_id])
  @@map("settlement_accounts")
}
model WithdrawalCredential {
  creator_id String @id @db.VarChar(191)
  pin_hash String
  updated_at DateTime @updatedAt
  @@map("withdrawal_credentials")
}
model WithdrawalAuthorization {
  id String @id @default(uuid())
  creator_id String @db.VarChar(191)
  account_id String
  account_version Int
  amount Int
  expires_at DateTime
  consumed_at DateTime?
  @@map("withdrawal_authorizations")
}
model WithdrawalRequest {
  id String @id @default(uuid())
  creator_id String @db.VarChar(191)
  request_key String @unique
  account_id String
  account_label String
  amount Int
  status String @default("requested")
  note String @default("")
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([creator_id, status])
  @@map("withdrawal_requests")
}

model IdentityAttempt {
 id String @id @default(uuid())
 state_hash String @unique @db.Char(64)
 proof_encrypted String? @db.Text
 member_id String? @db.VarChar(191)
 purpose String
 provider_reference String? @unique
 status String @default("pending")
 expires_at DateTime
 created_at DateTime @default(now())
 @@map("identity_attempts")
}
model PlatformJob {
 id String @id
 locked_until DateTime
 completed_at DateTime?
 note String?
 @@map("platform_jobs")
}

model MemberConsent {
 document_snapshot Json?
 id String @id @default(uuid())
 member_id String
 kind String @db.VarChar(40)
 document_id String?
 accepted_at DateTime @default(now())
 @@index([member_id])
 @@map("member_consents")
}

model FollowEvent {
 id String @id @default(uuid())
 follower_id String
 following_id String
 enabled Boolean
 created_at DateTime @default(now())
 @@index([following_id,created_at])
 @@index([follower_id,following_id])
 @@map("follow_events")
}

model BillingCustomer {
 member_id String @id @db.VarChar(191)
 customer_key String @unique @default(uuid()) @db.VarChar(36)
 created_at DateTime @default(now())
 @@map("billing_customers")
}
model BillingRegistration {
 id String @id @default(uuid())
 member_id String @db.VarChar(191)
 customer_key String @db.VarChar(36)
 state_hash String @db.Char(64)
 return_path String @db.VarChar(250)
 status String @default("pending") @db.VarChar(24)
 auth_key_encrypted String? @db.Text
 billing_method_id String? @db.VarChar(191)
 locked_until DateTime?
 expires_at DateTime
 created_at DateTime @default(now())
 updated_at DateTime @updatedAt
 @@index([member_id])
 @@map("billing_registrations")
}

model FinancialPolicy {
  id String @id @default("platform") @db.VarChar(32)
  version Int @default(0)
  platform_fee_bps Int?
  settlement_hold_days Int?
  updated_at DateTime @updatedAt
  @@map("financial_policies")
}
model FinancialPolicyChange {
  id String @id @default(uuid())
  version Int @unique
  platform_fee_bps Int
  settlement_hold_days Int
  changed_by String? @db.VarChar(191)
  reason String @db.VarChar(500)
  created_at DateTime @default(now())
  @@map("financial_policy_changes")
}

model PlatformSecurityIp {
 ip String @id @db.VarChar(45)
 blocked_until DateTime?
 window_start DateTime
 count Int @default(0)
 detected_at DateTime?
 @@map("platform_security_ips")
}

model PlatformOperationalEvent {
 id String @id @default(uuid()) @db.VarChar(36)
 type String @db.VarChar(64)
 data Json
 ip String? @db.VarChar(45)
 peer_ip String? @db.VarChar(45)
 request_id String? @db.VarChar(36)
 dedupe_key String? @unique @db.VarChar(191)
 created_at DateTime @default(now())
 available_at DateTime @default(now())
 attempts Int @default(0)
 locked_until DateTime?
 delivered_at DateTime?
 last_error_code String? @db.VarChar(64)
 @@index([delivered_at,available_at,locked_until],map:"platform_operations_dispatch_idx")
 @@index([created_at])
 @@map("platform_operational_events")
}

// Application-append-only audit trail, independent from Telegram delivery/cleanup.
model PlatformAuditLog {
 id String @id @default(uuid()) @db.VarChar(36)
 category String @db.VarChar(24)
 action String @db.VarChar(96)
 level String @db.VarChar(8)
 actor_id String? @db.VarChar(191)
 actor_role String? @db.VarChar(32)
 ip String? @db.VarChar(45)
 peer_ip String? @db.VarChar(45)
 request_id String? @db.VarChar(36)
 job_id String? @db.VarChar(64)
 entity_id String? @db.VarChar(191)
 source_id String? @unique @db.VarChar(191)
 release String @db.VarChar(96)
 environment String @db.VarChar(32)
 status_code Int?
 duration_ms Int?
 metadata Json
 occurred_at DateTime @default(now()) @db.DateTime(3)
 @@index([occurred_at, id])
 @@index([category, occurred_at])
 @@index([request_id, occurred_at])
 @@index([actor_id, occurred_at])
 @@index([entity_id, occurred_at])
 @@index([ip, occurred_at])
 @@index([job_id, occurred_at])
 @@map("platform_audit_logs")
}

model MarketingDelivery {
 id String @id @default(uuid())
 member_id String @db.VarChar(191)
 kind String @db.VarChar(40)
 dedupe_key String @unique @db.VarChar(191)
 consent_id String? @db.VarChar(191)
 subject String @db.VarChar(200)
 body String @db.Text
 status String @default("queued") @db.VarChar(30)
 created_at DateTime @default(now())
 started_at DateTime?
 completed_at DateTime?
 @@index([status, created_at])
 @@index([member_id, kind, completed_at])
 @@map("marketing_deliveries")
}

// New platform bean ledger. Legacy Wallet/Transfer remain isolated.
model BeanWallet {
 accounts BeanAccount[]
 id String @id
 owner_key String @unique(map:"owner_key") @db.VarChar(191)
 status String @default("active") @db.VarChar(20)
 created_at DateTime @default(now())
 @@map("bean_wallets")
}
model BeanAccount {
 wallet BeanWallet @relation(fields:[wallet_id],references:[id],onUpdate:NoAction,map:"bean_accounts_ibfk_1")
 entries BeanEntry[]
 id String @id
 wallet_id String
 bucket String @db.VarChar(40)
 balance BigInt @default(0)
 version Int @default(0)
 @@unique([wallet_id,bucket])
 @@map("bean_accounts")
}
model BeanMovement {
 entries BeanEntry[]
 id String @id
 request_key String @unique(map:"request_key") @db.VarChar(191)
 fingerprint String @db.Char(64)
 kind String @db.VarChar(40)
 reason String @db.VarChar(500)
 actor_id String @db.VarChar(191)
 reference_id String? @db.VarChar(191)
 created_at DateTime @default(now())
 @@index([kind,created_at])
 @@map("bean_movements")
}
model BeanEntry {
 movement BeanMovement @relation(fields:[movement_id],references:[id],onUpdate:NoAction,map:"bean_entries_ibfk_1")
 account BeanAccount @relation(fields:[account_id],references:[id],onUpdate:NoAction,map:"bean_entries_ibfk_2")
 id String @id
 movement_id String
 account_id String
 delta BigInt
 balance_after BigInt
 created_at DateTime @default(now())
 @@unique([movement_id,account_id])
 @@index([account_id,created_at])
 @@map("bean_entries")
}

model BeanCharge {
 id String @id @default(uuid())
 member_id String
 request_key String @unique
 quantity Int
 amount Int
 environment String @db.VarChar(10)
 status String @default("pending") @db.VarChar(30)
 payment_key String? @unique
 locked_until DateTime?
 expires_at DateTime
 paid_at DateTime?
 receipt_confirmed_at DateTime?
 receipt_reference String?
 received_amount Int?
 failure_code String?
 refunded_quantity Int @default(0)
 refunded_amount Int @default(0)
 created_at DateTime @default(now())
 updated_at DateTime @updatedAt
 @@index([member_id,created_at])
 @@index([status,updated_at])
 @@map("bean_charges")
}
model BeanLot {
 id String @id @default(uuid())
 member_id String
 bucket String @db.VarChar(40)
 charge_id String?
 grant_id String?
 available Int
 reserved Int @default(0)
 release_at DateTime
 frozen Boolean @default(false)
 expires_at DateTime?
 expiry_noticed_at DateTime?
 created_at DateTime @default(now())
 @@index([member_id,bucket,created_at])
 @@index([expires_at])
 @@index([charge_id])
 @@map("bean_lots")
}
model BeanTip {
 id String @id @default(uuid())
 request_key String @unique
 sender_id String
 creator_id String
 post_id String?
 post_title_snapshot String? @db.Text
 quantity Int
 paid_quantity Int
 promotion_quantity Int
 message String @db.VarChar(500)
 created_at DateTime @default(now())
 @@index([sender_id,created_at])
 @@index([creator_id,created_at])
 @@index([post_id,sender_id])
 @@map("bean_tips")
}
model BeanTipAllocation {
 id String @id @default(uuid())
 tip_id String
 source_lot_id String
 target_lot_id String @unique
 quantity Int
 @@index([tip_id])
 @@map("bean_tip_allocations")
}
model BeanPromotion {
 id String @id @default(uuid())
 request_key String @unique
 member_id String
 quantity Int
 reason String @db.VarChar(500)
 actor_id String
 created_at DateTime @default(now())
 @@index([member_id,created_at])
 @@map("bean_promotions")
}
model BeanPayout {
 id String @id @default(uuid())
 request_key String @unique
 creator_id String
 account_id String
 account_version Int
 account_label String
 quantity Int
 gross Int
 fee Int
 net Int
 fee_bps Int
 environment String @db.VarChar(10)
 status String @default("requested") @db.VarChar(30)
 note String @default("") @db.VarChar(500)
 approved_by String?
 locked_until DateTime?
 created_at DateTime @default(now())
 updated_at DateTime @updatedAt
 @@index([creator_id,created_at])
 @@index([status,updated_at])
 @@map("bean_payouts")
}
model BeanPayoutAllocation {
 id String @id @default(uuid())
 payout_id String
 lot_id String
 quantity Int
 @@unique([payout_id,lot_id])
 @@map("bean_payout_allocations")
}
model BeanWithdrawalAuthorization {
 id String @id @default(uuid())
 creator_id String
 account_id String
 account_version Int
 quantity Int
 expires_at DateTime
 consumed_at DateTime?
 @@index([creator_id,expires_at])
 @@map("bean_withdrawal_authorizations")
}

// Advertising products are archived, never physically deleted. Paid order snapshots are immutable.
model AdProduct {
  id String @id @default(uuid())
  name String @db.VarChar(100)
  description String @db.Text
  terms String @db.Text
  placement String @default("featured_creator") @db.VarChar(40)
  amount Int
  duration_days Int
  visible Boolean @default(false)
  on_sale Boolean @default(false)
  sort_order Int @default(0)
  version Int @default(1)
  deleted_at DateTime?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([deleted_at, visible, sort_order])
  @@map("ad_products")
}

// Admin-managed beta invitations. Terms set here move to creator_financial_terms when the email signs up.
model SignupInvite {
  id String @id @default(uuid())
  email String @unique @db.VarChar(191)
  memo String @default("") @db.VarChar(100)
  platform_fee_bps Int?
  settlement_hold_days Int?
  bean_withdrawal_fee_bps Int?
  minimum_withdrawal_krw Int?
  member_id String? @db.VarChar(191)
  used_at DateTime?
  revoked_at DateTime?
  version Int @default(1)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@index([revoked_at, created_at])
  @@map("signup_invites")
}
// Per-creator overrides. A null column follows the platform default at the time of each payment or withdrawal.
model CreatorFinancialTerms {
  member_id String @id @db.VarChar(191)
  platform_fee_bps Int?
  settlement_hold_days Int?
  bean_withdrawal_fee_bps Int?
  minimum_withdrawal_krw Int?
  version Int @default(1)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@map("creator_financial_terms")
}
// Append-only history of creator_financial_terms. source: admin(console change), invite(copied at signup), backfill(set before history existed).
model CreatorFinancialTermChange {
  id String @id @default(uuid())
  member_id String @db.VarChar(191)
  version Int
  platform_fee_bps Int?
  settlement_hold_days Int?
  bean_withdrawal_fee_bps Int?
  minimum_withdrawal_krw Int?
  source String @db.VarChar(20)
  changed_by String? @db.VarChar(191)
  reason String @default("") @db.VarChar(500)
  created_at DateTime @default(now())
  @@unique([member_id, version])
  @@map("creator_financial_term_changes")
}

// Append-only record of operator moderation (post hide/unhide, member suspend/unsuspend) for appeals.
model ModerationAction {
  id String @id @default(uuid())
  target_type String @db.VarChar(20)
  target_id String @db.VarChar(191)
  action String @db.VarChar(30)
  reason String @db.VarChar(500)
  public_reason String? @db.VarChar(500)
  until DateTime?
  admin_id String @db.VarChar(191)
  created_at DateTime @default(now())
  @@index([target_type, target_id, created_at])
  @@map("moderation_actions")
}

/// Member refund of unused purchased beans (2026-10-30): full within 7 days of payment, 10% deducted after (waived when the company is at fault).
model BeanRefund {
 id String @id @default(uuid())
 request_key String @unique
 charge_id String
 member_id String
 lot_id String
 quantity Int
 gross Int
 deduction Int
 amount Int
 waived Boolean @default(false)
 actor_id String
 status String @default("processing") @db.VarChar(20)
 failure_code String?
 created_at DateTime @default(now())
 updated_at DateTime @updatedAt
 @@index([charge_id])
 @@index([status,updated_at])
 @@map("bean_refunds")
}
/// Money a creator owes back after a refund or chargeback of income that was already paid out (D4).
model CreatorReceivable {
 id String @id @default(uuid())
 creator_id String
 kind String @db.VarChar(20)
 source_id String
 amount Int
 status String @default("open") @db.VarChar(20)
 note String @default("") @db.VarChar(500)
 settled_by String?
 settled_at DateTime?
 created_at DateTime @default(now())
 @@unique([kind,source_id,creator_id])
 @@index([creator_id,status])
 @@map("creator_receivables")
}
/// Mail outbox for member notices that are not billing notices (operator actions, bean expiry).
model MemberNotice {
 id String @id @default(uuid())
 dedupe_key String @unique @db.VarChar(191)
 member_id String @db.VarChar(191)
 kind String @db.VarChar(40)
 rows Json
 path String @db.VarChar(191)
 note String @db.Text
 attempts Int @default(0)
 retry_at DateTime @default(now())
 locked_until DateTime?
 completed_at DateTime?
 outcome String? @db.VarChar(40)
 created_at DateTime @default(now())
 @@index([completed_at,retry_at])
 @@map("member_notices")
}

/// 레퍼럴(친구 초대). 회원당 1행이며 id 가 초대 링크의 코드다(2026-11-01).
model Referral {
 id String @id @default(uuid())
 member_id String @unique @db.VarChar(191)
 created_at DateTime @default(now())
 @@map("referrals")
}
/// 레퍼럴로 가입한 회원과 보상 상태. 보상은 직접 초대한 회원(referrer_id)에게만, 초대받은 회원의 첫 유료 결제 1회에 지급.
model ReferralSignup {
 id String @id @default(uuid())
 referral_id String
 referrer_id String @db.VarChar(191)
 member_id String @unique @db.VarChar(191)
 /// pending → qualified(첫 실결제, 7일 보류) → granted → clawed_back. 월 상한 초과 시 capped
 reward_status String @default("pending") @db.VarChar(20)
 reward_quantity Int @default(0)
 reward_source String? @db.VarChar(20)
 reward_source_id String? @db.VarChar(191)
 rewarded_at DateTime?
 /// 첫 실결제 후 보상 확정 예정 시각(환불 기간 7일). qualified 상태에서만 값이 있다.
 grant_due_at DateTime?
 clawed_back_at DateTime?
 created_at DateTime @default(now())
 @@index([referral_id])
 @@index([referrer_id,created_at])
 @@index([reward_source,reward_source_id])
 @@index([reward_status,grant_due_at])
 @@map("referral_signups")
}

/// 운영 콘솔에서 바꾸는 서비스 설정(키-값). 2026-11-01: referral.enabled(친구 초대 보상 스위치).
model PlatformSetting {
 key String @id @db.VarChar(64)
 value Json
 updated_by String? @db.VarChar(191)
 updated_at DateTime @updatedAt
 @@map("platform_settings")
}

// Immutable watermarked derivative; original media remains private/reusable for profile images.
model MediaWatermarkJob {
  id String @id @default(uuid())
  source_id String @unique
  target_id String @unique
  creator_id String
  handle String @db.VarChar(24)
  version Int @default(1)
  status String @default("pending") @db.VarChar(16)
  attempts Int @default(0)
  next_attempt_at DateTime @default(now())
  locked_until DateTime?
  error_code String? @db.VarChar(64)
  created_at DateTime @default(now())
  completed_at DateTime?
  @@index([status, next_attempt_at])
  @@map("media_watermark_jobs")
}
```
