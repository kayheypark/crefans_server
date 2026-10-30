# CREFANS v1 API 계약

새 서비스의 HTTP 진입점은 `/api/v1`. 실행은 `src/platform/main.ts`, 별도 자동 작업은 `src/platform/worker.ts`. 기존 앱의 비버전 API와 Cognito 컨트롤러는 이 런타임에 등록하지 않는다. 파괴적인 응답·의미 변경은 `/api/v2`로 분리한다.

## Swagger / OpenAPI

운영 문서는 **[유저](https://admin.crefans.com/api/v1/admin/docs/user)**, **[크리에이터 스튜디오](https://admin.crefans.com/api/v1/admin/docs/studio)**, **[관리자 콘솔](https://admin.crefans.com/api/v1/admin/docs/console)** 세 Swagger 페이지로 분리한다. 먼저 같은 도메인의 [콘솔 로그인](https://admin.crefans.com/login)을 완료해야 한다. 페이지 이름은 API 분류를 뜻하며 세 문서 모두 관리자만 열람한다. 로컬은 같은 경로의 `http://127.0.0.1:3001`이며 API를 호출할 수 있는 관리자 세션 쿠키가 필요하다.

- `/api/v1/admin/docs/user`, `/api/v1/admin/docs/studio`, `/api/v1/admin/docs/console`: Swagger UI. 각 경로 뒤 `/openapi.json`·`/openapi.yaml`은 해당 문서만 담는 OpenAPI 3.0 원문이다. 기존 `/api/v1/admin/docs`는 인증 후 유저 문서로 이동하며 종전 통합 원문 경로는 제공하지 않는다. 문서 화면·원문·정적 파일 모두 기존 회원 세션 및 활성 관리자 guard로 보호한다. 비로그인 401, 일반 회원·비활성 관리자 403. 검색엔진 색인·캐시·외부 validator 전송을 차단한다.
- 유저 문서 **67개**, 스튜디오 문서 **44개**(전용 28개 + 공통 16개), 콘솔 문서 **45개**(관리자 42개 + 공통 로그인·갱신·로그아웃 3개). 2026-10-28 현재 작업 트리의 OpenAPI 검사에서 재집계했다. 스튜디오 공통 API는 실제 화면/어댑터에서 사용하는 세션·초기화·본인확인 시작/결과·미디어·메시지/차단/신고·브라우저 오류 보고를 포함한다. 팬 전용 결제/구독과 스튜디오 전용 수익/정산/출금은 각각 분리한다. 각 문서에는 해당 API가 참조하는 모델·인증 스키마·기능 그룹만 표시하고 상단 링크로 전환한다. 세 문서의 합집합은 전체 137개 API와 일치하며 공통 API를 별도 사업 API로 중복 계산하지 않는다.
- 등록된 신규 플랫폼 controller의 **124개 API**를 자동 수집한다. 구형 Cognito API, worker 내부 작업, 테스트 제어 API는 제외한다. 문서 리소스 자체는 사업 API 개수에 포함하지 않는다. 미디어 GET 경로의 Express HEAD 지원도 설명한다.
- `src/platform/openapi.ts`가 실제 route/guard를 읽고, `src/platform/openapi-contract.ts`가 요청·응답 스키마와 의미를 정의한다. controller에 API를 추가·삭제하고 계약을 갱신하지 않으면 문서 생성 검사가 실패한다. 파라미터 이름과 핵심 응답 변환도 회귀 검사한다. 임의 JSON 필드는 변동 가능한 데이터로 명시하며 검증하지 않은 SDK 생성 호환성을 보장하지 않는다.
- 운영 문서는 **조회용**이다. `Try it out` 및 요청 실행을 비활성화한다. 결제·환불·출금·발송·콘텐츠 소비 기록이 문서 확인 중 발생하지 않게 한다. 실제 API 권한과 기능은 변경하지 않는다. 요청을 직접 실행하는 API 클라이언트에는 기존 쿠키·Origin 규약을 적용한다.
- 인증 증명·계좌번호·PIN 등은 실제 예시 값을 싣지 않는다. 문서 UI의 쿠키 인증을 수동 bearer 토큰 방식으로 바꾸지 않는다. 로그인 만료 시 콘솔에서 다시 로그인한 뒤 문서를 연다.
- 검사: `npm run test:openapi` (빌드 + 세 명세 유효성·124개 API 합집합/중복/누락 대조·권한별 HTTP 차단·직렬화 계약). 인증·DB 대역을 사용하며 실제 결제·PASS·은행 연동 완료의 증거가 아니다.

공식 근거(2026-10-23): [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction), [인증 스키마](https://docs.nestjs.com/openapi/security), [Swagger UI 설정](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/). Nest10과 호환되는 `@nestjs/swagger` 7.4.2를 고정하고 이 패키지 하위 lodash4.18.1·js-yaml4.3.2를 적용했다. [Lodash 보안 권고](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [YAML 보안 권고](https://github.com/advisories/GHSA-2883-xcg3-v3hh)의 수정 범위를 확인했다. 저장소 전체의 기존 의존성 취약점까지 해결했다는 뜻은 아니다.

운영 배포 및 검사 기록: [메시지 읽음·피드 카테고리 배포](../../crefans_front/docs/audit/feed-inbox-deployment-20261024.json), [세 문서 분리 검증 증거](./swagger-three-20261023.json), [두 문서 배포의 과거 기록](./swagger-split-20261023.json), [최초 통합 문서 배포의 과거 기록](./swagger-20261023.json).

## 공통 규약

```json
{"success":true,"data":{},"errorMessage":null,"errorCode":null}
```

```json
{"success":false,"data":null,"errorMessage":"로그인이 필요합니다.","errorCode":"UNAUTHORIZED"}
```

HTTP 상태는 보존한다. 400 입력, 401 세션, 403 권한, 404 없음, 409 상태/멱등 충돌, 429 제한, 503 공급자/설정 미준비. 내부 오류는 DB·외부 키·스택을 응답에 노출하지 않는다. `/media/:id/file`은 권한 확인된 바이너리/Range 응답이므로 성공 시 JSON을 감싸지 않는다. 관리형 S3 파일도 GET/HEAD/Range마다 세션·상품·기간·환불 권한을 확인한다. CDN은 viewer-request에서 현재 권한 확인 후 비공개 S3 파일을 전송하며 브라우저에 bearer 서명 URL을 제공하지 않는다. 직접 API 스트리밍은 같은 검사를 적용하는 롤백/호환 경로다. 복사한 URL만으로 비구독자가 접근할 수 없어야 한다.

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
| POST | /auth/signup | email/password/nickname/terms/privacy/marketing/policyVersions + emailProof; PASS 모드는 identityProof, email-only 모드는 ageAcknowledged=true |
| POST | /auth/login | email/password; 쿠키 발급 |
| POST | /auth/refresh | refresh 쿠키; 기존 토큰 폐기 후 회전 |
| POST | /auth/logout | access 또는 refresh로 회원 세션 철회, 쿠키 삭제 |
| POST | /auth/forgot-password | email; SMTP 코드 요청 |
| POST | /auth/reset-password | email/code/password; 기존 세션 철회 |

`/auth/identity`는 과거 호출에 대해 PASS_NOT_CONFIGURED를 반환하는 호환용 경로다. 새 프론트는 /identity/start/status를 사용한다. signup은 가입 적용 가능한 시행본 이용약관·개인정보처리방침을 요구하고 수락 시점 원문 snapshot을 기록한다. PASS의 실명/CI/성인 확인은 서명된 공급자 결과만 사용한다. CI 원문 대신 HMAC을 저장한다.

## 팬 서비스

| Method | 경로 | 동작 |
| --- | --- | --- |
| GET | /creators | 공개 검색; query/category/cursor, 20개 + nextCursor, 공개 검색 설정 준수 |
| GET | /profiles/:id | UUID·회원 핸들·크리에이터 핸들 조회; 판매 멤버십 포함 |
| GET | /profiles/:id/connections | kind=followers/following, offset 기본0·20명. 비공개는 소유자 외403 CONNECTIONS_PRIVATE. show_followers/show_following 기본true, 비활성 회원 제외 |
| GET | /profiles/:id/following | 팔로잉 공개 또는 본인만 조회 |
| GET | /posts | creatorId/cursor/category; 20개 + nextCursor. 홈 category는 크리에이터 분야로 페이지 분할 전에 필터(전체/미지정은 기존 전체). creatorId 직접 조회에서는 category 무시 |
| GET | /posts/:id | 직접 게시물 조회; 서버가 유료 본문·미디어 차단; views는 DB 누적 조회수 |
| GET | /posts/:id/comments-page | offset; 댓글 10개 + nextOffset |
| GET | /posts/:id/comments | parentId가 있으면 2뎁스 답글; 권한·전역/게시물 댓글 설정 검증 |
| POST | /posts/:id/comments | 회원; body, 선택 parentId. 게시물 작성자가 차단한 회원은 403 COMMENT_BLOCKED(기존 댓글은 유지). 본문의 "@이름"을 서버가 태그로 판별: 게시물 작성자(페이지 이름·닉네임)와 보이는 댓글 작성자만, 같은 이름 2명 이상·본인 제외, 최대 10명 → 목록 `mentions:[{id,name}]`(탈퇴·비활성 제외). 수정 시 다시 판별. 알림 type `comment`(목록 분류 '댓글'): 댓글→게시물 작성자, 답글→원 댓글 작성자, 태그→태그된 사람, 1인 1건·작성자 본인·차단 관계 제외. 스튜디오 답글도 원 댓글 작성자에게 알림 |
| GET | /posts/:id/mention-candidates | 회원; 게시물 이용 권한(열람 기록 없음). 태그할 수 있는 사람 `[{name,image}]`(본인·차단 관계 제외, 회원 ID 없음) |
| PUT | /posts/:id/comments/:commentId | 회원; body 1~1000자. 게시물 이용 권한 + 내가 쓴(삭제·숨김 아닌) 댓글·답글만, 아니면 403 NOT_COMMENT_AUTHOR. 내용이 바뀔 때만 edited_at 기록 → 목록 `edited:true`, 내 댓글·답글은 `own:true` |
| DELETE | /posts/:id/comments/:commentId | 같은 소유권 검사; soft delete·댓글 수 1회 감소. 보이는 답글이 남은 최상위 댓글은 목록에 `deleted:true`(작성자·본문 비움) 자리표시로 남음 |
| PUT | /posts/:id/like | 회원; enabled |
| PUT | /posts/:id/save | 회원; enabled |
| PUT | /members/:id/follow | 회원; enabled, 상태 변화 이력 저장 |
| PUT | /members/:id/block | 회원; enabled |
| POST | /members/:id/messages | 회원; body, 양방향 차단 검증 |
| PUT | /members/:id/messages/read | 회원; ids 1~100개. 인증된 수신자 + 지정 발신자 + 요청한 메시지 ID만 읽음 처리; readIds 반환 |
| POST | /reports | 회원; id, kind=USER/POSTING/COMMENT(삭제·숨김 아닌 댓글만, 없으면 404) |
| PUT | /notifications/read | 회원; ids, 본인 알림만 처리 |
| PUT | /me/profile | 회원; name(닉네임), bio |
| PUT | /me/settings | 회원; section=password/notifications/privacy 등 |
| POST | /me/email/request | 회원; 새 email과 현재 비밀번호(currentPassword, 회원별 10분 5회 제한), 현재 회원과 대상에 묶인 코드 |
| POST | /me/email/confirm | 회원; email/code, 변경 후 세션 철회 |
| POST | /me/inquiries | 회원; category/title/message |
| POST | /me/withdraw | 회원; 자동 갱신·처리 중 출금 확인 후 탈퇴/세션 철회. 크리에이터는 추가로(2026-10-30 D8) 판매 중 멤버십 409 MEMBERSHIP_ON_SALE, 결제된 구독 기간 남음 409 PAID_PERIOD_REMAINS, 미정산 미수금 409 RECEIVABLE_OPEN, 남은 멤버십 수익 409 EARNINGS_REMAIN. 탈퇴 30일 후 파기에 메시지(주고받은 양쪽)·문의·본인확인 해시 포함. 콩: 남은 충전콩은 지갑 환불 후(409 BEAN_BALANCE_REMAINS 안내 문구), 후원받은 콩은 출금 후, 프로모션콩은 막지 않고 소멸. 30일 후 파기는 본인확인 해시를 지우고 DM은 상대방 쪽 보존(보낸 사람 "탈퇴한 사용자"), 문의는 파기 3년 후 삭제(2026-10-30 /pilot-work) |

게시물 DTO의 `views`는 기존 `Posting.total_view_count`를 그대로 제공한다(bootstrap·피드·직접 상세 공통).0회와 잠긴 글에도 집계 숫자를 제공하며 본문·미디어 접근 판정은 기존대로다. 신규 v1의 증가 처리는 아직 없고 이번 변경은 조회수 표시 계약만 추가했다. 예전 비버전 PostingService의 조회 증가 API를 호출하거나 DB 값을 보정하지 않는다. 검증: `tests/platform-feed-category.test.cjs`의 실제 격리DB/HTTP 대조, 프론트 `docs/audit/post-views-20261025.json`. 2026-10-25 `post-views-20261025` 운영 반영, 배포 증거는 프론트 `docs/audit/post-views-deployment-20261025.json`. 자동 증가 기능의 미구현 경계는 동일하다.

메시지 bootstrap 및 `/studio/community`는 DB 메시지 ID와 수신자 기준 `unread`를 제공한다. 대화가 화면에 보일 때 프론트가 표시된 메시지 ID 목록만 읽음 API로 전송한다. 모바일 목록만 열거나 숨겨진 브라우저 탭에서는 처리하지 않고, 실패 시 미확인 표시를 유지한다. 기존 `DirectMessage.read_at`을 사용하며 재요청은 최초 읽음 시각을 보존한다. 요청에 없던 새 메시지·다른 상대방·다른 수신자의 ID는 변경하지 않는다. 메시지와 별개로 생성된 알림의 읽음 상태는 알림 화면에서 처리한다. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)의 요청마다 권한 검사·객체 소유관계 검증 기준을 적용했다(확인: 2026-10-24). 검증은 `tests/platform-message-read.test.cjs`의 실제 격리 DB/HTTP 검사이며 인증 토큰 검증은 대역이다. 2026-10-24 `feed-inbox-20261024`로 운영에 배포했다. 실제 운영에서는 비로그인401과 배포 소스 해시를 확인했고 실회원 대화 쓰기는 수행하지 않았다. [배포 증거](../../crefans_front/docs/audit/feed-inbox-deployment-20261024.json)를 참고한다.

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
| POST | /studio/comments/:id/reply | body 1~1000자, 본인 게시물·삭제되지 않은 부모, 2뎁스·댓글 수 반영 |
| PUT | /studio/comments/:id/replies/:replyId | body 1~1000자, 내 게시물의 해당 부모에 내가 쓴 답글만 수정 |
| DELETE | /studio/comments/:id/replies/:replyId | 같은 소유권 검사, soft delete·댓글 수 1회 감소 |
| GET | /studio/reports/:id | revenue/subscribers/followers, startDate/endDate |
| POST | /media | 소유권 있는 업로드; image 5MB/video 300MB |
| GET | /media/:id/file | owner/게시물 권한/공개 멤버십 이미지에 따른 파일 응답; CDN 캐시 적중도 현재 권한 검사 |
| GET | /media/:id/edge-authorize | 엣지 HMAC + 현재 세션/콘텐츠 권한; S3 객체 키 또는 legacy API 경로 선택, 파일 바이트 없음 |
| GET | /media/:id/origin-file | 동일 권한 검사를 적용한 직접 스트리밍; legacy/롤백 경로 |

스튜디오 답글(2026-10-28): `community.comments[].replies[]`는 항상 `author`(id/name/image)를 제공하고 `fromCreator`로 본인 작성 여부를 명시한다. 내 답글에는 크리에이터 활동명·프로필 사진이 우선 적용된다. 프론트는 공통 `StudioCommentReply`로 사진·이름·작성자 표시와 본인 수정·삭제를 제공한다. 삭제 전 확인하고 실패하면 초안/기존 본문을 유지한다. 서버는 로그인 사용자·게시물 소유자·답글 작성자·부모 관계·삭제 상태를 검사하며, 소유하지 않은 대상은404로 거절한다. 수정/소프트 삭제/댓글 수 변경과 `creator.reply.created/updated/deleted` 감사 기록은 같은 DB 트랜잭션에서 처리한다. 감사에는 본문을 저장하지 않는다. 권한 근거: [OWASP API1:2023 객체 수준 권한 검사](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), 확인2026-10-28. 검증: `tests/platform-studio-replies.test.cjs`의 격리 로컬DB·실제 회원 세션 HTTP 검사 및 `tests/platform-openapi.test.cjs`. 이 변경은 아직 운영 미배포.

이미지와 동영상 합계 게시물당 최대 10개. 소유자·중복·처리완료 여부와 첨부 순서를 서버에서 검사한다. 이미지 재인코딩, 비디오는 MP4/WebM 컨테이너 확인. 업로드는 임시 디스크 + 스트리밍 프록시를 사용한다. `MEDIA_STORAGE=s3`이면 이미지 정규화/영상 검사 후 비공개 S3 `platform/<UUID>`에 저장하고 임시 파일을 지운다. 기본 local 모드는 개발/이전 파일 호환용이다. S3 완료 전 DB 상태는 UPLOADING, 완료 후 COMPLETED이며 실패 상태는 읽기를 거부한다. 기존 S3 자료는 승인 후 SDK 스트리밍으로 읽으며, 지원된 변환본을 우선한다. S3 버킷의 공개 접근/기존 공개 URL은 운영 이관 시 차단해야 한다.

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
| GET | /admin/me | 활성 관리자 본인 이름/역할, totp:{enabled,graceUntil,recoveryCodesLeft} |
| GET | /admin/overview | 최소 운영 카운트·배치 최근 확인 |
| GET | /admin/members | search/page 회원·크리에이터20개 조회, 비밀번호/본인인증 키 제외 |
| GET | /admin/posts | search/page 게시물 메타데이터20개 조회, 보호 콘텐츠 본문/미디어 제외 |
| GET | /admin/dashboard | ADMIN/SUPER_ADMIN; date=KST 기준일·days=7/30/90; 신규구독/갱신포함결제/총액/환불차감액, 전일비교, 빈날짜0추이, 현재잔여구독 |
| GET | /admin/revenue | 매출·정산 조회 권한; from/to 한국 날짜 최대366일, 승인일 원장 합계·일별·크리에이터20명 page |
| GET | /admin/payments | 매출·정산 조회 권한; from/to 주문 생성일 기준 결제20개 page, PG키/snapshot 제외 |
| GET | /admin/withdrawals | 매출·정산 조회 권한; 전체 출금신청20개 page, 계좌/지급 자격정보 제외 |
| GET | /admin/inquiries | 문의 조회 |
| POST | /admin/inquiries/:id/reply | 문의 답변 |
| GET | /admin/reports | 신고 조회. 댓글 신고는 `comment:{content,posting_id,author_id,hidden,is_deleted}` 포함 |
| POST | /admin/reports/:id/resolve | 신고 처리 |
| GET | /admin/documents | 공지·FAQ 조회(약관·개인정보는 코드 원본) |
| POST | /admin/documents | 공지·FAQ 등록·수정. 코드 관리 법률문서 변경 거부 |
| POST | /admin/marketing/campaigns | 활성 SUPER_ADMIN; campaignId/subject/body/memberIds(최대100), 현재 증빙 동의자만 중복 없는 광고 대기열 등록. 법률문서 발행·서명키 필요 |
| POST | /admin/revenue/:id/receipt | 매출·정산 생성 권한; reference/reason/amount/receivedAt, 실제 결제의 PG 입금 대사·감사 기록. 테스트 결제/중복 정정 거부 |
| GET | /admin/financial-policy | 운영 설정 조회 권한; 현재 DB 수수료율/정산 보류·version 조회 |
| PUT | /admin/financial-policy | 운영 설정 수정 권한; expectedVersion/platformFeeBps/settlementHoldDays/reason와 confirmation='정책 변경'(정확히 일치, 아니면 400 CONFIRMATION_REQUIRED), 충돌409·감사 기록 원자 반영 |
| GET | /admin/financial-policy/history | 운영 설정 조회 권한; 최근 정책 변경100건 |
| POST | /admin/categories | 활동 분야 등록/활성화 |
| POST | /admin/creators/:id/promotion | 주목할 크리에이터 광고 배치 설정 |
| PUT | /admin/creators/:id/verification | 회원·크리에이터 수정 권한; 크리에이터 인증 배지 부여·해제. body isVerified:boolean, 감사 이력 동시 저장 |
| POST | /admin/auth/login | 운영자 전용 계정(admins) 로그인. 팬·크리에이터 회원 계정으로는 불가. 이메일당 10분10회, 실패 시 동일 응답·동일 해시 비용. HttpOnly·SameSite=Strict·콘솔 도메인 전용 admin_access_token(1시간)/admin_refresh_token(7일). 2차 인증(2026-10-30, 안전성 확보조치 기준 제6조제2항 2026-10-31 시행): 등록 운영자는 code(TOTP 6자리) 또는 recoveryCode 필요(401 TOTP_REQUIRED/TOTP_INVALID, 5분 5회 제한, 같은 시간창 재사용 거부). 미등록 운영자는 첫 로그인부터 7일 유예 후 본인(self) 경로만 허용(403 TOTP_ENROLLMENT_REQUIRED) |
| POST | /admin/me/totp/setup | 본인. 비밀값(base32)·otpauth URI 발급, 암호화해 등록 대기로 저장. 등록 후 409 |
| POST | /admin/me/totp/enable | 본인. 6자리 확인 후 켜기, 일회용 복구 코드 8개를 한 번만 반환(해시 저장), 유예 해제 |
| POST | /admin/auth/refresh | 운영자 갱신 토큰으로 두 토큰 교체 발급, 이전 갱신 토큰 폐기 |
| POST | /admin/auth/logout | 운영자 세션 삭제·쿠키 제거 |
| GET | /admin/me/profile | 본인 이름·이메일·전화번호·종류·마지막 로그인·메뉴별 권한 |
| PUT | /admin/me/profile | 본인 이름(60자)·전화번호 변경, 감사 기록. 임시 비밀번호 상태에서는 거부 |
| POST | /admin/me/password | currentPassword/newPassword(10자 이상, 현재와 달라야 함). 성공 시 임시 비밀번호 상태 해제, 현재 세션 외 로그아웃. 10분 5회 제한 |
| GET | /admin/operators | SUPER_ADMIN 전용; 운영자 목록(비밀번호·해시 미포함) |
| POST | /admin/operators | SUPER_ADMIN 전용; name/email/phone/permissions로 로그인 계정+부운영자 생성. 임시 비밀번호는 응답에 한 번만 포함, 메일 미발송, 첫 로그인 때 변경 필수 |
| PUT | /admin/operators/:id | SUPER_ADMIN 전용; 이름·전화·permissions·isActive 변경. 최고관리자·본인은 대상 불가 |
| POST | /admin/operators/:id/password-reset | SUPER_ADMIN 전용; 임시 비밀번호 재발급, 기존 세션 종료 |
| DELETE | /admin/operators/:id | SUPER_ADMIN 전용; 비활성화(로그인 계정 비활성·세션 종료, 이력 보존) |

첫 관리자는 `scripts/platform-admin.cjs`에 기존 확인된 회원 ID와 --apply를 명시해 운영자가 지정한다. 스크립트는 기본 비밀번호나 임의 계정을 만들지 않는다. 기존 DB 이관 전 `scripts/platform-audit.cjs`로 과거 snapshot·평문 billing key·미확인 PASS·미완료 작업을 숫자로만 점검한다.

## 검증과 운영 경계

코드/DB/프론트 바인딩 검증은 `docs/platform-implementation.md`. SMTP·Toss 계정은 환경값 주입 후 해당 서비스 테스트 환경에서 확인한다. PASS/은행은 공급사 공식 SDK를 내부 어댑터 계약에 연결해야 한다(`docs/provider-contracts.md`). 기존 Cognito 회원/과거 구독 조건/스토리지 이관, Docker 실제 컨테이너·TLS·부하·장애 복구 검증은 운영 전 별도 수행한다. 현재 원장의 정산 내역은 지급 가능 시각이 있는 개별 수익 건이며, 세무용 월별 증빙/세금계산서 기능을 의미하지 않는다.

## 구독 전용 게시물 접근 보안 (2026-10-07)

- 본문·첨부 미디어·댓글/답글은 서버에서 동일 게시물 권한을 검증한다. 권한 없는 게시물 응답은 홍보용 제목/작성자/집계 등 메타데이터만 유지하며 body는 빈 문자열, media는 빈 배열이다. 댓글/파일은 403을 반환한다.
- 지정 상품이 있는 게시물은 해당 상품의 구독만 인정한다. 구독 시작 <= 현재 < 종료 및 ONGOING/CANCELLED 상태를 요구한다. 자동 갱신 해지 후 남은 이용 기간은 유지하고 만료/환불 완료로 EXPIRED가 된 구독은 거부한다. 상품 지정 없이 최소 레벨을 설정한 게시물은 동일 크리에이터 구독의 가입 당시 snapshot.rank >= membership_level일 때 허용한다. 가격이나 현재 상품 레벨로 권한을 추정하지 않는다.
- 미디어는 원본/변환본 직접 주소 대신 권한 API로 제공한다. 공유된 파일에 유료·비공개·성인 제한이 있으면 모든 해당 제한을 만족해야 한다. 공개 글/멤버십 표지에 같은 파일을 재사용해도 제한을 낮추지 않는다. 여러 상품에서 파일을 공유하면 모든 연결 상품의 권한이 필요하므로 각각 업로드하는 편이 적절하다.
- v1 응답은 private, no-store; 작성자 본인 파일을 제외한 직접 파일 GET/HEAD/Range에도 동일 검사를 적용한다. 브라우저와 API는 no-store를 유지한다. CDN은 HMAC 인증된 권한 조회 후 S3 바이트를 전송하고 쿠키를 S3로 전달하지 않는다. viewer-response는 no-store를 유지하며 캐시 허용 결과를 공유하지 않는다. 직접 API도 동일한 권한 검사를 적용한다. 이미 전송된 바이트나 허용 중인 연결의 회수는 보장하지 않는다. 상세 계약은 [비공개 미디어 운영](./private-media.md)을 따른다.
- 권한 회귀 검사: npm run test:platform (기존 HTTP13개 + 권한6개), 격리 3307 개발 DB 전용이며 테스트 회원/파일은 종료 시 삭제한다.

## 결제 상태와 재시도 (2026-10-08)

- `POST /api/v1/checkout/:id/retry`: 소유한 최초 결제 failed 주문의 명시적 재시도. 미만료 주문을 pending으로 바꾸고 attempt를 한 번 증가시킨다. 중복 요청은 현 상태 반환. 갱신 주문은 worker가 관리하며 `RENEWAL_MANAGED`로 거부한다. 이후 기존 `/pay`로 현재 기본 카드를 사용한다.
- pending → processing → paid. 승인 미확인은 processing을 유지하고 같은 주문 `/pay` 또는 worker 조회로 복구한다. 확정 거절은 failed. 다른 회원 주문/카드 사용은 거부한다.
- paid → refunding → refunded. 미확인 취소는 refunding 유지, 확정 취소 거절은 paid 복구. refunded 반복 요청은 성공 응답이며 원장을 중복 반영하지 않는다.
- CheckoutOrder는 locked_until·processing_started_at·paid_at·period_end를 기록한다. migration `20261008000000_payment_lifecycle`을 포함한 21개 migration은 2026-10-25 운영 DB 적용·checksum 대조를 완료했다.
- 스튜디오 finance.summary.refundReserved는 미확인 환불에 필요한 예약액이다. available에서 차감하며, 환불로 잔액이 부족해진 접수 출금은 `PAYOUT_BALANCE_CHANGED`로 이체를 막는다.

미이용 결제 환불 준비(2026-10-21): `GET /api/v1/checkout/:id/refund-eligibility`는 본인 주문의 `{eligible,reason,amount,currency}`를 공통 응답 envelope로 제공한다. `POST /api/v1/checkout/:id/refund`는 서버 기록상 미이용인 결제만 전액 취소하며, 조회 이력·과거 추적 미지원 결제를 거부한다. 프론트 진입은 없다. `/bootstrap?collection=saved|liked`는 해당 컬렉션의 유료 콘텐츠만 노출/소비 기록하고 기본 bootstrap은 유료 본문·미디어를 제외한다. 상세 판정·동시성·예외는 `provider-contracts.md`의 미이용 환불 절을 따른다.

2026-10-21 금융 정책은 DB `financial_policies`에서 매 신규 최초 결제 시 읽으며 환경변수 수수료율/보류 기간을 사용하지 않는다. 설정이 없으면 신규 결제를 차단하고, 기존 구독 갱신/승인 복구는 저장된 snapshot을 유지한다. 관리자 변경은 재시작 없이 적용하며 이력·버전 충돌 검사를 포함한다. 상세는 `provider-contracts.md` 및 `infra/platform/README.md`를 따른다.

## 확정 베타 정책 구현 (2026-10-25)

| Method | 경로 | 의미·권한 |
| --- | --- | --- |
| GET | /marketing/unsubscribe | 서명 token query 확인 HTML. 로그인 불필요·상태 변경 없음 |
| POST | /marketing/unsubscribe | 같은 token으로 무료 수신거부. 반복 요청 멱등, 필수 메일은 유지. Accept text/html이면 완료 HTML, 기본은 공통 JSON envelope |

- `BETA_MODE=true`: 초대 명단이 비어 있으면 가입 거부, 일반 콘텐츠만 공개, Toss 개별 `test_ck_`/`test_sk_`만 허용, 실제 은행 지급 차단. 기존 법률문서 signupReady와 PASS/출금 인증을 우회하지 않는다. 초기 17계정 명단은 비공개 설정에 넣는다.
- 신규 주문은 `policyVersion/refundWindowDays=7/paymentEnvironment`를 snapshot에 보존한다. paid_at부터 정확히7일 이내이며 콘텐츠 이용 이력이 없어야 자발적 전액 환불 가능. 조회/실행은 동일 판정이다. 기존 snapshot에 기한 필드가 없는 주문의 조건을 소급 축소하지 않으며 진행 중 환불은 결과 확인을 계속한다. 법정 환불은 이 자동 API의 기한으로 제한하지 않는다. 별도 화면 진입은 없다.
- 베타 갱신은 첫 실패 후24시간 간격3회 추가다. 분실/정지 카드는 교체 전 중단하고 기결제 기간 종료 후 접근을 차단한다. 테스트 snapshot을 운영 키로 재청구할 수 없다. 실결제로 전환하려면 테스트 구독을 정리하고 새 계약·결제 동의를 받아야 한다.
- 수수료·보류일은 기존 DB version 정책을 유지한다. 선택값은2000bps/7일이며 배포 때 `GET /admin/financial-policy`의 현재 version을 받아 `PUT`에 expectedVersion/2000/7/reason을 보내 적용·이력을 확인한다. 이번 작업은 운영 DB 값을 변경하지 않았다. 기존 결제 snapshot은 보존한다.
- 최소 출금100,000원(2026-10-27 사용자 결정으로 10,000원에서 상향, 콩 출금 최소 1,000콩=총액100,000원과 동일). 보류기간이 끝났어도 `receipt_confirmed_at/received_amount/receipt_reference`가 없는 수익은 출금 가능액에서 제외한다. 대사는 수동 PG·은행 기록 확인 API이며 실제 은행 조회를 했다는 보장이 아니다. 신규 지급은 수요일(KST), 이미 처리 중인 송금의 결과 확인은 다른 요일에도 가능하다. 베타는 모두 실송금 금지. 공휴일·신청마감은 실결제 전 별도 확정한다.
- 설정의 광고 동의 활성화에는 최신 marketingVersion이 필요하다. 회원가입·설정·메일 수신거부가 MemberConsent 이력과 AccountPreference 동의 ID를 같은 트랜잭션에 보존한다. 기존 true값만 있고 증빙 ID가 없으면 광고 대상에서 제외한다. 큐 등록/발송 직전 현재 동의·계정 활성·이메일 인증을 다시 확인하고 수신거부와 회원 잠금으로 직렬화한다.
- 광고 메일은 `(광고)` 제목, 발신자/연락처, 로그인 없는 수신거부 링크를 사용한다. 처리결과와2년 동의 확인은 비광고 안내다. 기한이 지난 확인 안내가 미접수이면 광고를 보류한다. SMTP 결과 불명 또는15분 이상 중단된 발송은 uncertain으로 남기고 자동 재전송하지 않는다. worker 오류 보고로 운영 확인한다. `MARKETING_MAIL_ENABLED=false` 기본이며 실제 발송은 미실행이다. List-Unsubscribe 헤더는 준비했지만 운영 DKIM 및 수신처의 one-click 인식은 검증하지 않았다.
- 추가 migration2개는 `20261025100000_beta_policy`, `20261025110000_marketing_delivery_claim`이다. 격리 테스트 DB만 적용했으며 운영과 개발 DB에는 적용하지 않았다. API/worker 배포 전에 두 migration과 DB 정책·환경값을 함께 확인한다.

근거와 전체 선택표: 프론트 `docs/beta-role-test-plan.md`. 테스트는 `tests/platform-beta-policy.test.cjs`, `tests/platform-finance.test.cjs`, `tests/platform-beta-cohort.test.cjs`; SMTP/PG/은행은 대역이다.

## 운영 방어 응답

모든 /api/v1 라우트에 구조화 query 주입 탐지 시403 INJECTION_DETECTED, 활성 IP차단 시403 IP_BLOCKED, 보안 DB조회 불가 시503 SECURITY_UNAVAILABLE envelope를 반환한다. 과대한 query는400 INVALID_INPUT. 자유 본문·공급자 콜백 본문은 SQL 문자열 필터 대상이 아니다. 상세 신뢰 경계/한계는 platform-implementation.md의 운영 이벤트 절을 따른다.

### 독립 운영 콘솔·매출 집계 (2026-10-22)

UI는 별도 `crefans_admin` 저장소의 `/console`이며 서비스 프론트에는 추가하지 않는다. 기본 local3002, API main의 default허용 출처에 local3002 추가. 명시 FRONTEND_ORIGINS 환경설정이 있으면 콘솔 출처를 직접 포함해야 한다. 배포/권한 부여를 자동으로 수행하지 않는다.

매출 `basis=approval-cohort-current-ledger`: CheckoutOrder.paid_at의 KST 구간 [시작일00:00, 종료일다음날00:00)과 RevenueEntry의 현재gross/reversals/fees/net을 조인한다. 실패/미승인 주문 제외, 이후환불은원승인기간에귀속. 일별/전체/크리에이터별집계는RepeatableRead스냅샷. 합계는페이지와독립이며creator목록20개. 플랫폼수수료는비용/세금차감전, 순이익/환불발생일현금흐름/PG정산대사가아니다. PG테스트/운영구분필드가없어테스트결제포함가능함을UI에표시한다. 요청예: `/api/v1/admin/revenue?from=2026-10-01&to=2026-10-22&page=1`.

신규 콘솔에서는 문의답변·신고처리·문서저장을 동일DB트랜잭션의 admin.* outbox(관리자memberId/대상targetId, 원문제외)에기록한다. 신고상태는PENDING인경우만변경하며경합시409. 신고처리자체가콘텐츠자동숨김을의미하지않는다. 강제회원정지/콘텐츠숨김/환불·송금UI는초기버전제외. 금융정책은기존SUPER_ADMIN/version/변경사유/이력계약유지.


### 구독 대시보드 (2026-10-22)

`GET /api/v1/admin/dashboard?date=2026-10-22&days=30`은 활성 ADMIN/SUPER_ADMIN 전용이다. `src/platform/admin-dashboard.ts`에서 기존 권한·기간 검증 및 RepeatableRead를 사용한다. `summary/previous`는 신규 구독·구독 결제 건수·gross/refunds/netSales/platformFees, `trend`는 요청한 일수만큼 누락 날짜를 0으로 채운다. 오늘은 현재까지와 어제 같은 시각까지 비교하고 과거 날짜는 전일 전체와 비교한다. 미래/잘못된 날짜와 7·30·90 외 기간은 400이다.

구독 ID가 연결된 승인 주문과 원장만 집계하며, 구독별 최초 승인 한 건을 신규 구독으로 본다. 갱신은 결제 건수/금액에 포함되지만 신규 구독에서 제외된다. 실패·미승인 주문은 제외한다. 이후 환불은 원승인일의 현재 원장을 차감한다. `basis=subscription-approval-cohort-current-ledger`이며 환불 발생일 현금흐름·MRR·순이익·고유 구독자 수가 아니다. 테스트 결제도 포함될 수 있다. `currentActive`는 조회 시점에 기간이 남은 ONGOING/CANCELLED 구독 스냅샷으로, 과거 기준일이나 전일 증감값이 아니다. 해지 예약 후 유효기간이 남은 구독을 포함한다.

근거 확인 2026-10-22: [Toss 결제 API](https://docs.tosspayments.com/reference), [거래 정의](https://docs.tosspayments.com/resources/glossary/transaction)는 승인·취소 거래를 구분한다. [Stripe active subscribers](https://support.stripe.com/questions/understanding-active-subscribers?locale=en-GB)는 고객 단위 지표이므로 본 서비스의 구독 건수와 구별했다. 본 대시보드 집계 기준은 기존 크레팬스 승인/환불 원장에 맞춘 기술적 선택이며 외부 PG 대사나 새 사업 정책이 아니다. 실제 DB·HTTP 검증은 `tests/platform-admin-console.test.cjs`, 브라우저는 별도 admin 저장소 `e2e/console.spec.ts`.


### 운영 로그 API (2026-10-22, 로컬 구현)

| Method | 경로 | 의미·권한 |
| --- | --- | --- |
| GET | /admin/logs | 활성 ADMIN/SUPER_ADMIN. KST from/to 최대366일, category/level/ip/requestId/actorId/entityId/jobId/action 정확일치, page당20건 |
| GET | /admin/logs/:id | 동일 권한. 상세·동일 요청/대상/배치의 최근100건 타임라인·outbox 발송 상태, 미존재404 |
| POST | /admin/client-errors | 활성 관리자. 비신뢰 브라우저 오류 종류·정적 JS 위치 보고, IP별10회/분 |
| POST | /telemetry/browser-errors | 선택 인증. 서비스 브라우저 오류 보고, 동일 제한·허용 목록 재검증 |

응답 envelope 4개 필드는 유지하며 `X-Request-ID` 응답 헤더를 추가했다. 클라이언트 입력 ID는 신뢰하지 않는다. 로그 API는 수정/삭제를 제공하지 않는다. 수집·보관·감사/외부 공급사 실패 경계·공식 근거는 [운영 사고 추적 로그](./operational-logging.md)를 따른다. 운영 배포 상태는 PROGRESS 최신 기록과 실행 증거를 확인한다.


### 카드 불능·갱신 복구 응답 (2026-10-22)

- `/api/v1/common`의 `paymentMethods[]`와 bootstrap 계정 결제수단에 `requiresUpdate:boolean` 추가. 서버만 보관하는 분실/정지 구체 코드·빌링키는 반환하지 않는다. `PUT /billing/methods/:id`의 default 작업은 불능 카드를 거부하며, 사용 가능한 새 기본 카드는 현재 자동갱신 구독의 미결제 다음 시도에 반영된다. 기존 processing 주문의 카드/주문은 변경하지 않는다.
- bootstrap `subscriptions[]`에 `renewalPending`, `billingIssue?:action_required|retrying`, `retryAt?:ISO시간` 추가. `status:expired`는 이용권한 만료와 일치하며 renewalPending이 true이면 결제 복구 대기가 별도로 남아 있다. 같은 크리에이터의 갱신 대기와 신규 구독을 동시에 청구할 수 없다. 해지 후에는 복구하지 않는다.
- 확정 카드 불능의 공통 오류 코드는 `PAYMENT_METHOD_UNAVAILABLE`. 기존 4필드 응답 틀과 `/api/v1`을 유지. `PAYMENT_UNCERTAIN`은 결제 조회로 확인하고 실패로 바꾸지 않는다. 결제된 종료일 이후 권한은 확정 갱신 성공 전까지 없다.
- 새 공개 route 없이 기존 결제수단/구독 경로를 재사용한다. `billing_notices`의 실패/종료 안내는 worker가 처리하고 실제 SMTP 접수 성공 및 실패는 감사 원장에 기록한다. 한계/공식근거는 provider-contracts의 정기결제 실패 분류 절을 따른다.

## 멤버십 레벨 공개 (2026-10-22)

- `POST /studio/memberships`: 선택적 정수 `rank`(1~100)를 받아 MembershipItem.level에 저장. 신규 생략은1, 기존 수정 생략은 기존값 유지. version과 MembershipVersion.snapshot.rank 발행, 기존 주문/구독 snapshot은 변경하지 않는다.
- `POST /studio/content`: `accessPlanId`가 있으면 해당 상품 전용. `accessPlanId:null, accessLevel:N`이면 최소 레벨 N 이상. 둘 다 null이면 전체 공개. 최소 레벨은 정수1~100, 상품과 동시 설정은400. 타인 상품/미디어 거부. 이전 클라이언트가 accessLevel을 생략한 기존 레벨 게시물 수정은 원래 최소 레벨을 보존한다. 전체 공개 전환은 명시적 null을 보낸다.
- `/studio/overview`는 membership.rank와 content.accessLevel을 반환. DB 신규 컬럼/마이그레이션 없이 기존 is_membership/membership_level/access_plan_id를 이용한다. 기존 상품 전용 글을 자동으로 레벨 공개로 바꾸지 않는다.
- 팬 응답 requiredPlanId 존재 시 상품 전용, 없으면 requiredRank 최소 레벨. Plan.entitlementMode 과거값이 exact여도 게시물의 공개 범위가 레벨이면 가입 당시 유효한 정수 rank로 판정한다. 본문·댓글·미디어는 동일한 서버 검사, 파일 GET/HEAD/Range와 URL 공유 차단 유지.
- 공식 근거 확인 2026-10-22: [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)의 매 요청 검사/기본 거부/회귀검사 적용. [Patreon 게시물 공개 설정](https://support.patreon.com/hc/en-us/articles/37807653033997-Setting-post-access-for-your-Patreon-audience)은 선택한 tier만 허용하므로 상위 레벨 자동 포함이 모든 서비스의 공통 표준이라고 주장하지 않는다. 최소 레벨 이상은 이번 사용자 요구의 적용 판단이며 상품 전용도 보존한다.

### 코드 관리 약관 계약 (2026-10-22)

- `/common.legal` 및 `/bootstrap.account.agreements`: 코드 문서 본문·version·status·effectiveAt·notice·선택 링크. 가입용 versions는 문서 전체의 해시와 버전을 포함한다. DB 약관 게시로 대체하지 않는다.
- `POST /auth/signup`: `policyVersions`(terms/privacy, 마케팅 동의 시 marketing) 필수, 누락/구버전/변조409. 동일 트랜잭션에 원문과 해시를 저장한다. 현재 공개본도 가입 적용 시행일과 절차가 미완료여서503 POLICY_NOT_PUBLISHED이며 가입 인증 메일 요청도 차단한다.
- `/admin/documents`: FAQ·공지로 한정. terms/privacy/policy 또는 기존 법률문서를 다른 종류로 덮어쓰기 거부.
- 준비 상태와 법률·구현 미해결 항목은 [구현 문서](./platform-implementation.md)의 코드 관리 약관 절을 따른다. 문서 공개 배포를 가입 적용 시행본 발행이나 가입 개방으로 보고하지 않는다.

- 가입 기준은 생일 기준 만19세 이상(2026-10-22 사용자 확정). 기본 PASS 가입 모드는 서명된 PASS 콜백의 adultVerified=true와 DB identityProof.adult_verified를 모두 검사하며 누락/false/비boolean·클라이언트 자가신고는 MINIMUM_AGE_REQUIRED(403). 공급사 요청의 signup minimumAge=19 계약은 provider-contracts.md 참조. 실제 공급사 나이 산출 검증은 연결 후 별도 수행.

- 공개본2026-10-22.1: 문서 status=published/publishedAt=2026-10-22와 effectiveAt=null을 구분한다. 가입 bundle의 documentsPublished=true, signupReady=false, blockingMessage가 실제 준비 상태를 표시한다. 기존 published는 가입 가능 여부의 호환 필드로 signupReady와 같다. API와 가입 화면은 문서 status만 보고 가입을 허용하지 않는다.


## PASS 보류 가입 모드 (2026-10-24)

- 서버 `SIGNUP_IDENTITY_MODE=pass`가 기본이며 잘못된 값도 PASS 필수다. 명시적인 `email-only`에서만 가입의 PASS 증명을 보류한다. `/bootstrap.account.signupRequirements`의 `identityRequired`/`inviteOnly`가 공용 가입 화면을 제어한다.
- email-only도 이메일 일회용 proof·비밀번호·필수 문서 버전·동의·`ageAcknowledged === true`를 검사한다. 이 확인은 성인인증이 아니며 `identity_hash=null`, 실명은 빈 값으로 저장한다. 임의 `identityVerified`/`adultVerified` 입력으로 권한이 생기지 않는다. 민감 콘텐츠·출금 본인확인은 계속 별도 서버 증명을 요구한다.
- `SIGNUP_EMAIL_ALLOWLIST`에 쉼표로 구분한 이메일이 있으면 인증 메일 요청과 가입 모두 명단을 검사한다. 베타 모드가 아니면 빈 값은 초대 제한 없음이며, `BETA_MODE=true`에서는 빈 값도 가입·인증메일 요청을 거부한다. 명단은 응답에 포함하지 않는다.
- 2026-10-25 운영은 `SIGNUP_IDENTITY_MODE=email-only`로 전환했다. 운영 bootstrap의 `identityRequired=false`와 PC/모바일 PASS 미노출을 확인했다. 공개 법률문서 `signupReady=false`와 빈 베타 초대 명단 차단은 유지하여 가입 개방을 뜻하지 않는다. 시행 문서·실제 처리 절차와 초대 명단이 준비된 뒤 개방한다. [운영 대조 증거](../../crefans_front/docs/audit/release-completeness-20261025.json).
- 검증: `tests/platform-signup-mode.test.cjs`, `tests/platform-beta-cohort.test.cjs`, front `e2e/signup-deferred.spec.ts`; 모집 인원과 97개 전체 검수 대응은 [역할별 베타 검수 계획](../../crefans_front/docs/beta-role-test-plan.md).


## 운영자 부여 크리에이터 인증 배지 (2026-10-24)

- `Creator.is_verified`는 기본 false이며 PASS 본인인증·광고 노출·멤버십 권한과 별개다. 운영자 콘솔의 회원·크리에이터 목록에서 활성 ADMIN/SUPER_ADMIN이 확인 후 부여·해제한다. MODERATOR/일반 회원/비로그인/비활성 관리자는 변경할 수 없다.
- `PUT /api/v1/admin/creators/:id/verification`의 id는 회원 ID이며 `isVerified` boolean만 저장한다. 잘못된 타입은 400, 크리에이터 레코드가 없으면 404. 동일 상태 요청은 성공하되 변경 이력을 중복 생성하지 않는다. 크리에이터 행 잠금 안에서 변경과 `admin.creator_verification_changed` 감사 기록을 같은 트랜잭션으로 저장한다. 기록은 운영자·역할·IP·요청 ID·대상·변경 전후 상태를 포함한다.
- 공개 프로필/탐색/피드 작성자/초기화 및 댓글 작성자에는 `isVerified`를 직렬화한다. 프로필 편집에서는 서버가 허용한 필드만 저장하므로 회원이 `isVerified`나 `is_verified`를 보내도 부여되지 않는다. 이미 열린 화면은 다음 데이터 조회/새로고침에서 갱신되며 실시간 푸시 기능은 아니다.
- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 및 [Mass Assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html), 확인일 2026-10-24: 매 요청 기본 거부·역할 검사와 수정 필드 허용목록을 적용했다. 인증 판정 기준은 운영자가 판단하며 PASS/성인확인 또는 콘텐츠 품질 보증으로 사용하지 않는다.
- 검증: `tests/platform-admin-console.test.cjs`, `tests/platform-openapi.test.cjs`, 별도 콘솔 `e2e/console.spec.ts`. 로컬 격리 MySQL과 실제 HTTP로 부여·해제·권한·감사를 검증했다. 2026-10-24 운영에 `20261024120000_creator_verification` migration과 API·콘솔·프론트를 반영했으며 운영 크리에이터0명이라 실제 계정 변경은 하지 않았다. 로컬 증거는 프론트 `docs/audit/creator-verification-20261024.json`, 운영 소스/DB/권한 거부·브라우저 증거는 [배포 검증](../../crefans_front/docs/audit/creator-verification-deployment-20261024.json)이다.

## 콩 충전·후원·출금 (2026-10-25, 운영 테스트 배포)

공통 `/api/v1` 4필드 envelope를 유지한다. Bean BigInt 잔액/원장 증감은10진 문자열, 주문/후원 수량과 원화는 안전 정수다. bootstrap과 admin/me의 beanSupport로 메뉴를 제어한다. BEAN_LEDGER_ENABLED=false면 기능은503이며 일반 가입/멤버십 경로를 활성화하지 않는다. 실결제는 추가로 BEAN_LIVE_PAYMENTS_APPROVED=true와 공급사 승인이 필요하다. 베타는 테스트 키만 허용하고 은행 송금을 막는다.

| Method | 경로 | 의미·검증 |
| --- | --- | --- |
| GET | /beans/wallet | 세션 본인 지갑 멱등 생성·5원장잔액·사용가용 합/일반·프로모션 세부합·일반·프로모션 후원 출처 심사 후 출금가용 합/종류별 합·필터 후 충전/이동 각20건·총수, page/from/to/status/direction (후속 필터는 로컬 반영) |
| POST | /beans/charges | quantity(1~100000 정수), requestId; 110원/콩(VAT 포함) 서버 계산, 환경 snapshot·30분 주문·회사재고 예약, 미완료 최대5건 |
| GET | /beans/charges/:id | 본인 충전 상태, 타인404, paymentKey 미노출 |
| POST | /beans/charges/:id/payment-window | 본인 유효 주문, 환경 일치·개별 결제창 clientKey/customerKey/orderId/amount |
| POST | /beans/charges/:id/confirm | paymentKey/orderId/amount 검증, PG lookup/confirm, 원주문 lease·1회 lot/원장; 불확실 결과는 재조회 |
| GET | /beans/charges/:id/refund-quote | 본인 충전의 미사용 충전콩 환불 예상(quantity·gross·deduction·amount·fullRefundWindow). 결제 후 7일 이내 전액, 이후 10% 공제(beanPolicy.refundFullDays·refundDeductionBps). 프로모션콩·사용분·만료분 제외 |
| POST | /beans/charges/:id/refund | requestId 멱등. lot 예약 후 토스 부분취소(cancelAmount) → 성공 시 원장 purchased→회사 stock, 충전 refunded_quantity/amount 누적. PG 거절은 콩 복원(failed), 결과 불명은 processing 유지(BEAN_REFUND_IN_PROGRESS로 재시도 차단) |
| POST | /creators/:id/tips | 세션 후원자·활성 크리에이터 회원ID, quantity/requestId/message(선택500자)/postId(선택), 본인후원 불가·프로모션 우선·출처 보존; 구독권 미부여 |
| GET | /beans/tips | 필터 후 보낸 후원20건·page·total, from/to/q, 본인만 (후속 필터는 로컬 반영) |
| POST | /beans/webhook | 공개 접수200, IP별30회/분, UUID 주문 재조회 대기만 변경; 본문으로 승인/지갑 수정 불가 |
| GET | /studio/bean-finance | 크리에이터 지갑/받은 후원/실입금·보류 완료 가용수량/출금/검증계좌/PIN 상태, page |
| GET | /studio/tips | 받은 후원20건·page·total, 크리에이터 본인 |
| POST | /studio/bean-withdrawal-quotes | quantity>=1000·accountId 본인 검증계좌·live입금 출처, 총액/20%/실지급 견적. 열린 콩 미수금이 있으면 409 RECEIVABLE_OPEN(멤버십 미수금은 콩 출금을 막지 않음, 2026-10-30). closing:true면 탈퇴 준비 조건 충족 시 출금 가능 전량을 최소 수량 미만이라도 신청(CLOSING_WITHDRAWAL_ALL·EARNINGS_PENDING) |
| POST | /studio/bean-withdrawals/verify | quantity/accountId/pin, 기존 PIN 해시와5회/30초 제한 재사용, 2분 수량·계좌버전 인증 |
| POST | /studio/bean-withdrawals | quantity/accountId/authorizationId/requestId, 받은 일반콩 가용 lot를 원자 예약, 중복/경합 방지 |
| GET | /admin/beans/overview | 활성 ADMIN/SUPER_ADMIN만 회사재고/충전·후원·출금/부채·환경별 집계, page |
| GET | /admin/beans/wallets/:id | SUPER_ADMIN 본인 업무로 회원 지갑·원장·최근100 출처 lot/충전·배분 추적, page |
| POST | /admin/beans/promotions | SUPER_ADMIN, memberId/quantity/reason/requestId, 회사재고→프로모션, 중복 지급 방지·사유 기록 |
| POST | /admin/beans/charges/:id/receipt | SUPER_ADMIN, amount/reference/receivedAt/reason, live 승인된 원주문 실제입금 대사·불변 기록/감사 |
| POST | /admin/beans/charges/:id/refund | beans.update. requestId·reason, waived=true면 회사 귀책으로 7일 이후 10% 공제 면제 |
| GET | /admin/beans/receivables | beans.view. 열린 미수금(멤버십·콩). 지급 후 환불·차지백으로 생김(D4), 생성 시 크리에이터에게 정산 알림 |
| POST | /admin/beans/receivables/:id/settle | beans.update. note 필수. 콩 미수금만 수동 정산(회수 확인). 멤버십 미수금은 작업이 이후 수익으로 가용잔액 ≥0이 되면 자동 정산(409 RECEIVABLE_AUTOMATIC) |
| POST | /admin/beans/withdrawals/:id/approve | SUPER_ADMIN, beta/은행 활성화/수요일·실결제 재조회·동결·계좌버전 검증, 동일 은행ID; 승인 클릭 자체는 송금성공 아님 |
| POST | /admin/beans/withdrawals/:id/reject | SUPER_ADMIN, reason, requested/blocked만 반려·예약 반환·감사. 은행 결과 미확정 processing 임의 반려 금지 |

직접 지급받은 프로모션/직접 구매는 출금 불가. 후원받은 콩의 lot release_at은 후원 시점+7일(beanPolicy.tipHoldDays, 2026-10-30 변경; 이전엔 충전 lot 상속). 후원받은 일반콩은 live 승인·실입금(총액80~100%)·후원 후 7일 보류 완료·미동결 lot만 지급 가능하다. 후원받은 프로모션콩은 회사 지급기록·후원 연결·수신자 일치·release_at 도래·미동결을 검사하여 과거 잔액도 지급 가능하다. 최소1000콩 총액10만원→수수료2만원/실지급8만원. 출금 성공 때1000콩 전량 회사 재고로 회수하고 수수료는 한 번만 확정한다. 입금 확인 증빙은 외부 은행 이체 결과와 다른 절차이며 운영자 허위 입력을 기술적 대사 완료로 표현하지 않는다.

worker는 충전/결과불명·만료·승인 후 취소와 지급 대사를 반복한다. 네트워크 결과 불명이면 예약을 유지하며 은행 반려가 확정된 때만 반환한다. 외부 취소는 원출처 동결·관련 요청 보류로 운영 사건을 남긴다. `withdrawAccount`는 콩 잔액·미완료 주문/지급이 있는 계정의 탈퇴를 같은 회사 지갑 잠금 아래 거부한다.

충전 현금유입, 후원 사용액, 지급 총액, 지급 완료 수수료를 별도 집계한다. 기존 멤버십 매출/리포트와 합산하지 않는다. test/live/promotion을 구분하고 대시보드의 실입금·확정 수수료에서 test를 제외한다. 법정 매출·부가세 인식은 별도 확인 사항이다. 검증: tests/platform-beans.test.cjs, tests/platform-bean-ledger.test.cjs, tests/platform-openapi.test.cjs, 프론트/콘솔 e2e/beans.spec.ts. 실제 PG/은행·운영 배포는 미실행이다.

운영 적용2026-10-25: beans-20261025, 기능 on·베타/테스트 결제·live 판매/실출금/광고메일 off. DB21migration·회사 초기원장·수수료20%/보류7일 version2·운영 HTTP/브라우저/배치 상태를 [배포 증거](../../crefans_front/docs/audit/bean-deployment-20261025.json)에서 확인한다. 위의 실공급자 미실행은 유지하며 운영 코드 배포와 실금융 개방을 구분한다.

2026-10-25 지갑 요약 응답 확장(운영 반영: bean-wallet-20261025): `spendableBeans`와 `spendableBreakdown:{purchased,promotion}`은 미동결 구매/프로모션 lot의 available 합이다. `withdrawableBeans`는 스튜디오/견적과 동일한 기존 `eligible` 판정(일반콩의 live 승인·실입금·보류완료 또는 검증된 프로모션 후원 수익)을 재사용한다. 2026-10-26부터 `withdrawableBreakdown:{paid,promotion}`으로 구분한다. 직접 지급·미입금·테스트 결제·동결·예약 수량을 출금 가능액에 합산하지 않는다. 기존 accounts는 원장 총잔액이므로 프론트의 큰 지표로 대체하지 않고 접힌 세부내역에만 쓴다. 새 API/DB migration·원장 이동/수수료/은행 정책 변경은 없다. 검증은 실제 격리DB/공급사 대역 `tests/platform-beans.test.cjs`의 동결 구매 제외·입금 전0/입금 후1100·보류/동결0·출금 예약 후100 검사와 [프론트 증거](../../crefans_front/docs/audit/bean-balance-hierarchy-20261025.json).

위 지갑 응답과 공용 지갑/충전 UI는 `bean-wallet-20261025` 운영 반영. migration21개·정책 version2(20%/7일)·주문/충전/후원/출금 건수 불변, 실제 지급·청구 없음. 실행 API196/프론트553파일 SHA와 이미지 전체 RootFS·HTTP14/브라우저14·신규 worker heartbeat 검증은 [운영 기록](../../crefans_front/docs/audit/bean-wallet-deployment-20261025.json)을 따른다. 인증된 실제 지갑 응답 필드 호출은 미실행이며 격리DB 대역 검사/운영 실행소스와 구분한다.

2026-10-25 `bean-vat-20261025`: 신규 충전 단가는 `beanPolicy.chargeKrwPerBean=110`이며 지갑 policy에도 제공한다. 기존 `krwPerBean=100`은 후원·출금 가치다. 기존 주문의 amount는 변경하지 않고 재시도/결제창/승인에서 그대로 검증한다. 관리자 충전현금유입은 실제 저장 amount,후원/출금은 콩수량×100원으로 계속 분리한다. [이번 운영 검증](../../crefans_front/docs/audit/bean-vat-deployment-20261025.json).

### 콩 환불·유효기간·미수금 (2026-10-30, /pilot-work D4·D6)

- 환불: 충전 후 7일 이내 미사용 충전콩 전액, 이후 10% 공제(회사 귀책은 운영자가 면제). 사용분·프로모션콩·만료분 제외. 원결제 부분취소(토스 cancelAmount, 공식 문서 docs.tosspayments.com/guides/v2/cancel-payment 2026-10-30 확인 — 카드 부분취소 환불은 영업일 3~4일).
- 유효기간: 충전콩은 결제일, 프로모션콩은 지급일부터 5년(`bean_lots.expires_at`, 기존 lot은 마이그레이션 `20261030200000_pilot_followups`에서 채움). 만료 30일 전 1회 앱 알림+메일(type bean-expiry), 만료 시 남은 수량을 회사 `expired` 계정으로 이동. 만료 lot은 후원·지갑 사용 가능액에서 제외.
- 미수금(`creator_receivables`): 멤버십은 환불 완료 때 가용잔액이 음수가 되면 min(해당 결제 net, 부족액)을 기록하고 작업(`receivables`)이 이후 수익으로 0 이상이 되면 자동 정산. 콩은 차지백(freezeCharge) 때 이미 paid 지급에 쓰인 출처를 지급 단가(net/quantity)로 환산해 기록, 운영자 정산 전까지 콩 출금 차단. 둘 다 크리에이터에게 정산 알림.
- 메일 큐 `member_notices`: 운영 조치·콩 만료 안내 메일. 탈퇴·미인증 주소는 건너뜀, 실패 시 지수 백오프.

### 콩 내역 필터와 주문 생성시각 (2026-10-26, 운영 미배포)

- `GET /beans/wallet?page=1&from=2026-10-01&to=2026-10-26&status=paid&direction=in`: KST 시작일00:00 이상·종료일 다음날00:00 미만. status는 주문에, direction=in/out은 이동 delta>0/<0에만 적용한다. 모두 필터 후 created_at DESC,id DESC 정렬,20건씩 skip/take, chargesTotal/entriesTotal 별도 총수. 잔액 계산은 필터로 줄이지 않는다.
- `GET /beans/tips?page=1&from=2026-10-01&to=2026-10-26&q=모카`: 본인 sender_id와 기간 AND (표시 크리에이터명 OR 후원 당시 게시물 제목 OR 메시지 부분 검색). q는100자 이하이며 LIKE 와일드카드 문자는 문자 그대로 취급한다. `items/total/page` 유지. 스튜디오 받은 후원 호출은 기존 계약을 유지한다.
- 값 타입·날짜 유효성·역전 기간·status/direction enum 오류는 `INVALID_HISTORY_FILTER`(400). page1~10000 기존 조건 유지. Prisma where 조건으로 구성하며 사용자 문자열을 raw SQL로 조합하지 않는다. 소유권 조건은 필터로 변경할 수 없다.
- 생성·상세·확인·지갑의 주문 응답에 `createdAt`을 포함한다. DB created_at 기반이며 HTTP JSON에서는 ISO8601 문자열이다. 프론트 표시 `CF-YYYYMMDDHHmmss`(KST)는 UUID를 대체하는 식별키가 아니다. 생성 초가 같으면 표시번호는 중복될 수 있으며 결제·멱등성·권한은 기존 id를 사용한다. 데이터/정책/migration 변경 없음.
- Prisma Client6.9.0 + 로컬 MySQL 격리DB에서 날짜 양끝/20건 이후 조회/타인 차단/와일드카드 리터럴/잘못된 조건 거절을 검증했다. 공식 최신 Prisma 문서는 다른 API 세대로 이동해 이번 구현의 버전 근거로 사용하지 않았다. 배포 전 프론트와 API 릴리스를 함께 준비한다. [검증](../../crefans_front/docs/audit/bean-history-filters-20261026.json).

2026-10-26 후속 운영 반영: 위 주문번호·세 이력 필터와 예시 데이터를 frontend/API/worker `bean-history-20261026`로 배포했다. 이전 미배포 표기는 당시 기록이다. 소스해시·주요HTTP·worker·운영 목업4브라우저 조건 통과, DB/금융정책 유지. [배포 검증](../../crefans_front/docs/audit/bean-history-deployment-20261026.json).


### 게시물 후원자 수 (2026-10-26)

게시물 응답 `supporterCount`는 `bean_tips`의 게시물별 고유 `sender_id` 수다. 프로필 후원(post_id 없음)은 제외하고 동일 회원의 반복 후원·멱등 재시도는 한 명으로 집계한다. 후원자 ID/개인정보는 공개 게시물 응답에 포함하지 않는다. 게시물 후원 성공 응답도 이 수치를 반환하며 공통 BeanModel에서 카드/상세/갤러리에 공유한다. 기존 권한·게시물 소유자 검사·콩 원장은 유지한다.

프론트는 동전 아이콘+인원수, 게시물 제목이 있는 전용 입력/확인/완료 화면을 사용한다. 후원 유입 충전 완료는 해당 게시물 후원으로 복귀한다. 배포 시 API/프론트와 `20261026090000_post_supporters` 복합 인덱스 마이그레이션을 함께 적용해야 한다. 2026-10-26 social-tips-20261026 릴리스로 운영 반영.

### 게시물 후원 설정 (2026-10-26)

게시물/스튜디오 콘텐츠의 `tipsEnabled`는 `postings.allow_tips`다. 작성·수정은 boolean 값을 받고 생략 시 기존값(신규 true)을 보존한다. 공개 범위와 별개로 전체공개도 후원 가능하다. 꺼진 글의 신규 후원은 게시물 행 잠금 후409 POST_TIPS_DISABLED로 거절하며 잔액과 원장을 변경하지 않는다. 성공한 동일 요청 재시도는 기존 응답을 반환한다. 본인 후원은 기존대로 금지. 변경은 콘텐츠 감사이력에 포함한다. migration20261026110000_post_tip_setting 필요.

### 팔로워·팔로잉 공개 설정 (2026-10-26)

`PUT me/settings` privacy의 `showFollowers`와 `showFollowing`은 각각 목록·숫자 공개를 제어한다. 기존 클라이언트가 showFollowers를 생략하면 저장된 값을 유지한다. 기본은 둘 다 공개. bootstrap/publicProfile의 followersPublic/followingPublic로 공통 프로필 자물쇠를 표시하고, 타인에게 비공개 팔로워 수는 빈 문자열·followerCount 없음으로 반환한다. 소유자는 API로 자기 수·목록을 조회할 수 있으나 타인은 비공개 목록403. 새 DB migration은 없다. 검증 tests/platform-connections.test.cjs.


### 후원 대상·출금 출처 표시 (2026-10-26, 운영 배포 완료)

- `BeanTip.post_title_snapshot` nullable TEXT를 추가한다. 신규 게시물 후원은 같은 원장 트랜잭션에서 잠근 게시물의 제목을 저장한다. 기존 후원의 제목이나 원장 사유를 소급해서 덮어쓰지 않는다.
- 후원 응답·보낸/받은 후원·관리자 목록: `sourceType=post|profile`, `postTitle`, `postTitleSource=snapshot|current|unavailable|null`, `postAvailable`. 당시 제목이 없으면 현재 제목임을 표시하고, 삭제/비공개 글은 연결을 제공하지 않는다. 삭제 뒤에도 당시 제목·post_id와 출금 배정은 보존된다. 이 표시는 게시물 열람 권한을 부여하지 않는다.
- 지갑 `entries[].movement.tip`은 본인과 연결된 후원의 동일한 정보다. 신규 이동 사유는 게시물 후원/프로필 후원으로 기록하며 과거 원장 reason은 보존한다.
- 스튜디오 `receivedByType`은 유형별 전체 건수와 일반/프로모션 수량. 관리자 `summary.tipSourceGroups`는 유형별 live/test/promotion 수량이다. 기존 총액과 동일 원천을 분리 표시하며 충전과 후원을 중복 합산하지 않는다.
- 스튜디오/콘솔 `payouts[].sources`의 `postQuantity/profileQuantity/unattributedQuantity`는 해당 출금의 실제 lot 배정 수량이다. 한 후원 중 일부만 출금한 경우 배정된 양만 센다. 출처가 없는 잔여량은 확인 필요로 표시하고 프로필 후원으로 추정하지 않는다. 수수료는 출금 자체의 저장된 금액만 사용한다.
- 근거: `src/platform/bean-attribution.ts`, `beans.service.ts`, `tests/platform-beans.test.cjs`. 새 migration `20261026120000_tip_attribution`을 DB 백업 후 운영에 적용했고 API/프론트/별도 관리자를 `tip-attribution-20261026`으로 함께 반영했다. 실제 운영 후원·출금 이력은 없으므로 금융 종단 검증은 격리 DB·공급사 대역 결과와 구분한다. [운영 배포 증거](../../crefans_front/docs/audit/tip-attribution-deployment-20261026.json).

### 프로모션 후원 수익 출금 (2026-10-26)

- `policy.promotionCashWithdrawal=false`는 직접 지급받은 잔액의 출금 제한을 유지한다. `earnedPromotionCashWithdrawal=true`, `withdrawableBuckets=[earned-paid,earned-promotion]`이 후원 수익 정책이다. 기존 단수 `withdrawableBucket`은 v1 호환 기본값이며 전체 허용 목록이 아니다.
- 최소1,000콩·가치100원·수수료20%·PIN/본인계좌·수요일 지급·BETA/BANK 비활성 가드 유지. 일반콩을 포함한 출금만 PG운영키/원결제 재확인 필요. 프로모션 전용 출금은 PG 승인으로 위장하지 않는다.
- 기존 `reserved-paid`는 호환되는 공동 출금예약 계정이다. allocation과 lot 원종류를 보존하여 관리자/은행 반려 때 일반/프로모션 잔액에 각각 복원한다. DB 스키마/기존 이력 변경 없음.
- payout `funding:{paidQuantity,promotionQuantity,unknownQuantity}` 및 admin `summary.payoutFundingGroups`(environment/status/source/quantity/gross/fee/net)가 재원을 구분한다. 회사 부담 프로모션 실지급과 차감액을 PG충전 매출에 합산하지 않는다. 합계 금액은 저장된 출금 금액에 기반하며 회계·세무 처리 확정을 의미하지 않는다.
- 근거 확인일2026-10-26: [Prisma v6 트랜잭션](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)의 원자적 커밋/롤백 및 멱등성, [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)의 서버 권한검사·실행 직전 검증·일회성 인증을 적용한다. 최신 v8 문서는 본 프로젝트 v6에 적용하지 않았다. 지급 범위는 사용자 사업 결정이며 위 문서가 이를 법적으로 승인하는 근거는 아니다.

## 운영자·메뉴 권한 (2026-10-28)

- 모든 `/admin/*` 경로는 `@Permit`로 메뉴·동작을 선언하고 `PlatformAdminGuard`가 매 요청 확인한다. 선언 없는 경로는 기본 거부(OWASP Authorization Cheat Sheet: deny by default, 모든 요청 검증, 최소 권한; 2026-10-28 확인).
- 메뉴와 실제 존재하는 동작만 부여할 수 있다: 대시보드(조회), 회원·크리에이터(조회·수정), 콘텐츠·신고(조회·생성·수정), 매출·정산(조회·생성=입금 대사), 콩 후원·출금(조회·생성=프로모션 지급·입금 대사, 수정=출금 승인·반려), 고객지원(조회·생성·수정), 운영 설정(조회·수정), 운영 로그(조회). 현재 삭제 동작이 있는 메뉴는 없다. 다른 동작은 조회 권한이 있어야 줄 수 있다.
- SUPER_ADMIN은 전체 권한. 운영자·권한 관리와 광고 메일 등록은 SUPER_ADMIN 전용이며 위임하지 않는다(권한 상승 방지). 사용자 결정(2026-10-28): 금융 실행(출금 승인·지급·정책 변경)도 권한표로 위임 허용.
- `admins.permissions`가 null인 기존 ADMIN/MODERATOR는 이전 역할 범위를 그대로 쓴다. 신규 부운영자는 role=ADMIN + permissions JSON.
- 임시 비밀번호(`must_change_password`) 상태에서는 me·me/profile 조회·me/password 외 모든 관리자 경로가 403 PASSWORD_CHANGE_REQUIRED.
- 운영자 계정 분리(2026-10-28 사용자 지시): 운영 콘솔 계정·비밀번호·전화번호는 `admins`, 세션은 `admin_sessions`에 둔다. `/admin/*`는 운영자 세션 쿠키만 인정하고 회원 세션(access_token)은 무시한다. 운영자 비밀번호로 팬 로그인 불가, 회원 비밀번호로 콘솔 로그인 불가. `user_sub`는 감사 이력용 운영자 식별자로만 남는다(기존 운영자는 이전 회원 ID 값을 유지해 과거 이력과 연결).
- 마이그레이션 `20261028150000_admin_accounts`: 기존 운영자는 연결돼 있던 회원의 비밀번호 해시·전화번호를 한 번 복사해 같은 비밀번호로 계속 로그인한다(평문 미취급). 콘솔 전용으로 만들어졌던 `op_` 회원 행만 삭제하고 실제 팬·크리에이터 회원은 그대로 둔다.


## 광고상품 관리 (2026-10-29, 로컬 구현·운영 미배포)

모든 경로는 `/api/v1` 접두어와 기존 공통 응답을 사용한다. 광고 주문·결제·광고기간·매출 API는 아직 없다.

| Method | Path | 계약 |
| --- | --- | --- |
| GET | /studio/advertising/products | 회원 세션 및 크리에이터 등록 필수. visible=true/deleted_at=null, 정렬 순서·ID순 최대100개. 판매중지 상품도 안내 조회 가능 |
| GET | /admin/advertising/products | advertising.view. page(1부터)/deleted(true·false),20개 페이지와 total/page. 삭제 상품 별도 조회 |
| POST | /admin/advertising/products | advertising.create. name/description/terms/placement/amount/durationDays/visible/onSale/sortOrder, 판매 허용 시 terms 필수 |
| PUT | /admin/advertising/products/:id | advertising.update. 동일 필드와 expectedVersion 필수, 충돌409·없는/삭제상품404 |
| DELETE | /admin/advertising/products/:id | advertising.delete. expectedVersion 확인, deleted_at 및 숨김/판매중지, 반복 삭제 멱등. 물리 삭제 없음 |
| GET | /admin/invites | invites.view. page/status(active·used·revoked)/search(이메일·메모), 20개 페이지. 초대별 개별 조건(terms)·가입 회원 ID |
| POST | /admin/invites | invites.create. email/memo와 개별 조건(platformFeeBps·settlementHoldDays·beanWithdrawalFeeBps·minimumWithdrawalKrw, null=기본값). 조건이 있으면 settings.update와 confirmation '정책 변경' 필요. 가입 회원 이메일·중복 409, 취소된 이메일은 같은 행 복구 |
| PUT | /admin/invites/:id | invites.update. memo·개별 조건과 expectedVersion. 조건 변경 시 settings.update·확인 문구. 가입 완료·취소 초대 409 |
| DELETE | /admin/invites/:id | invites.delete. expectedVersion 확인 후 revoked_at 기록(이 이메일은 다시 가입 코드 불가). 가입 완료 초대는 409 |
| POST | /admin/posts/:id/moderation | content.update. hidden(true/false)·reason 필수. 숨긴 게시물은 작성자 외 피드·프로필·상세·댓글·반응·미디어·게시물 후원에서 제외, 스튜디오에는 hiddenByOperator 표시. moderation_actions에 기록. publicReason(당사자에게 보일 사유, 500자) 필수(2026-10-30 D11): 당사자에게 앱 알림(type moderation, 목록 분류 "운영 안내")과 메일 큐(member_notices)로 공개 사유를 알림. reason은 내부 기록 |
| POST | /admin/posts/:id/review | content.update. 베타 사후 검수 완료 표시(reviewed_at). 작성자가 수정하면 미검수로 복귀, 숨김도 검수로 간주. 목록은 GET /admin/posts?review=pending |
| GET | /admin/posts/:id/moderation | content.view. 게시물 조치 이력(최신 100건, 사유·처리자·일시) |
| POST | /admin/comments/:id/moderation | content.update. hidden·reason 필수. 숨긴 댓글은 모든 목록에서 제외(숨긴 최상위 댓글의 답글 포함)·게시물 댓글 수 감소, 해제 시 복구. moderation_actions(target_type COMMENT) 기록. publicReason(당사자에게 보일 사유, 500자) 필수(2026-10-30 D11): 당사자에게 앱 알림(type moderation, 목록 분류 "운영 안내")과 메일 큐(member_notices)로 공개 사유를 알림. reason은 내부 기록 |
| GET | /admin/comments/:id/moderation | content.view. 댓글 조치 이력(최신 100건) |
| POST | /admin/members/:id/suspension | members.update. suspended·days(7/30/null=무기한)·reason. 제한 시 세션 삭제, 기간 중 로그인 403 ACCOUNT_SUSPENDED(비밀번호 일치 후에만 안내), 토큰 검증·갱신도 거부. 기간 경과 시 자동 해제. publicReason(당사자에게 보일 사유, 500자) 필수(2026-10-30 D11): 당사자에게 앱 알림(type moderation, 목록 분류 "운영 안내")과 메일 큐(member_notices)로 공개 사유를 알림. reason은 내부 기록 |
| GET | /admin/members/:id/suspension | members.view. 회원 이용 제한 이력 |
| GET | /admin/members/:id/terms | members.view. 회원 개별 수수료·출금 조건(terms, null=기본값)·version·플랫폼 기본값(defaults)·변경 이력(history, 최신 100건) |
| PUT | /admin/members/:id/terms | members.update + settings.update, confirmation '정책 변경', expectedVersion, reason(필수). 이후 신규 구독 결제·출금 신청부터 적용, 기존 결제·진행 중 정기결제 조건 유지. 저장마다 creator_financial_term_changes 이력 1행 |

AdProduct 응답: id/name/description/terms/placement/amount/durationDays/visible/onSale/sortOrder/version/deletedAt/createdAt/updatedAt. placement는 featured_creator, amount는 VAT 포함 원 단위 정수100~10,000,000, durationDays는1~365 정수, sortOrder는-100,000~100,000 정수. 문자열 제한은 name100/description3000/terms5000자. 가격·기간은 관리자 입력이며 실제 운영 시드 없음. 변경 감사와 상품 쓰기는 같은 트랜잭션이고 행 잠금+version으로 동시 수정 충돌을 거절한다. PG 구매/노출 적용 정책 선택 대기.
