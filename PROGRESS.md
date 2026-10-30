# PROGRESS: crefans_server

## 2026-10-30 콩 후원 시 크리에이터 제공 동의 (미배포, 커밋 완료·푸시 안 함)
- 사용자 지시 "지금 하고": 받은 후원 목록에서 크리에이터가 후원자 닉네임·수량·메시지·일시·게시물을 보므로 구독과 같은 제3자 제공 동의를 받는다.
- 코드: `creator-provision.ts TIP_PROVISION`(2026-10-30.1), `beans.tip` 버전 불일치·누락 400 TIP_PROVISION_CONSENT_REQUIRED, 새 후원마다 member_consents(kind tip-provision, tipId) 사본. 처리방침 8조에 후원 제공 문단 추가, 문서 version 2026-10-30.3. OpenAPI tips body에 creatorProvision.
- 검증: platform-beans 30/30(동의 없음·구버전 거부, 후원 0건, 동의 사본 확인 추가), platform-legal 10/10, openapi 11/11. 대조: 동의 확인 제거·동의 기록 제거 각각 1건 실패, 복원 30/30.
- 배포 전: 운영은 아직 signup-open-20261030(후원 동의 없음).

## 2026-10-30 초대 가입 개방: 법률문서 시행일·처리방침 보완·구독 시 크리에이터 제공 동의 (운영 배포 signup-open-20261030, 커밋 완료·푸시 안 함)
- 계기: 사용자 회원가입 테스트에서 503 POLICY_NOT_PUBLISHED. 원인은 10-22부터 의도된 가입 차단(effectiveAt=null, blockers 3건).
- 사용자 결정(클릭): 초대받은 이메일만 개방, 시행일 2026-10-30. 사용자 확인 사실: 국외이전 내용, 일반 콘텐츠 베타 검수 완료. Google Workspace는 직접 구매. 텔레그램 알림은 지금처럼 IP·식별자를 보내고 알려진 내용만 공개(국가·연락처 미공개라 제28조의8 항목을 완전히 채우지 못함, 사용자 수용). 파기 때 첨부 원본도 삭제. 구독 동의까지 만든 뒤 함께 개방.
- 공식 근거(확인 2026-10-30): 개인정보 보호법 제28조의8(시행 2026-09-11, 법률 제21445호) ①3호 가목·②1~5호; AWS 계약 당사자 Amazon Web Services Korea LLC(aws.amazon.com/legal/aws-contracting-party), aws-korea-privacy@amazon.com; Lambda@Edge는 시청자 가까운 위치 실행·로그는 실행 리전; Google Workspace APAC 계약 법인 Google Asia Pacific Pte. Ltd.(cloud.google.com/terms/google-entity), 처리 국가는 Google 시설 국가(Cloud DPA 10.1, datacenters.google/locations), Gmail 로그 6개월; Telegram Messenger Inc.(telegram.org/privacy), 한국 가입자 저장국 미공개, Bot API deleteMessage 48시간 제한. 제17조①2호가 제15조①4호(계약)를 제외해 크리에이터 제공은 동의로 처리.
- 코드: `legal-documents.ts` version 2026-10-30.2, effectiveAt 2026-10-30, blockers []. 처리방침 1·7·8·9·11·14조와 가입 안내의 '시행 전/아직' 문구를 실제 값으로 교체(파기 30일·즉시 삭제, 첨부 7일 이내, 문의 3년, 접속 기록 7일, 감사 2년, 운영 알림 30일, 백업 7일, 국외 이전 3사). `creator-provision.ts` + `finance.createOrder`: creatorProvision 버전 불일치·누락 400 CREATOR_PROVISION_CONSENT_REQUIRED, 새 주문마다 member_consents(kind creator-provision) 사본. `member-purge.purgeMember`: 게시물 첨부(posting_medias) 연결 해제 → 매일 미디어 정리가 원본 삭제. 운영 runtime.env MEDIA_DELETE_ENABLED=true, MEDIA_ORPHAN_GRACE_DAYS=7(배포 스크립트가 설정, 롤백 시 복원).
- 테스트: 가입 차단 검사는 `legal-fixture.blockedCatalog`로 유지(platform-legal 10, signup-mode 3, signup-invites 6). payment-lifecycle 42(동의 필수·기록 신규), member-erase 4(첨부 해제 신규), openapi 11, billing-recovery 26, financial-policy 8, finance 9, beta-policy 11, payment-http 7, pilot-followups 4, beans 30. 대조: 동의 확인 제거·동의 기록 제거·첨부 해제 제거 각각 실패. 기존 실패(변경 전 HEAD에서도 동일): platform.integration 13/13(fetch failed), beta-cohort 1/3.
- 배포: `crefans_front/.local/signup-open-deploy-20261030/`, ship 첫 실행은 ship.py 문법 오류로 원격 작업 전 중단 → 수정 후 exit 0. 배포 스크립트가 bootstrap signupReady=true와 api·worker의 MEDIA 설정을 확인. 외부 확인: signupReady True, 처리방침 2026-10-30.2에 3사 법인명·첨부 7일 문구, '시행 전' 없음, 비로그인 POST /checkout 401. 이미지 정리 로컬·운영 보존9·삭제3·오류0.
- 미확인·남은 일: 운영 첫 미디어 정리 실행 결과와 S3 삭제 권한(정리 작업이 기존 고아 첨부도 지움). 실제 초대 가입 1건 완주. 콩 후원도 받은 후원 목록에서 크리에이터가 후원자 닉네임을 보므로 같은 제3자 제공 동의가 필요할 수 있음(미구현). 기존 구독(동의 이전)은 사본 없음.

## 2026-10-30 운영 콘솔 회원 즉시 삭제 (운영 배포 member-erase-20261030, 커밋 완료·푸시 안 함)
- 사용자 결정(클릭): 즉시 파기(30일 유예 없음), 남은 거래가 있으면 거부, 최고 관리자만, 서버·콘솔 배포+커밋.
- 계기: kayheypark@gmail.com 초대가 `signup-invites.ts` MEMBER_EXISTS로 막힘(어느 상태든 같은 이메일 회원 행이 있으면 거부). 삭제하면 이메일이 `withdrawn-<id>@deleted.invalid`로 바뀌어 재초대 가능.
- 구현: `POST /admin/members/:id/erase` @Permit('super') → `moderation.ts eraseMember`. 탈퇴 검사를 `service.closeAccount(tx,member)`로 분리해 회원 탈퇴와 공유, 30일 파기 본문을 `member-purge.ts purgeMember(tx,id,email)`로 분리해 정기 파기와 공유. 이미 탈퇴한 회원은 검사 생략 후 바로 파기. 회원 목록 응답에 withdrawn_at·purged_at 추가. OpenAPI 166개(콘솔 68).
- 검증(2026-10-30 KST, 로컬 격리 e2e DB): `tests/platform-member-erase.test.cjs` 4/4. 대조 검사(dist 변조): closeAccount 호출 제거·이메일 확인 제거·super 제한을 members.update로 완화 → 각각 2건 실패, 복원 후 4/4. 회귀: pilot-followups 4/4, beans 30/30, openapi 11/11, admin-totp 3/3.
- 미확인: 운영 실데이터 삭제(사용자가 콘솔에서 직접 누름). 당사자 통지 없음(이메일 파기 대상이므로).

- 배포(2026-10-30 KST): `crefans_front/.local/member-erase-deploy-20261030/` build→capture_before→ship 모두 exit 0, 마이그레이션 없음, 프론트 소스는 totp-pilot과 동일. 배포 후 health·admin login·feed 200, 비로그인 POST /admin/members/x/erase 401. 이미지 정리 로컬·운영 각각 보존9·삭제4·오류0.
## 2026-10-30 /pilot-work K2~K14 합의·반영 (운영 배포 totp-pilot-20261030 + 가이드, 커밋 완료·푸시 안 함)
- 결정: 운영자 TOTP 즉시(미등록 7일 유예) / 세금 문구 중립("세금 처리 방식(원천징수 여부 포함)은 정식 정산 전에 안내합니다.") / 콩 10% 공제·만료 소멸은 현행 유지 / 처리방침 개정은 약관 초안에 묶음 / 탈퇴자 문의 3년 보존·DM 상대방 쪽 보존 / 콩 미수금만 콩 출금 차단 / 백업 최대 7일 / 탈퇴 시 충전콩은 지갑 환불 안내(프로모션콩 소멸) / 멤버십은 중개 구조 유지+고지 보강 / 다음: 요청량 제한 → 옛 경로 리다이렉트 → 덤프 정리 자동화·배포 전 테스트.
- 반영: server TOTP(`admin-totp-core.ts`·`admin-totp.ts`, 마이그레이션 `20261030230000_admin_totp`, 로그인 2단계·복구코드·재사용 거부·5분 5회 제한·유예 후 self 경로만), 콩 미수금만 콩 출금 차단, 탈퇴 시 콩 버킷별 안내, 파기(DM 보존·문의 3년 후 삭제·CI 해시 삭제). admin TOTP 화면(로그인 2단계·등록·복구코드·유예 배너·403 이동). front 탈퇴 창(크리에이터 조건은 크리에이터에게만, 충전 내역 환불 링크), 콩 미수금 시 출금 버튼 비활성, 세금 문구. guide 콩 환불·유효기간, 미수금·탈퇴 전 출금, 저작권 수령인(전화·주소)·임시조치 안내, 세금 문구, 소개서 PDF 재생성. 덤프 정리 스크립트 `crefans_front/infra/platform/backup-retention.py`(운영 계획 실행: 21개 142MB 모두 7일 이내 → 삭제 0). 런북 백업 리전 서울. 약관 초안 13~18번·법령 원문 확인 절.
- 법령 원문(첨부 다운로드·추출, 2026-10-30): 표준약관 제3조제4항 7일/불리 30일, 소분기준 별표Ⅱ에 충전 캐시 환급 공제 근거 없음(10%는 구독 해지), 신유형 상품권 표준약관 제5·7·8조(90/95%·5년), 시행령 별표(유료 판매 주목적 제외 가능), 통신판매업 면제 50회 미만·간이과세자.
- 검증(2026-10-30 KST): server 관련 10파일 전부 통과(admin-totp 3·beans 30·pilot-followups 4·openapi 11·admin-operators 7·admin-console 12·auth-hardening 4·moderation 7·finance 9·beta-policy 11·jobs 2), 대조 TOTP 3종·미수금/탈퇴/파기 3종 실패 확인. front check 419/419(탈퇴 창 대조), e2e 15/15. admin npm test 11/11, e2e 25/25(에이전트 대조 8종). 문서검사 PASS, 가이드 격리 빌드·check 통과.
- 배포: API/worker/admin/front(마이그레이션 admin_totp 적용, DB·proxy 보존), 가이드 정적(44파일 SHA 일치). 운영 확인: health 200, 콘솔 로그인 200, 비로그인 TOTP 등록 401. 이미지 정리 각 3개.
- 커밋: front 8·server 8·admin 3 커밋(파일 단위 목적별), 가이드 `git init`(main) 첫 커밋. 현재 브랜치 이름(feat/iphone-input-zoom 등)은 내용과 다름 — 정리 미결. 푸시 안 함. 커밋 제외: front 루트 스크린샷·prod.json·output/pdf(QA 산출물).
- 미확인·남은 일: 실제 인증 앱으로 운영 콘솔 TOTP 등록(사용자 직접, 7일 유예), 실제 토스 부분취소·메일 발송, 덤프 정리의 정기 실행(다음 묶음), 원천징수 세무 확정.

## 2026-10-30 콩 환불 동결 핫픽스 (운영 배포: refund-hotfix-20261030, 미커밋)
- 원인(오후 night-work 1순위, 격리 DB 재현): 우리 부분취소로 토스 상태가 PARTIAL_CANCELED/CANCELED가 되면 `beans.service.ts` applyProvider가 무조건 freezeCharge → 충전 disputed·후원받은 lot 동결·미수금.
- 수정(server `src/platform/beans.service.ts`): 취소액(totalAmount−balanceAmount) ≤ refunded_amount+처리 중 환불액이면 정상, 넘을 때만 동결. 결과 불명 환불 대사(tick `beans-refund`, `reconcileRefund`: PG 기록에 취소가 있으면 완료, 없으면 같은 멱등키 `bean-refund-${id}`로 재요청). 완료·복원은 bean_refunds 행 FOR UPDATE 후 processing 재확인(동시 처리 1회). 같은 requestId 재요청이 failed면 409 BEAN_REFUND_FAILED. 환불은 판매 승인과 분리(`keyEnvironment`). front: `beanRefundOutcome`(lib/crefans/bean-refund.ts)으로 done만 "환불했어요", processing은 "확인하고 있어요", 확정 거절 시 새 requestId. admin Beans.tsx: 처리 중 표시·확정 거절 시 새 requestId.
- 검증(14:52 KST): server platform-beans 28/28(2회), 신규 3테스트(모니터 정상 유지·외부 취소는 동결 / 대사 완료·재요청·동시 2회 1회 반영·거절 후 409 / 판매 승인 off에도 환불). 대조 4종(옛 판정·재확인 제거·판매 승인 의존·failed 재요청) 모두 실패 확인 후 원복. front check 418/418(대조 1종), e2e 14/14. admin npm test 8/8, e2e 21/21(신규 1, 대조 2종).
- 배포(14:5x KST): API/worker/admin/front, 마이그레이션 없음, DB·proxy 보존. 운영 확인: health 200, 비로그인 refund-quote 401, 베타 목업 환불 흐름 정상·오류 0. 이미지 정리 로컬·운영 각 3개.
- 미확인: 실제 토스 부분취소. 이미 동결된 충전 여부는 사용자 결정(2026-10-30 "안해도됨")으로 운영 DB를 조회하지 않음 — 베타 테스트 결제라 환불 사용자가 없다고 판단. 동결 문의가 오면 수동 복구.

## 2026-10-30 오후 night-work 조사 문서 (문서만, 코드 변경 없음)
- 위치: `crefans_front/.local/night-work/2026-10-30-1414.md` (14:14~14:32, 결정 질문 K1~K14).
- 상위: ① 정상 콩 환불 뒤 PG 감시가 충전을 차지백으로 동결(pilot-followups 회귀, 재현) ② 안전성 확보조치 유예 조항 10/31 시행 — 운영자 2차 인증 없음 ③ 콩 환불 processing 대사 없음·프론트/콘솔이 실패를 완료로 안내 ④ 운영 코드 미커밋·가이드 git 없음 ⑤ 운영 IP 요청량 제한 없음 ⑥ 원천징수 의무 가능성 vs 세금 문구.

## 2026-10-30 약관 초안 시행 전 개발 3묶음 (운영 배포 pilot-followups-20261030·미커밋)
- 배포(2026-10-30 KST 사용자 "배포"): API/worker/admin/front `pilot-followups-20261030`, 마이그레이션 `20261030200000_pilot_followups` 운영 적용(배포 스크립트가 직전 mysqldump 백업), DB·proxy 컨테이너 보존. 폴더 `crefans_front/.local/pilot-followups-deploy-20261030/`(server 15·admin 4·front 18 파일). 운영 확인: 비로그인 refund-quote·admin receivables 401, health 200, 베타 목업 충전 내역 환불 신청 버튼 10·대화상자, 충전 화면 10%·5년 안내, 콘솔 로그인 안내 문구 없음, 페이지 오류 0. 이미지 정리 로컬·운영 완료. 미확인: 운영 worker의 새 작업(member-notices·bean-expiry·receivables) 실행 결과(운영 DB/로그 읽기는 권한 정책상 하지 않음), 실제 토스 부분취소·메일 발송.
- 사용자 결정(클릭): 콩 환불은 지갑에서 직접 신청·자동 처리, 유효기간 5년은 충전콩(결제일)·프로모션콩(지급일) 모두, 크리에이터 탈퇴 전 최소액 미만도 전액 출금 허용, 게시물·댓글 숨김·이용 제한은 앱 알림+메일·공개 사유 필수.
- 서버(crefans_server): 마이그레이션 `20261030200000_pilot_followups`(bean_charges.refunded_*, bean_lots.expires_at/expiry_noticed_at+기존 lot 5년 채움, moderation_actions.public_reason, bean_refunds·creator_receivables·member_notices). 콩 환불 API(refund-quote/refund, 운영자 회사 귀책 면제)·토스 부분취소(cancelAmount, 공식 문서 2026-10-30 확인), 만료 30일 전 1회 알림·메일과 만료 처리(회사 expired 계정), 만료 콩 사용 제외. 미수금: 멤버십 환불 후 가용 음수분 기록·이후 수익으로 자동 정산, 콩 차지백 시 paid 지급분 기록·운영자 정산 전 콩 출금 차단, 정산 알림. 운영 조치 publicReason 필수+앱 알림(운영 안내)+메일 큐. 크리에이터 탈퇴 조건(판매 중·구독 기간·미수금·남은 수익)과 closing 전액 출금(멤버십·콩). 30일 파기에 DM 양방향·문의·본인확인 해시. 신규 경로 5개(OpenAPI 163).
- 프론트(crefans_front, 서브에이전트 구현 후 직접 재검증): 지갑 충전 내역 환불 신청 대화상자(공제·환불액·카드 3~4영업일 안내), 만료 예정 줄, 충전 화면 환불·유효기간 안내, 스튜디오 미수금·탈퇴 준비 안내와 "탈퇴 전 전액 출금"(조건 충족 시만), 탈퇴 창 크리에이터 조건 안내. 목업 콩 모델의 무한 재렌더 기존 버그 1줄 수정. 목업 한계: 콩 출금의 미수금 차단·목업 탈퇴 조건은 미반영.
- 콘솔(crefans_admin, 서브에이전트 구현 후 직접 재검증): 게시물 숨김·회원 제한·댓글 숨김에 "당사자에게 보일 사유" 필수, 이력에 공개 사유, 콩 충전 환불(회사 귀책 체크), 미수금 섹션·콩 미수금 정산 완료. 로그인 화면의 "운영자 전용 계정…" 안내 문구 제거(사용자 요청).
- 검증(2026-10-30 13:07 KST): server 신규 platform-pilot-followups 4/4, platform-beans 25/25(3회 연속), moderation 7/7, comment-social 6/6, openapi 11/11, 비통합 전체 42파일 중 41 통과(실패 1 = 기존 낡은 platform-beta-cohort). 서버 대조 6종(조치 알림·구독 기간·멤버십 미수금·DM 파기·10% 공제·만료 사용 제외) 모두 실패 확인 후 원복. e2e DB와 schema diff: 신규 테이블·컬럼 차이 없음(기존 콩 FK 표기 차이만). front tsc·check 417/417·e2e 25/25(에이전트 대조 4종), admin tsc·npm test 8/8·e2e 23/23(에이전트 대조 12종), 문서검사 PASS. 로컬 개발 DB(127.0.0.1:3307 crefans_platform_dev)에 신규 마이그레이션 적용(테스트가 그 DB를 직접 씀). 테스트 정리 보완: 콩 테스트의 만료 이동 되돌리기, 8번 테스트 차지백 미수금 정산.
- 미검증: 실제 토스 부분취소(테스트 키 포함) 호출, 실제 메일 발송, 운영 반영. 약관 초안(`crefans_server/docs/terms-draft-20261030.md`)의 시행 전 개발 상태를 갱신(통신판매업 번호·등급 변경 남음).

## 2026-10-30 /pilot-work 정책 동기화 (운영 배포: pilot-sync-20261030 + 가이드 pilot-sync-20261030, 미커밋)
- 조사: 읽기 전용 3갈래(콩·정산/세무/약관·댓글/알림). 주의: 조사 지시 오류로 나온 "후원받은 프로모션콩 출금 불가"는 오탐 — 10/26 승인대로 후원받은 프로모션콩은 출금 가능(회사 부담), 운영자 직접 지급분만 불가. 상호 '좋아하는일해야지'도 정상.
- 합의(사용자 클릭): ① 약관·운영정책·처리방침은 한 번에 새 버전 초안만(`crefans_server/docs/terms-draft-20261030.md`, 운영 미반영, 시행 전 개발 표시) ② 세금 문구 = "크레팬스는 정산 금액에서 세금을 떼지 않으며, 소득 신고·납부는 크리에이터 본인이 합니다." ③ 후원받은 콩(일반·프로모션) 보류 = 후원 시점+7일 ④ 댓글·알림 안내 전부 ⑤ 권리침해·불법촬영물·저작권 신고 접수 = 대표 박경호·khpark@crefans.com ⑥ 서버·프론트·콘솔 배포+가이드 반영.
- 반영: server `beanPolicy.tipHoldDays=7`, `beans.service.ts` tip lot release_at=후원+7일(이전엔 충전 lot 상속, 후원 프로모션콩 즉시 출금 가능했음). 세금 문구: front support.ts·creator-payout-policy.ts·ServiceGuidePage.tsx, guide payouts·payout-setup·income-scenarios·service-introduction.mdx, 소개서 HTML+PDF 재생성(13쪽 경계검사). 보류 문구: 스튜디오 출금 안내·가이드·소개서·콘솔 초대 툴팁·platform-api.md·admin README. 댓글·알림: 알림 탭 고정 목록 멤버십·댓글·메시지·새 게시물, 알림 설정 안내, FAQ 4문항, 서비스 안내, 가이드 4문서(게시물·메시지/알림·커뮤니티·고객센터), types·preview-pages 태그 10명.
- 검증(2026-10-30 KST): server platform-beans 22/22(신규 "후원 후 7일" 테스트; 기존 지급 테스트는 7일 경과 헬퍼), 대조(옛 상속 규칙으로 되돌리면 신규 테스트 실패) 확인. front check 406/406, e2e comment-social·comment-edit-delete·beans·promotion-payout 21/21, 알림 탭 대조 실패 확인. admin tsc·invites e2e 3/3. 문서검사 PASS(초안 manifest 등록). 가이드 격리 빌드(Node 22.23.4)·check:guides 0, 결과물에 '원천징수' 없음.
- 배포: API/worker/admin/front pilot-sync-20261030(마이그레이션 없음, DB·proxy 보존), 가이드 정적 102파일(8페이지·PDF·검색색인 변경, 44파일 SHA 일치, 6컨테이너·Caddy 불변, 원복 guide-before-pilot-sync-20261030). 운영 확인: 알림 탭 4종, FAQ 댓글·차단·세금 새 문구(원천징수 없음), 스튜디오 "후원 후 7일 보류", 가이드 payouts 새 문구, health 200. 가이드 capture_before의 이전 릴리스 경로를 bean-wording으로 고친 뒤 실행(첫 시도는 사전검사에서 중단, 변경 없음).
- 미결(약관 초안 시행 전 개발): 콩 환불·유효기간·만료 안내, 지급 후 미수금, 조치 알림·공개 사유, 크리에이터 탈퇴 조건, 메시지·문의·CI 해시 파기, 등급 변경, 통신판매업 신고 후 번호 표시. 지급자 원천징수 의무는 세무사 확인 전 미확정. 댓글 요청량 제한(분당5·시간당60)은 미구현. service-hierarchy.md(사용자 원문 계층도)의 알림 분류는 손대지 않음.

## 2026-10-30 D9 댓글 묶음 + 답글의 답글 — 운영 배포 완료 comment-social-20261030 (미커밋)
- 배포(2026-10-30 10:42 KST): API/worker/admin/front `comment-social-20261030`, 마이그레이션 없음("No pending migrations"), DB·proxy 보존. 폴더 `crefans_front/.local/comment-social-deploy-20261030/`(source-delta: server 6·admin 1·front 10 파일, next-env.d.ts는 e2e 생성물이라 제외). 운영 확인: 비로그인 mention-candidates·reports·admin 댓글 숨김 401, health 200, 베타 /preview/post/morning 태그 링크 21·댓글 신고 버튼 8·답글의 답글 버튼 3·"@하" 태그 후보 4·페이지 오류 0(live-preview.png). 이미지 정리 로컬·운영 각 3개 삭제·오류 0. 실회원 계정 실사용은 미확인.
- 차단: 게시물 작성자가 차단한 회원은 새 댓글·답글 403 COMMENT_BLOCKED, 기존 댓글은 유지.
- 알림(type comment, 목록 분류 '댓글'): 댓글→게시물 작성자, 답글→원 댓글 작성자(스튜디오 답글 포함), 태그→태그된 사람. 1인 1건, 작성자 본인·차단 관계 제외. bootstrap 알림 type은 한글 분류명으로 변환(subscription→멤버십, message→메시지, content→새 게시물, comment→댓글) — 이전엔 영어 값이 칩으로 보였음.
- 멘션: 서버가 본문 "@이름"에서 판별(게시물 작성자 페이지 이름·닉네임 + 보이는 댓글 작성자, 같은 이름 2명 이상·본인 제외, 최대 10). 수정 시 재판별. GET /posts/:id/mention-candidates({name,image}, 열람 기록 없음). 프론트: "@" 입력 시 목록(↑↓·Enter/Tab·Esc, 모바일은 입력창 위), 본문 안 파란 링크(/creator/:id). 팬 화면 칩 목록 대신 본문 표시(스튜디오 칩은 그대로).
- 댓글 신고: POST /reports kind=COMMENT, 댓글 행 "신고" + 사유 대화상자. 콘솔 신고 목록에 댓글 내용, "댓글 숨기고 처리 완료". POST/GET /admin/comments/:id/moderation(숨김 시 목록 제외·댓글 수 감소).
- 결정(D9): 해지 회원 자기 댓글 삭제는 선택 안 됨(현행 유지).
- 검증(2026-10-30 10:25 KST): server tests/platform-comment-social 6/6, moderation 7/7, studio-replies 5/5, beta-policy 11/11, openapi 11/11(158 경로). 대조 5종(차단·작성자 제외·동명 태그·숨김 신고·스튜디오 알림) 모두 실패 확인 후 원복. front check 406/406, e2e comment-social 4 + comment-edit-delete 4, 대조 4종(링크·신고 버튼·모바일 위치·Enter 선택) 실패 확인. admin e2e 7/7(신고 숨김 대조 1종 실패 확인), typecheck·lint·npm test 8/8. docs check PASS.
- 미검증: 실제 iPhone 한글 IME에서의 "@" 목록 동작(Playwright는 IME 조합 미재현), 운영 DB 반영.
- 근거: server `src/platform/service.ts`(addComment·resolveMentions·mentionCandidates·report), `moderation.ts`(moderateComment), `studio.service.ts`(createReply 알림); front `components/crefans/CommentMention.tsx`, `SocialPages.tsx`, `CommentComposer.tsx`; admin `src/components/console/Console.tsx`.

## 2026-10-30 night-work 조사 문서 (문서만, 코드 변경 없음)
- 위치: `crefans_front/.local/night-work/2026-10-30-0714.md` (07:14~07:48, 주제 39, 결정 질문 D1~D11).
- 상위: 서버 밖 DB 백업 없음 / 멤버십 PG 입금 대사 화면 없음(공개 후 수익이 출금 가능으로 안 넘어감) / 불법촬영물·권리침해·저작권 수령인 절차 없음 / 지급 후 환불 회수 장치 없음·후원 콩이 충전일 보류 승계 / 원천징수·통신판매업 미비 / 콩 실판매 전 약관·고지·환불·잔액 집계 필요 / 운영자 2차 인증·내부 관리계획 없음 / 크리에이터 탈퇴·파기 범위 / 댓글 차단·신고·열람기록·알림 / 옛 화면 경로 노출.

## 2026-10-30 회원 댓글 수정·삭제 API (운영 배포: comment-edit-20261030, 미커밋)
- 운영 배포(2026-10-30 06:55 KST, comment-edit-20261030): API·worker·콘솔·프론트 교체, 마이그레이션 20261030140000_comment_edited 적용(로그 확인), DB 백업 /opt/crefans-backup-comment-edit-20261030. 확인: 로그인 없는 댓글 DELETE 401, beta /preview/post/morning에서 이탤릭 삭제 표시·수정됨·수정/삭제 버튼, 콘솔 CSS에 새 스낵바. 이미지 정리 로컬·운영 각 3개 삭제·오류 0. 근거 front `.local/comment-edit-deploy-20261030/`. 실회원 계정으로 댓글 수정·삭제는 아직 직접 확인하지 않았다. 폰트 되돌리기 스크립트(rollback-font.sh)는 이전 콘솔(스낵바·로딩 규칙 이전)로 돌아간다.
- `PUT/DELETE /posts/:id/comments/:commentId`: 게시물 이용 권한 + 본인 댓글·답글만(403 NOT_COMMENT_AUTHOR, 404 COMMENT_NOT_FOUND). 수정은 1~1000자, 내용이 바뀔 때만 `comments.edited_at`. 삭제는 soft delete·comment_count 1회 감소. 목록 항목에 `edited`·`own`, 보이는 답글이 남은 삭제된 최상위 댓글은 `deleted:true` 자리표시(작성자·본문 비움). 삭제된 부모의 답글 조회 허용.
- 마이그레이션 `20261030140000_comment_edited`(로컬 dev DB 적용). OpenAPI 계약·`docs/platform-api.md` 갱신.
- 검증: platform-moderation 7/7(신규 7번), studio-replies 5, openapi 11, security 18. 대조: 작성자 검사 제거 시 2건 실패.
- 남은 것: 프론트와 함께 운영 배포 승인 대기(마이그레이션 포함).

## 2026-10-30 가입 전 개발 2~4(미검수 목록·신고 사유·탈퇴 후 파기) + 멤버십 콩 환산 철회 (운영 배포)

- 배포 완료(사용자 "배포", 2026-10-30): `signup-prep-20261030` API·worker·admin·front. DB 백업 후 migration 4개(report_privacy_reason, post_review, member_purge, backfill_withdrawn) 적용. 운영 확인: 6컨테이너, 처리방침 2026-10-30.1·30일 파기 문구(beta·crefans.com), 프론트 빌드 '콩 상당' 0건·'개인정보 노출' 포함, 검수 API 비인증 차단. 폰트만 되돌리기 `sudo bash /opt/crefans-backup-signup-prep-20261030/rollback-font.sh`(대기 crefans-admin:signup-prep-plex-20261030). 기존 탈퇴자 30일 파기 기산일 = 이번 배포 시각. 증거 front `.local/signup-prep-deploy-20261030/`.

- 미검수 목록(사용자 선택: 바로 공개+사후 숨김): migration `20261030090000_post_review` postings.reviewed_at/reviewed_by·인덱스. `POST /admin/posts/:id/review`(content.update), `GET /admin/posts?review=pending`(공개·미삭제·미숨김·미검수). 작성자 저장 시 reviewed_at 초기화(`studio.service.ts`), 숨김도 검수로 기록. 콘솔 콘텐츠 '검수 상태' 필터·'검수 완료' 버튼. 기존 게시물은 모두 미검수로 시작.
- 신고 사유(사용자 선택: 기본 6개): migration `20261029190000_report_privacy_reason`(enum PRIVACY 추가). `POST /reports` reason 검증(INAPPROPRIATE·COPYRIGHT·SPAM·HARASSMENT·PRIVACY·OTHER, 생략 시 OTHER, 잘못된 값 400). 프론트 신고 창 라디오 6개(선택 전 신고 버튼 비활성, `lib/crefans/report-reasons.ts`), 콘솔 신고 목록 한글 사유.
- 탈퇴 후 파기(사용자 선택: 게시물 삭제·댓글 익명화·30일 유예): migration `20261030100000_member_purge` members.withdrawn_at/purged_at. 탈퇴 시 withdrawn_at 기록·결제 카드 빌링키 즉시 해지 대상(기존 retryBilling). 잡 `member-purge`(`member-purge.ts`, 50건씩): 30일 경과 시 게시물 삭제, 회원 이메일·실명·닉네임('탈퇴한 사용자')·전화·사진·비밀번호·본인확인 해시·로그인 ID 제거, 크리에이터 프로필·핸들, 사용자 소개, 정산 계좌번호·예금주, 출금 PIN, 본인확인 실명, 가입 인증 기록 정리, 감사 로그. 댓글은 원문 유지·표시 익명화(기존). 주문·구독·출금·동의 기록은 회원 ID로 보존. 미디어 원본 삭제는 기존 MEDIA_DELETE 설정 따름(미연결). 이 기능 이전 탈퇴자: 사용자 결정(2026-10-30) '배포 시점부터 30일 후 파기' → migration `20261030110000_backfill_withdrawn`이 enabled=0·withdrawn_at 없음 회원의 withdrawn_at을 배포 시각으로 채움(사용자 확인: Cognito 미사용, 비활성화 경로는 탈퇴뿐). e2e DB 합성 4행으로 비활성 3건 선택·활성 제외 확인. 로컬 개발 DB의 이 migration 체크섬은 수정 후 다시 맞춤(운영 미적용).
- 처리방침 7조를 실제 파기 절차로 갱신(30일 유예·파기 항목·게시물 삭제·댓글 익명 표시·첨부 원본 삭제 시점 별도), 문서 버전 2026-10-30.1. blocker '탈퇴·보유기간·실제 파기 절차 보완'은 사업자 확인 전까지 유지.
- 사용자 지시로 '미구독 게시물 콩 참고 환산'(bean-notice-20261029로 운영 배포됨) 철회: PostMembershipNotice·membership-plans·bean-pricing·테스트를 커밋 상태(환산 이전)로 복원, CSS lockedMembershipPrice 제거, 전 저장소 '콩 상당/참고 환산' 0건. 대신 게시물 머리 둘째 줄에 `시각 · 멤버십 전용 · 월 ₩가격`(볼 수 있는 판매 중 최저가, 여러 개면 '부터'). AGENTS에 콩 환산 금지 규칙 추가.
- 검증: server `platform-moderation` 6/6(검수 큐·작성자 수정 복귀·숨김=검수, 신고 사유, 30일 유예·파기 항목·댓글 익명 표시·1회 실행), 대조(수정 시 미검수 복귀 제거·유예 0일 각각 실패), legal 9/9, openapi 11/11(153경로), auth·admin-console·beans·security·signup-invites·studio-replies·finance·billing·payment-lifecycle 통과. admin typecheck·lint 오류 0·e2e moderation 4/4+control-heights 2/2. front check 399+social 29(머리줄 가격 신규).

## 2026-10-29 관리자 게시물 숨김·회원 이용 제한 (가입 전 개발 1/4, 운영 배포)

- 배포 완료(사용자 "지금 배포"): `moderation-20261029` API·worker·admin·front, DB 백업 후 migration `20261029180000_moderation` 적용. 첫 빌드에서 콘솔 린트(no-explicit-any) 실패 → 타입 지정 후 콘솔만 재빌드. 서버는 빌드 시점 사본 기준(이후 작업본의 신고 사유 변경은 제외). 운영 확인: 6컨테이너 정상, 조치 API 비로그인 401, 콘솔 번들에 운영 조치·이용 제한·조치 사유·애플 고딕 포함, 피드 200. 폰트만 되돌리기: `sudo bash /opt/crefans-backup-moderation-20261029/rollback-font.sh`(대기 이미지 crefans-admin:moderation-plex-20261029 보존). 증거 front `.local/moderation-deploy-20261029/`.

- 약관 8조가 약속한 "게시물 비공개·계정 제한"이 없던 문제(가입 미시행 점검) 해결. migration `20261029180000_moderation`: postings.hidden_at/hidden_reason/hidden_by, members.suspended_at/suspended_until/suspension_reason, append-only `moderation_actions`(대상·조치·사유·기간·처리자·일시).
- 서버 `src/platform/moderation.ts`(API 4개, content.update / members.update, 사유 필수, 감사 로그), `suspension.ts`. 숨김: `service.access()`에서 작성자 외 차단 + 피드·프로필·상세·저장목록 쿼리 `hidden_at:null`, 미디어 제한 대상, 게시물 후원 차단, 스튜디오 목록 `hiddenByOperator`. 제한: 세션 즉시 삭제, 로그인은 비밀번호 일치 후 403 ACCOUNT_SUSPENDED("이용이 제한된 계정입니다(…까지). 문의: khpark@crefans.com"), 토큰 검증·갱신 거부, 기간 지나면 자동 해제. 게시물은 회원 제한과 별개로 숨김.
- 콘솔 `Moderation.tsx`: 콘텐츠 표 '운영 조치'(숨기기/해제·사유·이력), 회원 표 '이용 제한'(7일·30일·무기한·사유·이력). 조회 권한만 있으면 이력만. 권한표 설명 갱신. 프론트 스튜디오 게시물 목록에 '운영 정책에 따라 숨김'.
- 검증: server 신규 `tests/platform-moderation.test.cjs` 3/3, 대조(숨김 검사 제거·제한 검사 제거 각각 1건 실패, 복구 후 통과), 관련 auth 3·auth-hardening 4·admin-console 12·admin-operators 7·beans 21·signup-invites 6·legal 8·openapi 11(152경로)·security 18 통과. `platform.integration`·`platform-access.integration`(별도 서버 필요 fetch failed)·`local-members`(전용 _test DB 필요)는 이 환경에서 실행 불가로 미검증. admin typecheck, e2e moderation 3/3+control-heights 2/2(스크린샷 확인). front check 401/401(신규 숨김 표시 테스트).
- 미결: 신고 처리 화면에서 바로 숨기기 연결(현재 콘텐츠 표에서 별도), 이의제기 접수 경로, 정지 회원의 공개 프로필·게시물 노출 정책(현재 유지).

## 2026-10-29 /pilot-work 합의: 베타 기간·콩 환불·보유기간·리전·개발 우선순위 (베타 문구 운영 배포: terms-text-20261029)

- 일관성 점검에서 발견: 약관 2조·가입 안내·FAQ·이용안내는 "2주 베타", 가입 거절 알림은 "베타기간(~26년 11월)". 사용자 결정 → "2026년 11월까지"로 통일. 반영: `legal-documents.ts` 2조, `service.ts` signup guidance, front `support.ts` FAQ·`ServiceGuidePage.tsx`. `beta-policy.ts`의 `days:14`는 어디서도 쓰지 않는 값이라 그대로 둠(혼동 시 정리 후보). 약관 버전은 같은 미배포 릴리스의 2026-10-29.3에 포함.
- 콩 환불 결정(조사 `docs/bean-refund-research-20261029.md`): 7일 내 미사용분 전액 철회, 7일 후 미사용분 10% 공제 환불(회사 귀책 면제), 사용분·지급 프로모션콩 제외, 유효기간 5년. 미구현 — 실결제 콩 판매(BEAN_LIVE_PAYMENTS_APPROVED) 전 충전 건별 사용량 추적·Toss 부분취소·약관/충전 화면 고지 구현 필요.
- 탈퇴: 크리에이터 게시물 삭제, 다른 글의 댓글은 '탈퇴한 회원'으로 익명화, 계정 정보(이메일·실명·프로필) 30일 유예 후 파기, 거래기록은 법정 기간 별도 보관. 미구현.
- 리전: 운영 로그·DB 백업 모두 서울 리전(오사카 백업·us-east-1 로그 계획 폐기). 처리방침 국외이전 표 정리 시 반영.
- 가입 전 개발 순서(사용자 전부 선택): 관리자 게시물 숨김·회원 정지 → 베타 업로드 검수 → 신고 사유 분류 → 탈퇴 후 파기 작업. 아직 시작 안 함.
- 검증: server legal 8/8·beta-policy 11/11·signup-mode 3/3, front check 400/400.

## 2026-10-29 약관 6조 개별 합의 우선 조항 + 가입 미시행 3항목 점검 (운영 배포)

- 배포 완료(사용자 "API·프론트·가이드 모두 배포"): `terms-text-20261029` API·worker·front. 기준 API terms-history·front bean-notice 소스에 server 2·front 7파일만 덮음. .env 이미지 2키·APP_RELEASE만 변경, admin·DB·proxy 유지. 운영 /api/v1/common에서 약관 2026-10-29.3·개별 합의 조항·'2026년 11월까지' 확인(beta·crefans.com). 가이드는 bean-wording-20261029로 별도 배포. 증거 front `.local/terms-text-deploy-20261029/`.

- 사용자 선택: 개별 조건은 약관에 '개별 합의 우선' 조항으로 남김. `legal-documents.ts` 6조 끝에 "멤버십 판매 수수료율·정산 보류기간·콩 출금 수수료율·최소 출금 금액을 개별 합의한 경우 기본 기준보다 우선, 합의 후 새 구독 결제·새 출금 신청부터 적용·소급 없음, 변경 일시·내용·사유 기록, 스튜디오에서 확인" 추가. 문서 버전 2026-10-29.2 → .3. 검증: platform-legal 8/8(신규 1), openapi 11/11.
- 가입 미시행 3항목(서브에이전트 읽기 전용 점검, 코드 근거): ① 탈퇴는 비활성화·세션 삭제뿐(`service.ts:104-117`), 이메일·실명·CI 해시·프로필·댓글·메시지·결제수단 잔존, 빌링키 삭제/토스 해지 없음, 만료 인증자료 정리 잡 없음, 감사로그 보유 문구(미확정)와 runtime 730일 예시 불일치, 거래기록 5년 분리 구조 없음. ② 국외이전: 오사카 백업 계획·CloudWatch/WAF us-east-1 계획이 처리방침에 없음, CloudFront 국가 목록·Google Workspace 리전·계약·Telegram DPA 미확인(사업자 확인 필요). ③ 성인 차단은 크리에이터 자가 플래그 기반(`studio.service.ts:18,23`), 미표시 업로드 차단 수단 없음, 관리자 게시물 숨김·계정 정지 API 없음(약관 8조 문구와 불일치), 신고 사유 'OTHER' 고정. 다음: 관리자 숨김·정지 기능, 베타 업로드 검수, 보유기간 표·백업/로그 리전 사업자 결정. blocker 해제는 사업자 승인 후에만.

## 2026-10-29 크리에이터별 수수료·출금 조건 변경 이력 (운영 배포)

- 배포 완료(사용자 "배포", 2026-10-29): `terms-history-20261029` API·worker·admin. 기준 API invites-terms·admin control-height 소스에 server 4·admin 2파일만 덮음. DB 백업 후 migration `20261029150000_creator_term_changes` 적용(기존 개별 조건은 backfill 1행). front·DB·proxy 컨테이너 유지, .env API_IMAGE·ADMIN_IMAGE·runtime APP_RELEASE만 변경. 운영 확인: 6컨테이너 정상, 초대·회원 조건 API 비로그인 401, 콘솔 번들에 변경 이력·변경 사유·시스템 기본값·멤버십 판매 수수료율·터치 44px 포함. 로그인 후 실제 저장·이력 표시는 미확인(운영자 비밀번호 필요). 백업 `/opt/crefans-backup-terms-history-20261029`, 증거 front `.local/terms-history-deploy-20261029/`.

- 사용자 요청: 개인별 수수료 변경 이력을 쌓을 것. 운영 로그(감사)와 별도로 append-only 테이블 `creator_financial_term_changes`(member_id+version unique, 조건 4개, source admin/invite/backfill, changed_by 운영자 ID, reason, created_at) 추가. migration `20261029150000_creator_term_changes`가 이미 저장된 조건을 backfill 1행으로 옮김.
- 기록: 콘솔 변경(`saveMemberTerms`)마다 같은 트랜잭션에서 1행, 변경 사유 필수(최대 500자). 초대 조건으로 가입하면 source invite·사유 "초대 조건 적용". 값이 같으면 저장·이력 없음. 조회 `GET /admin/members/:id/terms`의 `history`(최신 100건, 운영자 이름 포함).
- 콘솔: 회원 조건 창에 변경 사유 입력(없으면 '조건 확인' 비활성), 확인 창에 사유 표시, 아래 '변경 이력' 표(일시·버전, 조건, 변경자·출처, 사유).
- 검증: server invites 6/6(사유 필수 400, 이력 2행 순서·출처·변경자 이름·이전 값, 무변경 저장 시 이력 미추가), openapi 11/11. backfill SQL을 e2e DB 합성 1행에 실행해 값·출처 확인 후 삭제. 대조: 이력 기록 제거 시 1건 실패, 복구 후 통과. admin typecheck·check 8/8, e2e invites+control-heights 5/5(조건 창 실제 서버 응답 포함). 로컬 개발 DB에 migration 적용.

## 2026-10-29 초대 등록·확인 창에 시스템 기본값 표시, 수수료 명칭 정리 (운영 배포)

- 운영 배포: 위 terms-history-20261029 릴리스에 포함.

- 사용자 요청(iPhone 화면 2장): 초대 등록·조건 확인 창에 현재 시스템 기본값이 보이지 않음. 서버 `/admin/invites` 응답에 `defaults`(플랫폼 수수료·보류일은 DB 금융 정책, 콩 수수료·최소 출금은 코드 기본값)를 추가하고, (콘솔) 조건 영역에 "현재 시스템 기본값: …" 한 줄, 입력 안내 "비우면 기본 N", 확인 창 "기본 20% → 15.5%"로 표시. 기본값이 미설정이면 "기본값(미설정)".
- 용어: "멤버십 플랫폼 수수료율"이 크리에이터가 다른 멤버십을 살 때로 오해될 수 있어 "멤버십 판매 수수료율"로 바꾸고 "팬이 이 크리에이터의 멤버십을 결제할 때 플랫폼이 가져가는 비율" 설명 추가(회원 조건 창도 공통).
- 검증: server invites 6/6(defaults 포함)·openapi 11/11, admin typecheck, e2e invites+control-heights 5/5, iPhone 13 에뮬레이션 스크린샷 확인. 운영 기본값 실제 수치는 운영 DB 조회 권한이 막혀 확인하지 못함(화면은 서버 값을 그대로 표시).

## 2026-10-29 초대 회원 관리 + 크리에이터별 수수료·출금 조건 (운영 배포)

- 배포 완료(사용자 "배포해", 2026-10-29): `invites-terms-20261029` API·worker·admin·front 한 릴리스. 기준 소스 API/front invite-notice, admin advertising에 변경 파일만 덮음(server 14·admin 5·front 5). DB 백업 후 migration `20261029120000_signup_invites` 적용(운영 29개, 두 테이블 0행). DB·proxy 유지, .env 이미지 3키·runtime APP_RELEASE만 변경. 운영 확인: beta·crefans.com 비초대 가입 코드 403, `/admin/invites` 비로그인 401, 콘솔 /console/invites 200·번들에 초대 화면 포함. 운영 로그인 후 실제 초대 등록·조건 저장은 미확인(운영자 비밀번호 필요). 첫 빌드 시 로컬 Docker 멈춤 → 강제 재시작 후 빌드, 운영 영향 없음. 이미지 보존 3개(로컬·운영 각 3개 삭제). 백업 `/opt/crefans-backup-invites-terms-20261029`, 증거 front `.local/invites-terms-deploy-20261029/`.

- 사용자 요청: 관리자 화면에서 초대 회원 등록 + 해당 크리에이터의 수수료·출금 조건 설정. 사용자 결정(AskUserQuestion): 항목 4개(멤버십 플랫폼 수수료, 정산 보류일, 콩 출금 수수료, 최소 출금 금액), 변경은 이후 건부터만, 초대 등록과 회원 목록 양쪽에서 관리. 최소 출금 금액은 멤버십 정산 출금·콩 출금 공통(콩 1개=100원 환산)으로 해석.
- DB: `signup_invites`(이메일 unique·메모·개별 조건 4개 nullable·used/revoked·version), `creator_financial_terms`(member_id PK, 4개 nullable=기본값). migration `20261029120000_signup_invites`.
- 가입: `signup-policy.ts` `assertInvited` = env SIGNUP_EMAIL_ALLOWLIST 또는 활성 콘솔 초대. 인증 코드 요청·가입 제출 모두 적용. 가입 트랜잭션에서 `consumeInvite`가 초대를 소진하고 조건을 회원에게 복사, 그 사이 취소된 초대는 403으로 롤백.
- 적용: `paymentPolicy(db,creatorId)`가 신규 구독 주문 스냅샷에 개별 수수료·보류일(creatorTermsVersion 포함)을 기록, 갱신 결제는 기존 스냅샷 유지(기존 전역 정책과 같은 방식). 멤버십 정산 출금 최소액(`finance.review`)과 콩 출금 견적(`beanWithdrawalQuote` 수수료·최소, payout fee_bps)은 신청 시점 조건. 스튜디오 응답에 `creatorTerms`(정산)·`policy`(콩) 개별값.
- 관리자 API: `/admin/invites` CRUD(invites 메뉴 권한 신설), `/admin/members/:id/terms` GET/PUT. 조건 변경은 settings.update + 확인 문구 '정책 변경'(서버 검사), expectedVersion 충돌 409, 감사 로그에 전후 값(이메일은 해시만).
- 검증(로컬 e2e DB, 파일별 순차): 신규 `tests/platform-signup-invites.test.cjs` 6/6. 영향 테스트 openapi 11, beta-policy 11, signup-mode 3, legal 7, auth 3, auth-hardening 4, bean-ledger 5, financial-policy 8, admin-operators 7, admin-console 12, advertising 5, beans 21, finance 9, billing 6, payment-lifecycle 41 모두 통과. 기존 테스트 수정: openapi 경로 수 142→148·콘솔 문서 49→55, legal 테스트 가짜 DB에 signupInvite 추가. 대조 실험: DB 초대 확인 제거 → 신규 테스트 실패, 개별 수수료 무시 → 실패, 복구 후 6/6. 로컬 개발 DB(127.0.0.1:3307)에 migrate deploy 적용. 프론트 docs check PASS(routes 148, migrations 29).
- 미검증·남은 것: 실제 가입 완료까지의 E2E는 약관 미시행(POLICY_NOT_PUBLISHED)이라 불가 — 초대 소진은 함수 단위로 검증. 멤버십 상품 만들기 화면의 가격 안내(`membershipPriceHint`)는 아직 기본 20% 기준. 개별 조건은 크리에이터 약관 6조(기본 20%·7일·10만 원)와 다를 수 있어 별도 개별 합의서가 필요한지 사업자 결정 필요. 커밋·푸시 없음.

## 2026-10-29 베타 가입 초대 확인을 약관 검사보다 먼저 + 안내 문구 (운영 배포)
- 배포 완료(사용자 "해", 2026-10-29): API·worker·front `invite-notice-20261029` 한 릴리스. 기준 소스 API privacy-ci(214파일)·front signup-notice(684파일)에 auth.service.ts·signup-policy.ts·AccountPages.tsx 3파일만 덮어씀(매니페스트 차이 3파일만 확인). admin·DB·proxy 유지, .env 이미지 2키·runtime APP_RELEASE만 변경. 운영 확인: beta·crefans.com·www에 비초대 이메일로 `POST /api/v1/auth/signup/email/request` → 403 SIGNUP_INVITE_REQUIRED + 베타 안내 문구(배포 전 503 POLICY_NOT_PUBLISHED). beta /service/signup 브라우저에서 인증 코드 받기 → "가입 안내" 다이얼로그 표시·확인으로 닫힘. 운영 SIGNUP_EMAIL_ALLOWLIST 비어 있어 전원 안내 표시. 이미지 보존 3개 정리(로컬·운영 각 2개 삭제). 증거 front `.local/invite-notice-deploy-20261029/`.

- 사용자 요청: 가입 화면에서 "인증 코드 받기"를 누르면 관리자가 지정한 이메일인지 먼저 확인하고, 아니면 "베타기간(~26년 11월)에는 사전 협의된 유저만 가입할 수 있습니다. 빠른 시일 내에 그랜드 오픈을 준비하겠습니다." 알림.
- 변경: `signup-policy.ts` SIGNUP_INVITE_REQUIRED 문구를 위 문장으로(INVITE_REQUIRED_MESSAGE). `auth.service.ts` requestCode 순서를 이메일 형식 → 초대 확인 → 약관 시행 확인 → 발송 제한으로 변경(초대된 이메일은 여전히 약관 시행 전이면 POLICY_NOT_PUBLISHED). 가입 제출(signup)의 초대 확인은 기존과 같음.
- "관리자 지정 이메일" = 운영 runtime.env `SIGNUP_EMAIL_ALLOWLIST`(쉼표 구분, 현재 비어 있음, BETA_MODE=true라 아무도 통과 못함). 관리자 콘솔 편집 기능은 없음.
- 검증: legal 테스트를 초대 이메일 기준으로 갱신 + 비초대 이메일의 코드·문구 검사 추가. signup-mode·beta-policy·auth-hardening·mail 파일별 통과(같은 e2e DB 테스트 동시 실행 시 충돌 → 파일별 실행). 대조: dist에서 순서 원복 시 실패.
- 위험: 약관 검사 전에 초대 여부가 응답돼 초대 이메일 여부를 추측할 수 있음(초대=503, 비초대=403). 베타 소수 명단이라 수용, 필요 시 IP 단위 제한 검토.

## 2026-10-29 개인정보처리방침에 CI 명시 (KG이니시스 CI 기재 가이드, 운영 배포)

- 근거: 이니시스 심사표 "개인정보처리방침 URL 세부사항" 시트 — 수집 항목에 "CI" 텍스트 필요, 미기재 시 카카오 인증서 미노출, 예시 "[암호화된 이용자 확인값(CI)]".
- 변경(`src/platform/legal-documents.ts`, version 2026-10-29.2): 처리방침 2절에 본인확인 시 공급자로부터 받는 항목(이름·생년월일·성별·내외국인·휴대전화번호·암호화된 이용자 확인값(CI)·DI·인증 결과)과 실제 저장 범위(실명, CI 비가역 검증값, 만19세 여부, 인증 결과; 생년월일은 판단에만, 성별·내외국인·전화·DI 미저장)를 명시. 8절에 KG이니시스 통합인증과 연결 인증사 이용 예정과 처리 항목. 가입 안내(collection)에도 CI 명시. 저장 범위는 `auth.service.ts`·`identity-provider.ts`(name, identity HMAC, adultVerified) 기준.
- 검증: 빌드 후 legal·signup-mode·beta-policy·mail 36 통과 + 신규 CI 문구 테스트(대조: dist에서 문구 제거 시 실패, 복원 시 통과).
- 배포 완료(사용자 "배포"): API·worker privacy-ci-20261029만 교체(front/admin/DB/proxy 유지, 소스 211 일치). 운영 beta·crefans.com 처리방침에 "암호화된 이용자 확인값(CI)" 2곳, 버전 2026-10-29.2 확인. 증거 front `.local/privacy-ci-deploy-20261029/`. 심사표 13번 Y로 기입(남은 빈칸은 7번만). 이니시스 계약 확정 시 수탁 문구를 "예정"에서 확정으로 갱신.

## 2026-10-29 고객지원 이메일 khpark@grade.im → khpark@crefans.com 일괄 변경 (코드만, 미배포)

- 사용자 지시: 약관·서비스의 grade.im 이메일을 khpark@crefans.com으로 일괄 변경.
- 변경: `src/platform/legal-documents.ts` 3곳(이용약관 운영자 정보, 처리방침 처리주체·권리 연락처) + 법률문서 version `2026-10-29.1`·updatedAt 2026-10-29(effectiveAt null·가입 미시행이라 기존 동의 영향 없음). `src/auth/local/mail/templates.ts` 메일 하단 연락처·replyTo. 테스트 `platform-beta-policy` 기대값. guide `help/contact.md`, `resources/service-introduction.mdx`(2), `brochure/service-introduction.html`(3). front `lib/content/business.ts` 주석.
- 검증: `npm run build` 후 `CREFANS_E2E=true node --test` beta-policy·legal·mail-templates·signup-mode 36 통과. 대조: dist 템플릿을 옛 주소로 되돌리면 1건 실패, 복원 시 통과.
- 미변경: 명함(`front public/brand/business-cards/khpark-front.png` 이미지와 `BusinessCard.tsx` alt)은 인쇄 디자인이라 재제작 필요, 감사 증거 JSON(과거 기록), 이니시스 심사표 담당자 이메일(문의 발신 주소).
- 배포 완료(2026-10-29, 사용자 "지금 배포해"): API·worker legal-email-20261029(front 증거 `.local/legal-email-deploy-20261029/`), 가이드 정적 email-20261029(가이드 `.local/deploy-email-20261029/`). 운영 /api/v1/common 법률문서 3종 2026-10-29.1, grade.im 0.

## 2026-10-29 crefans.com·www.crefans.com 서비스 전체 연결 (가이드 이동 해제, 운영 반영)

- 저장소 `infra/platform/Caddyfile`을 운영본(sha256 5aa1a3d6…)과 맞췄다(서브도메인 3개·루트/www 앱 블록, 루트 가이드 이동 블록 삭제).
- 심사표 7번 준비: 프론트 사이드바·설정 하단 사업자 정보 배포(front PROGRESS footer-business-20261029). 비로그인 모바일에는 미표시.
- 사용자 결정: 심사표 결과 수신 URL ①②가 동작하도록 루트·www도 베타와 같은 서비스·API를 보여 준다. 같은 날 오전의 "루트→가이드 302"를 대체한다.
- 적용: Caddyfile에서 루트 이동 블록 제거, 앱 블록 호스트에 crefans.com·www.crefans.com 추가. runtime.env `FRONTEND_ORIGINS`에 두 주소 추가, API·worker만 재생성. 다른 env 줄 변경 없음(diff). 백업 `/opt/crefans-backup-rootdomain-service-20261029`, 증거 front `.local/rootdomain-service-20261029/`.
- 확인(6개 도메인 모두): http 308, 첫 화면 302→/service/feed, 피드 200, /api/v1/health 200, 자기 출처 로그인 요청 400(출처 통과), 외부 출처 403. 루트·www 인증서 Let's Encrypt 유지(2027-01-27). admin·guide 200, business 302. proxy·DB·admin·frontend 재시작 0.
- 남은 일: `/api/v1/identity/inicis/result` 미구현(모든 도메인 404). 심사표 7번 하단 사업자 정보, 13번 처리방침 CI. 가이드는 guide.crefans.com으로만 접근.

## 2026-10-29 심사용 서브도메인 www-stage·www-dev·www-local 개방 (운영 반영)

- 사용자 요청: KG이니시스 심사용으로 세 주소를 외부에서 열고 로그인까지 되게. 서버 증설 없이 기존 EC2 한 대·같은 소스·같은 운영 DB를 쓴다(이름만 stage/dev/local).
- 적용:
  - Route 53 A 레코드 3개 추가(15.164.140.26, TTL 60). 기존 레코드 없음 확인 후 CREATE.
  - Caddyfile 앱 블록에 세 호스트 추가(베타와 같은 화면·API, CloudFront 없이 직접). caddy validate → same-inode 덮어쓰기 → reload.
  - runtime.env `FRONTEND_ORIGINS`에 세 주소 추가, API·worker만 재생성. 다른 env 줄은 그대로임을 diff로 확인.
  - 백업 `/opt/crefans-backup-subdomain-review-20261029`. 증거 front `.local/subdomain-review-20261029/`.
- 확인: 세 주소 모두 http 308→https, Let's Encrypt 인증서(2027-01-27 만료), /service/feed 200, /api/v1/health 200, 허용 출처 로그인 요청 400(입력 검증까지 통과), 외부 출처 403. beta·admin·guide 200, business 302, crefans.com→가이드 302 유지. proxy·DB·admin·frontend 컨테이너 유지, 재시작 0.
- 쿠키 분리(사용자 요청): 운영에 `COOKIE_DOMAIN`이 없어 회원 쿠키(access/id/refresh)는 이미 Domain 없는 호스트 전용이다. www-dev와 beta의 Set-Cookie에 Domain 속성이 없음을 확인했다. 따라서 주소마다 로그인이 따로이며 코드 변경은 없다. `COOKIE_DOMAIN=.crefans.com`을 넣으면 공유되므로 넣지 않는다. 관리자 쿠키도 호스트 전용.
- 남은 일: 세 주소 하단에 사업자 정보 표시(심사표 7번). 결과 수신 경로 `/api/v1/identity/inicis/result`는 미구현.

## 2026-10-29 KG이니시스 신청서류 기입안 작성 (문서만)

- 대표 준비 현황(2026-10-29): 사업자등록증 2026-09-12 발급본(~/Documents) 사용, 통장 사본(KB 사업자통장, 대표자 명의) 준비됨, 박경호 개인 인감도장 주문함 → 수령 후 주민센터 인감 신고·인감증명서 발급, 계약서 2부 같은 도장 날인. 심사표·로고는 이니시스 안내 메일에 회신, 서류는 우편.
- 로고 완료: 심사표 14·15번 Y, 16·17번 파일명 기입(`좋아하는일해야지_834x192.png`). 남은 빈칸은 7번(하단 사업자 정보)·13번(처리방침 CI). 제출 묶음 `draft/submit/`에 xlsx·docx·PNG 2종.
- 심사표 URL 수정(사업자 결정): 복수 사이트 Y, 서비스명=사업자명, 홈페이지 ① crefans.com ② www ③ beta ④ www-stage ⑤ www-dev ⑥ www-local(.crefans.com, ④~⑥ DNS 없음), 결과 수신 URL은 각 도메인 `/api/v1/identity/inicis/result`(미구현). 제출용 파일 `.local/inicis-reply-20261029/draft/submit/`.
- **메일 전송 금지(2026-10-29 사용자 지시):** 이니시스 관련 메일·서류는 사용자가 직접 확인한 뒤 직접 보낸다. 에이전트는 Gmail 작성·발송·회신, 우편·계약 진행을 하지 않는다.
- 사용자 결정: 본인확인(03)+간편인증(01) 신청, 전자서명 미신청. 업종 "커뮤니티", 오픈 일정 "추후 오픈". 사업자 정보는 사용자가 채팅으로 주면 로컬 기입본(`.local/inicis-reply-20261029/draft/`)에만 넣는다.
- `docs/inicis-application-prep-20261029.md`: 심사자료 제출서 25항목·계약서 기입안, 제출 전 준비물, 제출 순서.
- 발견한 제출 전 준비 사항: 서비스 하단 사업자 정보가 주석 처리된 자리표시값이라 심사표 7번(계약주체 일치)을 지금은 Y로 쓸 수 없다. 처리방침에 CI 기재가 없다(없으면 카카오 미노출). 결과 수신 URL은 제안 경로(`/api/v1/identity/inicis/result`)이며 미구현.
- 로컬 기입본 작성(`.local/inicis-reply-20261029/draft/`): 심사표 xlsx(셀 XML만 수정, 이미지·서식·다른 시트 해시 동일, openpyxl로 값 재확인)와 계약서 docx(부칙·갑 정보·단가). 사업자 정보는 공개 약관 원문, 담당자 이메일은 사용자 Gmail의 이니시스 문의 발신 주소(읽기만).
- 사업자 확인: 메이크샵 가계약 MID 메일은 크레팬스와 무관하고, 좋아하는일해야지의 서비스는 크레팬스(독립몰) 하나다. 결제 PG는 토스페이먼츠(사업자 확정), 이니시스는 인증 전용. 계약서 MID를 "추후발급"으로 기입했고 PG 미이용 사업자 절차(원본 우편 제출)로 진행한다.
- 남은 일: 로고 PNG 2종, 푸터 사업자 정보·처리방침 CI 반영(배포는 별도 지시) 후 심사표 7·13·14·15·17번 채우기. 계약서 Word 인쇄 모양 확인. 발송·계약 없음, 커밋 없음.

## 2026-10-29 KG이니시스 회신·계약 준비 목록 확인 (읽기 조사)

- 사용자가 지정한 Chrome Gmail의 상품운영팀13:40 회신과 첨부 계약서·심사표3시트·FAQ를 읽었다. 기존 작성 중 초안은 수정하지 않았으며 외부 발송·계약·심사 제출·결제·운영DB쓰기 없음.
- 최신 준비 목록과 조건은 `docs/inicis-identity-research-20261029.md` 상단에 추가. 회원가입은 본인확인03 우선, 간편/전자서명 별도선택. KG MID 미보유 시 원본2부 우편계약, 심사표/PNG2종 동시 준비, 계약 후 테스트정보, 약3주 예상 안내. 비공개 단가는 공개문서 대신 `.local/inicis-reply-20261029/private-quote.json` 보관.
- 계약서 CI 즉시파기와 회신의 본인확인 보관 허용, 삼성/농협 인증서 표시, 청구일10일/10영업일, 서명 대체 서류명 불일치는 담당자 서면확인 필요로 구분. 기존 사전조사의 과도한 유일성/콜백메서드 단정은 재사용 금지 표시. 실제 본인확인 구현·개통·실인증 검증은 이번 범위 아님.
- 증거 `.local/inicis-reply-20261029/research-evidence.json`, 원본3개 SHA·전체 추출·PDF1쪽 육안·공식2페이지 대조. DOCX 변환의 한글 폰트 누락은 한계로 기록하고 원본XML 본문/표로 읽음. 원본 파일 변경 없음. 공통 문서검사는 front `.local/event-guide-deploy-20261029/docs-checks.json` 참조. 기존 변경 보존, 커밋/푸시 없음.

## 2026-10-29 루트 도메인 HTTPS (crefans.com, www.crefans.com → 가이드)

- 증상: crefans.com과 www.crefans.com에 접속이 안 됐다. 원인은 Route 53에 두 이름의 A 레코드가 없던 것이다. 이름 해석에 실패해 브라우저가 계속 재시도했다.
- 조치(사용자 요청: 루트 도메인은 가이드로 이동):
  - Route 53에 두 A 레코드를 만들었다(15.164.140.26, TTL 60). 기존 MX·SPF·DKIM은 그대로 뒀다.
  - Caddyfile에 `crefans.com, www.crefans.com` 블록을 추가했다. Let's Encrypt 자동 인증서, `https://guide.crefans.com/`으로 302, HSTS.
  - 운영 proxy에서 검증한 뒤 same-inode로 덮어쓰고 reload했다. proxy 재시작은 없었다. 백업: `/opt/crefans-backup-rootdomain-20261029`.
- 확인:
  - http는 308로 https가 된다. https는 302로 가이드로 간다(경로가 있어도 가이드 첫 화면).
  - 인증서: Let's Encrypt, 2027-01-27 만료, 자동 갱신.
  - beta·admin·guide·business 모두 200, proxy 재시작 0.
  - 로컬 맥은 DNS 부정 캐시 때문에 잠시 해석에 실패해서 `--resolve`로 확인했다.
- 증거: front `.local/rootdomain-https-20261029/`.

## 2026-10-29 KG이니시스 본인확인 사전조사 (코드 변경 없음)

- 사용자 요청: 회원가입·본인인증 용도로 KG이니시스 도입을 조사. 결과는 `docs/inicis-identity-research-20261029.md`에 있다.
- 결론:
  - 공개 테스트 키가 없어 계약 전에는 실연동 테스트를 할 수 없다.
  - 법적 본인확인은 `reqSvcCd=03`만 해당한다. PASS·카카오·네이버는 본인확인이 불가하고, 휴대폰 SMS는 별도 제휴다.
  - 성인 판정은 `userBirthday`로 할 수 있다.
  - 현재 어댑터 구조는 직접 연동으로 바꿔야 한다: 자동 제출 form, 서버 결과 조회, SEED 복호화, 20byte `mTxId` 컬럼.
  - SEED는 Node 기본 설정에서 거부되고, 로컬에서는 legacy provider로만 동작했다.
  - 청소년보호법 시행령 제17조에 따른 1년 재확인 필드가 필요하다.
- 사업자 결정 대기: 공급사(이니시스·휴대폰 제휴·NICE 비교), 성인 업종 심사, 단가, 간편인증 인정 여부, 1년 재확인과 기존 회원 처리. 문의는 발송하지 않았다.
- 추가 조사(같은 문서 하단):
  - 네이버·토스·PASS·카카오를 한 창에서 지원하는 것은 이니시스 통합인증뿐이다(직접 또는 포트원).
  - 포트원 헬프센터 기준으로 성인 업종은 네이버·토스·카카오 전면 불가, PASS 부분 가능이다.
  - 계약 없이 운영할 수 있는 곳은 없다(포트원도 PG 계약 필수, 다날은 테스트 환경 없음).
  - 가장 빠른 테스트는 토스인증 직접 연동이다(이메일 요청 후 가상 인물 테스트).
  - 사업자 확정(2026-10-29): 크레팬스는 성인 업종이 아니다. 이니시스 통합인증(네 가지 모두)이 우선 후보가 됐다. 다만 19세 가입 제한과 민감 콘텐츠 기능을 신청서 설명과 맞춰야 한다.

## 2026-10-29 WAF 적용 비용 조사 (보류)

- WAF 읽기 전용 조회 결과:
  - beta CloudFront Web ACL은 규칙 0개·기본 허용이고 로그 설정이 없다.
  - admin·guide·business·원본은 EC2로 직접 연결돼 WAF를 거치지 않는다.
  - 최근 30일 beta 트래픽: 요청 11만 건, 15.3GB.
- 전부 CloudFront+WAF로 옮기는 비용(상세와 재개 순서는 `infra/platform/resilience-runbook.md` 7절):
  - A안: 전부 Free, 월 약 0달러.
  - B안(권장): beta만 Pro, 월 15달러.
  - C안: 종량제, 월 약 7~8달러.
- 사업자 결정: 문서로 저장하고 보류. 원본 우회 차단은 Caddy 비밀 헤더 검사가 필요하다(보안 그룹을 좁히면 인증서 갱신이 막힘).

## 2026-10-29 보안 점검 항목 보완 (운영 반영 security-20261029, AWS 미적용)

- 사용자 결정(2026-10-29): AWS 변경은 스크립트·절차만 준비, 콘솔 세션 12시간/유휴 1시간, 감사 로그 장기 보관 후 자동 삭제, 운영 배포는 별도 지시. 보관기간은 처음 제시한 1년이 아니라 730일로 정했다. 안전성 확보조치 기준 제8조의 2년 대상 여부를 확정하지 못했고 삭제는 되돌릴 수 없기 때문이다(`docs/operational-logging.md`).
- AUTH-01 이메일 변경 요청에 현재 비밀번호(회원별 10분 5회). AUTH-02 회원·운영자 로그인 세션 생성 때 회원/운영자 행을 잠그고 검증한 해시와 비교(비밀번호 변경·재설정과 직렬화). AUTH-03 `ADMIN_ORIGINS` 분리·콘솔 경로와 관리자 쿠키에 Origin 필수(`middleware.ts::originGuard`), 콘솔 도메인에서 회원 auth 경로 제거. AUTH-04 비밀번호 설정 공통 계약 8~128자·앞뒤 공백 거부, 로그인은 이전 저장값(공백 trim/256자) 호환. AUTH-05 콘솔 절대 12시간·유휴 1시간·갱신 시 연장 없음.
- FIN-01 토스 조회 오류(403 조회 제한 등)와 ALREADY_CANCELED_PAYMENT를 실패가 아닌 결과 불명으로 분류. FIN-02 콩 대사·출금 항목별 오류 격리, 환불/출금 배치 순환(updated_at). FIN-03 PIN 재설정 시 콩 출금 승인도 회수. FIN-04 결제 120일 이내 paid 멤버십을 분당 10건 공급사 재조회: 전액 취소면 환불과 같은 경로로 1회 정정, 부분취소·불일치는 운영 알림만.
- OPS-02 watchdog 확장(결제/환불/콩 30분, 알림 적체 15분, 광고 메일 불명, 로그 정리 지연), worker tick 15분 정체 시 종료→재시작, API healthcheck. OPS-03 동의 안내 우선 발송. OPS-04 운영자 요청 기록은 감사 보관기간을 따르고 730일 미만 거부. WEB-01 HSTS·frame-ancestors(Caddy 4개 도메인). DEP-01 server audit 25→8(남은 것은 Nest 11 필요, SSE·TCP microservice·FileTypeValidator 미사용으로 해당 경로 없음).
- 준비만: `infra/platform/resilience-runbook.md`(외부 백업·CloudWatch/Route53·CloudTrail·S3 버전관리·WAF COUNT), `backup-offsite.sh`(미실행), `restore-rehearsal.sh`(로컬 dev 덤프 통과, 깨진 덤프·해시 불일치 대조 실패 확인).
- 검증: build 0, 전체 서버 테스트 361 중 355 통과·1 skip·5 실패. 실패 5건은 이번 변경과 무관(실 AWS opt-in 필요 1, 로컬 토스 키 설정으로 미설정 기대 2, 10-28 운영자 분리 후 갱신 안 된 기대값 2: beta-cohort 관리자 가드·integration /admin/documents 403→401). local-members 12/12. 신규 회귀 AUTH 4·FIN 4, 수정 전 동작으로 되돌린 빌드에서 AUTH-02/FIN-01/FIN-03 실패 확인. Caddy validate 통과. 로컬 dev DB에 운영과 같은 미적용 마이그레이션 3개 적용(삭제 대상 0행 확인).
- 운영 반영 2026-10-29 `security-20261029`:
  - 교체: API/worker·front. 유지: 콘솔 이미지(코드 변경 없음)·DB·proxy.
  - runtime.env에 `ADMIN_ORIGINS`, `OPERATIONS_WATCHDOG_ENABLED=true`, `AUDIT_RETENTION_DAYS=730` 추가.
  - compose.yml에 API healthcheck 추가. Caddyfile은 same-inode로 교체 후 validate·reload.
  - 마이그레이션 변경 없음. 백업: `/opt/crefans-backup-security-20261029`.
  - 운영 확인: 콘솔 로그인 팬 Origin 403·Origin 없음 403·콘솔 Origin 401, 콘솔 도메인 회원 auth 404, HSTS·frame-ancestors 확인, API healthy, 소스 해시 일치.
  - 증거: front `docs/audit/security-deployment-20261029.json`. 커밋·푸시 없음.

## 2026-10-29 보안·장애 대응 점검 (광고상품 배포 후, 개선 미적용)

- 인증/권한·금융/미디어·장애복구 AI 검토 3개를 통합하고 운영/AWS 읽기와 격리 검증을 수행. 보고서: `crefans_front/docs/security-review-20261029.md`, 증거: `crefans_front/docs/audit/security-review-20261029.json` 및 프론트 `.local/security-review-20261029/`. 실제 외부 감사/공인 인증 아님.
- P1: 지원 종료 Next14/패치 지연, 이메일 재인증 누락, 비밀번호 회수-로그인 경쟁, PG 조회 제한 오분류/외부 멤버십 취소 대사, 동일EBS 백업 의존, watchdog off/독립 감시 부재. 기타 PIN 콩승인 회수·배치 격리·Origin/비밀번호/세션·로그/미디어복원 보완을 기록. 실제 침해·이중 청구가 발생했다고 단정하지 않음.
- 검증: 서버 빌드0·격리 E2E/대역100통과·1skip·0실패, 신규 메모리 재현/실패 대조 주 담당 재실행0, 관리자43업무경로 권한 및 누락 대조. 운영 GET9/9, 실행소스/28migration 대조, AWS/호스트 설정 읽기. front audit7/server25 package 경고(exit1), admin/guide0(exit0); 도달 가능한 공격 수와 구분. 문서검사 명령·최종 결과는 위 증거 JSON의 documentationValidation 참조.
- 한계: 제품 보안 수정/운영 설정 변경·실제 로그인/외부 발송/금융/운영 공격·부하·복원은 미실행. Toss test, 베타·실은행/광고메일off 유지. 기존 미커밋 변경 보존, 커밋/푸시 없음. 다음: 보고서 P1 수정과 실패경로 회귀, 외부백업/복원·감시, RPO/RTO/보유정책 결정. Docker Desktop 종료 및 backend 없음 확인.

## 2026-10-29 광고상품·공통 UI 운영 배포 (advertising-20261029)

- 사용자 “운영배포후 보안 및 장애 대응 점검” 승인으로 front41·server8·admin7 파일만 직전 운영 소스에 반영. 새 DB 테이블 ad_products 1개, 총28 migration 해시 일치. 광고상품 등록/수정/노출·판매 개별 설정/소프트삭제 API·콘솔, 스튜디오 목록·목업 적용. 공통 하단 스낵바·모바일 갤러리 이미지 탭·포스팅 후원 플랫 동전도 함께 반영. 무관한 PSD/Finder 파일 제외.
- 이전 로컬 검증 소스 해시 일치 확인, amd64 API/콘솔/프론트 순차 빌드 통과. 내부 소스·콘솔 실행 산출물 대조 후 약799MB 직접 스트리밍. 설정/DB 백업→migrate deploy→API/worker→admin→front. DB/proxy 컨테이너와 나머지 환경설정 보존. 백업 /opt/crefans-backup-advertising-20261029.
- 운영검증: 6컨테이너 정상·재시작0, frontend669/API211/worker211 소스 해시 일치, HTTP10건(광고목록 비로그인401 포함). PC Chromium·iPhone WebKit 프론트18/18, 콘솔4/4 통과. 콘솔 및 서비스 쓰기는 브라우저 API대역으로 운영 DB에 저장하지 않음. 최초 콘솔 테스트 도구 중복 로드 실패는 콘솔 저장소 도구로 분리해 해결, 제품 코드 변경 없음.
- 이미지 계획 보고 후 로컬·운영 각각 최신9개 보존, 이전 faq-payout(front)/operators(api/admin)3개씩 일반 삭제. DB/볼륨/강제삭제 없음. Mac Docker Desktop 종료 확인. 기존 dirty 변경 보존, 커밋·푸시 없음.
- **실제 광고 구매·PG·자동 노출·매출 미구현이며 서비스 구매 비활성**. 결제수단·시작/연장 방식 사용자 선택 대기. 운영 비밀번호 로그인·실PG/송금/발송·실기기 미검증. guide 소개서 프레임 별도 미배포 변경은 이번에 포함하지 않음.
- 근거: front docs/audit/advertising-deployment-20261029.json 및 .local/advertising-deploy-20261029/. 후속 보안 점검 결과는 별도 최신 절과 보고서에 기록.

## 2026-10-29 광고상품 관리 API·소프트 삭제 (구매 처리 미완료·운영 미배포)

- `AdProduct`/`ad_products`와 `20261029020000_ad_products` 마이그레이션 추가. 상품명·설명·구매/취소 안내·노출위치·VAT 포함 금액·일수·순서·visible/on_sale·version·deleted_at 관리. 공개 여부와 판매 여부 독립. 운영 상품/가격 시드 없음.
- `/studio/advertising/products`는 회원 세션+크리에이터 검증 후 숨김·삭제 상품 제외. 관리자 목록/등록/수정/삭제는 `advertising` 메뉴의 view/create/update/delete 권한으로 구분. 수정/삭제 시 행 잠금과 expectedVersion으로 덮어쓰기 방지. 삭제는 deleted_at+숨김+판매중지만 적용하며 DB 행 보존. 운영자/IP/변경 전후 감사는 같은 DB 트랜잭션, 문구는 안전한 해시만 보관.
- 검증: build, 격리 Homebrew MySQL3307 `crefans_platform_e2e`에 복사 스키마로 migration deploy 후 HTTP 광고상품5/5+기존 운영자7/7+Swagger11/11=23/23. 비로그인/팬/운영자 권한 없는 변경·잘못된 입력·숨김/판매중지 구분·삭제조회·동시 수정200/409·중복삭제 감사1회·원본 행 보존 확인. 최초 감사 timestamp 필드/Swagger 개수 기대값 오류 수정 후 통과. API 총142개(스튜디오45/콘솔49/공유 포함 팬67), 각 문서 분리 유지.
- **실제 주문·결제·광고 노출기간·매출 연결 미구현**. 결제수단과 시작/연장 방식 사용자 선택 대기. 미확정 가격·취소 정책을 임의로 등록하지 않음. 로컬 일반 dev DB와 운영 DB 미변경, 실PG/이메일/텔레그램 미발송, 운영 배포·커밋·푸시 없음. 코드/공식 자료 근거는 `docs/platform-implementation.md`, 검증은 `.local/advertising-20261029/`, front `docs/audit/advertising-20261029.json`.

## 미배포 개선 3건 운영 반영 (2026-10-29, 완료: studio-input-console-20261029)

- 사용자 “배포해” 승인에 따라 스튜디오 답글 작성자·수정·삭제, 터치 입력 최소16px·수동 확대 허용, 콘솔 마이페이지 맨 아래 로그아웃을 반영. 운영 기준 front faq-payout / API·admin admin-accounts 사본에 front11·server3·admin2 파일만 덮었고 그 외 제품 소스 변경 없음. 이전 절의 미배포 상태는 이번 배포로 해소.
- 검증: front check379/379, server build+답글·OpenAPI·운영자권한23/23, admin check8/8. amd64 3이미지 빌드·소스/레이어/라벨 대조, 콘솔 build-stage 소스59개와 실행 산출물122개 대조. 운영 front658·API/worker각208 소스 해시 일치. HTTP11건(9개200+신규답글 PUT/DELETE 비로그인401), 6컨테이너 정상·재시작0·DB/proxy ID 유지.
- 운영 브라우저: 목업 답글3조건(모카/하늘·모바일/PC) 작성자 사진·이름·인증·등록→수정→삭제·취소·팬 버튼 미노출 확인. 입력13화면×4조건=52조합, 모바일106개16px 이상·가로넘침 없음·PC 글자 유지. 실서비스 로그인/가입4조건도 정상(모바일16px/PC13px). 콘솔 PC/모바일 로그아웃 마지막 요소·24px 간격·1회 요청·로그인 이동 확인(API는 브라우저 대역).
- 운영 절차: capture→변경 파일만 사본 반영→preflight(약49.6GiB)→순차 빌드→소스 검증 후 약798MB 직접 스트리밍→DB/설정 백업→migrate deploy(27개·추가없음)→API/worker→admin→front→운영 검증. 백업 `/opt/crefans-backup-studio-input-console-20261029`. 베타/콩/실판매·송금·광고메일 플래그와 기존 migration 체크섬 유지, 배치 failures={}.
- 정리: 로컬·운영 계획을 먼저 보고하고 최신3개씩(총9개) 보존, messages-back(front)/payout-policy(api)/console-drawer(admin) 3개씩 일반 삭제. 로컬에서 목록에 있지만 태그로 조회하지 못하는 현상을 확인(이미지가 삭제된 것은 아니었음, 원인은 미확정)해 보존 도구에 정확한 ID·단일 태그·동일 저장소 digest·미사용 조건의 fallback 추가. 정상5조건과 사용중 보호 제거 대조 실패 확인. 강제삭제·볼륨삭제 없음. 최종 운영 여유 약34.2GiB. 정리 후 6컨테이너 동일·정상 재확인, 빌드용 Mac Docker Desktop 종료 완료.
- 최초 검사 실패/수정: Docker index ID와 플랫폼 manifest ID 직접 비교 실패는 빌드의 amd64 manifest·운영 tag ID·레이어·소스해시 일치 검사로 수정. React 자동생성 ID의 dev/prod 차이는 글자 비교에서 제외. 팬 프로필 모달의 옛 폭은 애니메이션 중 측정값이라 폭 동일 주장에서 제외하고 글자·넘침은 검증(다른12화면 폭 동일). 최초 실패 원본 보존. 전송 단계 분리 제안은 자동 승인 검토 거절되어 적용하지 않고 기존 ship→archive 필수 호출 유지. 제품 코드 재수정·재배포는 없었음.
- 경계: 실제 iPhone 키보드/핀치·운영 비밀번호 로그인·운영 회원 답글 쓰기는 미실행. 권한/저장 검증은 로컬 격리MySQL, 운영 콘솔 내부는 API대역이며 운영 실계정 종단 검증으로 간주하지 않음. 커밋/푸시 없음, 기존 변경 보존. 다음: 실기기 검수·별도 승인 시 운영 계정 실사용 확인.
- 증거: front `docs/audit/studio-input-console-deployment-20261029.json`, 상세 front `.local/studio-input-console-deploy-20261029/`. 공통 AGENTS 규약 유지, 보존 도구 fallback 경계만 추가. 문서 기록·검사 결과는 해당 폴더 docs-checks.json에 기록.

## 스튜디오 답글 작성자 표시·수정·삭제 (2026-10-28, 운영 미배포)

- 요청: 댓글 관리에서 내 답글에도 프로필 사진·이름을 표시하고 수정·삭제 제공. 기존 Avatar·CreatorName(긴 이름/인증 배지)·Dialog를 재사용하는 `StudioCommentReply`를 목업·실서비스·디자인 시스템에 연결. 작성자 표시, 수정 초안/실패 유지, 빈값·변경 없는 제출 차단, 삭제 확인·중복 제출 방지. 팬 답글에는 수정·삭제 없음.
- 목업은 선택한 크리에이터의 활동명·사진·인증 여부를 사용(모카 로그인 포함). 서비스는 `CommunityReply.author/fromCreator`와 PUT/DELETE `/studio/comments/:id/replies/:replyId`에 연결. 서버가 게시물 소유자·답글 작성자·부모 관계·삭제 상태를 검증하고 소프트 삭제·댓글 수 1회 변경·감사를 같은 트랜잭션에서 처리. DB 마이그레이션 없음.
- 검증: 프론트 `npm run check` 379/379(타입/레이어 포함), 서버 build 및 답글 HTTP·OpenAPI 16/16. 실제 로컬 격리 MySQL·회원 세션으로 타 계정/부모 불일치/삭제 대상/빈값 거절, 동시 삭제 200·404와 카운트 1회 감소 확인. Chromium 375/1280(모카), WebKit 375(하늘)에서 아바타 로드·등록→수정→삭제·취소 보존·팬 버튼 미노출·가로 넘침 없음·페이지 오류 없음 확인.
- `feat/studio-comment-replies`에서 작업, 기존 미커밋 변경 보존. 운영 배포·커밋·푸시 미실행. 운영 반영 시 프론트와 신규 답글 API를 함께 반영해야 함. 근거·해시·범위: 프론트 `docs/audit/studio-comment-replies-20261028.json`, 각 리포 `.local/studio-replies-20261028/`. 문서 계약·표는 구현과 대조 후 갱신하며 docs:record는 문서 해시 기록일 뿐 제품 테스트 증명이 아님.


## guide.crefans.com 프록시 블록 (2026-10-28, 운영 반영)

- `infra/platform/Caddyfile`에 `{$GUIDE_DOMAIN:guide.crefans.com}` 정적 사이트 블록 추가(`/data/sites/guide`, proxy caddy 볼륨). 운영 Caddyfile을 같은 내용으로 교체 후 caddy reload(validate 선행, 실패 시 원복, 컨테이너 재시작 없음). Route 53 A 레코드 추가. 원본·검증은 `crefans_guide/PROGRESS.md`. 다른 서비스 응답 유지 확인.

## 콩 테스트 5건 실패 원인 조사·테스트 수정 (2026-10-28)

- 증상: `tests/platform-beans.test.cjs` 20건 중 출금 5건이 409 PAYOUT_BLOCKED("출처 결제 또는 프로모션 지급 확인이 필요합니다")로 실패. 운영 소스 사본에서도 동일.
- 원인(확인): 테스트가 출금 처리 시각을 `2026-10-28T00:00:00Z`(수요일 09:00 KST)로 고정 전달(`beans.payout(id,admin,new Date(...))`, 고정 날짜 15곳). 반면 테스트 중 지급하는 프로모션콩은 `release_at=new Date()`(실제 현재). 2026-10-28 09:00 KST 이후 실행하면 고정 처리 시각이 콩 생성 시각보다 과거가 되어 `release_at>now` 조건에 걸림. 즉 달력 날짜에 묶인 테스트이며 10-28 오전 이전에는 통과했다.
- 실험: 같은 파일의 고정 날짜만 "실행 시점 이후 다음 KST 수요일"(TUE/WED/THU 상대값)로 바꾼 임시 사본에서 20/20 통과, 원본은 5건 실패 그대로(대조). 임시 사본은 삭제.
- 운영 영향: 없음. 관리자 승인(`beans.controller`)·워커는 `payout(id,admin)`으로 시각을 넘기지 않아 실제 현재 시각을 쓰므로 `release_at`(생성·결제 시점 기준)보다 과거가 되지 않는다. 일반콩 7일 보류 규칙은 의도대로 동작.
- 수정(사용자 승인): `tests/platform-beans.test.cjs` 고정 날짜 15곳과 `tests/e2e-server.cjs`(프론트 E2E용 bean-pay·payout 제어) 2곳을 실행 시점 기준 다음 KST 수요일(TUE/WED/THU 상대값)로 변경. 제품 코드는 변경 없음.
- 검증: 서버 콩 테스트 20/20 통과(수정 전 15/20), 프론트 `promotion-payout.spec` 3/3 통과(이전 날짜 의존 실패 해소). 같은 실행의 `beans.spec` 3건은 날짜와 무관한 후원 대화상자 변경 전 기대값 문제였고 프론트에서 별도 수정해 7/7 통과(프론트 PROGRESS).

## 운영자 계정 분리 (2026-10-28, 운영 배포 완료)

- 사용자 지시: 운영 콘솔 계정 테이블은 팬·크리에이터와 구분. `admins`에 password_hash·phone, 새 `admin_sessions`. `admin-auth.ts`(POST /admin/auth/login·refresh·logout, 쿠키 admin_access_token 1시간/admin_refresh_token 7일, HttpOnly·SameSite=Strict·호스트 전용, 이메일당 10분10회, 없는 이메일도 같은 해시 비용, 갱신 토큰 회전). `PlatformAdminGuard`는 운영자 세션만 인정(회원 가드 제거), API 문서 경로도 운영자 세션. 부운영자 생성은 회원 행을 만들지 않음. 만료 운영자 세션 정리 job, 부트스트랩 스크립트 `scripts/platform-admin.cjs --email --name --apply`(임시 비밀번호 1회 출력).
- 마이그레이션 `20261028150000_admin_accounts`: 기존 운영자 비밀번호 해시·전화번호를 연결 회원에서 1회 복사(운영 최고관리자는 같은 비밀번호로 계속 로그인), 콘솔 전용 `op_` 회원만 삭제. 테스트 DB 트랜잭션에서 데이터 SQL 검증 후 롤백(복사·삭제 대상·실제 팬 계정 유지 확인).
- 검증: build, admin-operators 7/7(회원 세션 401, 회원 비밀번호로 콘솔 불가, 운영자 비밀번호로 팬 로그인 불가, 갱신 토큰 1회용, 로그아웃 후 401 추가), admin-console 12/12, financial-policy 8/8, openapi 11/11(135개, adminSession 보안 스키마), beta-policy 11/11. 비운영자·비활성 운영자 응답이 403→401로 바뀐 기대값 갱신. 테스트 헬퍼 `tests/admin-session.cjs`.
- 운영 배포 `admin-accounts-20261028`(API·worker·admin, 콘솔 직접 입력 모달·을/를 포함). 직전 `operators` 사본+server 11/admin 6파일. DB 덤프 백업 후 마이그레이션 적용(총27), frontend/DB/proxy 유지. 운영 읽기 확인(개수·여부만): 운영자1·활성1·비밀번호 보유1, 소유자 최고관리자·비밀번호 이관됨, 운영자 세션0(기존 회원 세션 로그인은 재로그인 필요). 남은 `op_` 접두 회원 1명은 콘솔 생성 형식이 아니고 오늘 생성도 아닌 일반 회원이라 유지(정상). 비로그인 /admin/me 401, 콘솔 로그인 화면 200. 운영자 실제 로그인은 비밀번호 입력 금지로 미확인. 보존 단계로 api promotion-payout·admin console-spacing 삭제(운영 여유 34.3GB). 증거 front `.local/admin-accounts-deploy-20261028/`. commit/push 없음.

## 운영자·메뉴 권한 API (2026-10-28, 운영 배포 완료)

- `admin-permissions.ts`(메뉴별 허용 동작, 기존 ADMIN/MODERATOR 범위 유지, `@Permit` 메타데이터), `PlatformAdminGuard` 기본 거부·임시 비밀번호 상태 차단, 콩·매출·로그·정책 내부 검사를 권한 검사로 교체. `admin-operators.ts`(운영자 목록·생성·수정·비활성화·임시 비밀번호 재발급, 마이페이지·비밀번호 변경). 마이그레이션 `20261028120000_admin_permissions`(admins.permissions JSON, must_change_password). 금융 정책 PUT은 confirmation '정책 변경' 필수. 이름 변경은 공개 닉네임을 바꾸지 않음. 근거·표는 `docs/platform-api.md` 최신 절.
- 검증: build, 새 `tests/platform-admin-operators.test.cjs` 6/6(라우트 전수 권한 선언+없는 경우 가드 거부 대조, 입력 검증, 강제 변경, 권한 즉시 반영, 세션 종료, 감사에 임시 비밀번호 없음), admin-console 12/12, financial-policy 8/8(확인 문구 누락·오타 5종 거부 추가), openapi 11/11(132개), beta-policy 11/11. 거부 코드가 SUPER_ADMIN_REQUIRED→ADMIN_PERMISSION_REQUIRED로 바뀐 테스트 기대값 갱신. platform-beans 20중 5 실패는 변경 전 운영 소스 사본에서도 같은 5건 실패(기존, 이번 변경과 무관). platform.integration/access는 로컬 API(3001) 미실행으로 미검증.
- 운영 배포 `operators-20261028`(API·worker·admin). DB 덤프 백업 후 마이그레이션 1건 적용(총26), frontend/DB/proxy 컨테이너 유지. 새 경로 비로그인 401(없는 경로 404), API 이미지 `@Permit` 33곳 확인. 운영 DB의 기존 최고관리자(kayheypark 계정) 이름·전화번호 반영과 최고관리자·활성 확인(감사 기록 남김, 활성 운영자 1명). 이미지 보존으로 api tip-attribution·admin promotion-payout 삭제(운영 여유 34.3GB). 증거 front `.local/operators-deploy-20261028/`. commit/push 없음.





## 인프라·배포 현황 조사 (2026-10-28, 읽기 전용)

- 구성: EC2 i-0c24409aae93555f2 t3a.medium(2vCPU/4GiB, ap-northeast-2a, 10-21 기동), EBS gp3 50GB 1개, EIP 15.164.140.26. Docker Compose `crefans-beta` 6컨테이너(proxy Caddy 128m, frontend 768m, api 512m, worker 384m(API 이미지), admin 384m, MySQL 8.0 1g), 로그 10MB 회전. 볼륨 database/media/caddy/private. DNS(Route53): beta→CloudFront(E2VCS3MVSGXSRC)→beta-origin(EC2), admin·business→EC2 직접. 미디어 S3 crefans-beta-media(인스턴스 역할). 외부 모니터 systemd timer.
- 위험 발견: ① EBS 스냅샷0·AWS Backup0·DLM0 → DB 백업은 배포 때 같은 디스크 `/opt/crefans-backup-*`에만 존재(디스크 장애 시 함께 소실). ② `api.crefans.com` A레코드가 미연결 EIP 52.78.251.131을 가리킴(구형 잔재, 미연결 EIP 시간당 과금; 10월 서버 기동 전 VPC 0.12달러/일 원인 추정). ③ 구형 SG `crefans`(sg-053f1388977ca223b)가 3306을 0.0.0.0/0에 개방, 현재 연결 ENI 0개라 즉시 노출은 없으나 재사용 시 위험. 현재 SG crefans-beta는 22를 /32 2개, 80/443 공개. ④ 소스는 GitHub 미푸시 로컬 브랜치에서 빌드.
- 배포 절차(현행): 운영 기준 소스 복사+변경 파일 덮기→SHA 대조→preflight→amd64 순차 빌드→이미지 내부 소스 대조→SSH 스트리밍 전송·load→deploy.sh(컨테이너 불변 확인·.env/DB 백업·이미지 태그만 교체·자동 롤백·DB/proxy 유지 확인)→운영 HTTP/브라우저 검증→보존 단계. 변경·삭제 없음.

## 배포 디스크 부족·CI 파이프라인 조사 (2026-10-28, 조사만)

- 사실: 운영 EC2 48GB 디스크·3.8GiB RAM·2 vCPU, 이미지 44개 중 사용 5개·회수 가능 29.8GB(front 26·api 11·admin 4 태그 누적). 로컬 맥 디스크 98% 사용. 원인은 배포마다 2.2GB front/1GB api 이미지를 남기고 자동 보존 규칙이 없는 것.
- 공식 근거(확인 2026-10-28): Docker pruning 문서(기본은 dangling만, -a는 미사용 전체, until 필터; 자동 스케줄 권고 없음), BuildKit GC(daemon.json builder.gc defaultKeepStorage), Kamal prune(최근 5개 보존·나머지 삭제), AWS ECR lifecycle(imageCountMoreThan/sinceImagePushed, 24시간 내 만료), Gitea Actions(1.19+, GitHub Actions 대부분 호환, 별도 runner, 신뢰하지 않는 runner 금지), Gitea 패키지 cleanup rule(소유자별 keep most recent/패턴/일수, 컨테이너는 최신 1개 항상 보존), Jenkins(권장 RAM 4GB+·디스크 50GB+, Docker 사용 시 dind/CLI 이미지 별도).
- 권장안(미결정): ① 즉시: 배포 스크립트에 성공·검증 후 저장소별 현재+직전 N개 태그만 남기는 보존 단계(사용 중 이미지·DB 볼륨 제외) ② 다음: 레지스트리 기반(빌드→push→서버 pull) + 레지스트리 보존 규칙 ③ UI/CI: Jenkins보다 Gitea+Gitea Actions가 저장소 UI·CI·레지스트리를 한 곳에서 제공하고 가벼움. 결정 필요: N 값, 레지스트리 위치(로컬 Gitea vs ECR 비용), CI 실행 위치(맥 디스크 98%), GitHub→Gitea 원격 전환 여부. 로컬 Gitea(localhost:3000)는 현재 꺼져 있음. 코드·배포 변경 없음.

## 출금 최소액 10만원 운영 배포 (2026-10-28, 완료)

- 사용자 배포 요청. 운영 기준(API promotion-payout-20261026, front moka-demo-button-deploy-20261027)에 검증된 변경만 덮어 `payout-policy-20261028` 배포: server 3파일(beta-policy 최소 100,000원, finance 오류문구, 약관 6조 "최소10만원부터"·version 2026-10-27.1), front 10파일(스튜디오 정산·출금 기준, 출금 확인 ₩0, 멤버십 예상 수익, 콩 수요일, 모바일 차단 화면 기준 표시, 목업 20%). admin·DB 스키마·migration·금융 데이터 변경 없음.
- 빌드 소스 front656/server206 모두 로컬 검사 통과 트리와 SHA 일치, 이미지 내부 소스 대조·amd64. 운영 디스크 456MB→8.8GB 확보(현재·최근 롤백 보존, 로컬에 같은 ID가 있는 옛 이미지22개만 삭제, 볼륨 미접촉). 배포 전 컨테이너 불변 확인·.env/runtime.env/DB 덤프 백업 `/opt/crefans-backup-payout-policy-20261028`, DB/proxy/admin 컨테이너 유지.
- 운영 확인: API·worker 최소 100,000원·문구·약관 버전, 플래그(BETA true·실송금/실판매 off·email-only)·migration25·DB 2000bps/7일 불변, 운영 PC 목업 스튜디오 기준·수수료 476,200·출금가능 962,800, 콩 수요일, 크리에이터 안내 10만 원, 모바일375 차단 화면 9개 기준·가로 넘침 없음. 증거 `crefans_front/.local/payout-policy-deploy-20261028/production-verification.json`.
- 미검증: 실제 크리에이터 계정의 /service 출금 화면(로그인 필요, 베타 실송금 차단). 약관 버전 변경 고지 기간은 미결정. 커밋/푸시 없음.

## 목업 모카 로그인 비공개 설정 전달 (2026-10-27)

- 프론트 목업 로그인 배포 자동 검토가 클라이언트 비교값 공개를 거절해 서버 전용으로 변경. infra/platform/compose.yml에서 frontend에 CREFANS_PREVIEW_LOGIN_HASH만 선택 전달하고 runtime.env.example은 빈 자리와 설명 추가. API/worker에는 전달하지 않고 Nest 실제 회원 인증/DB 변경 없음. 비공개 설정 자체는 운영 .env에만 주입하고 로그/이미지에 포함하지 않음. 프론트 PROGRESS 및 docs/audit/moka-preview-deployment-20261027.json을 따른다. 운영 배포·목업 실로그인·공개 에셋 비밀값 미포함 검사 완료, Nest API/worker/admin/DB/proxy 유지 확인. 기존 미배포 출금/약관 변경 보존.


## 명함 재생 제어 배포 문서 (2026-10-27)

- 프론트 명함의 계속 보기/연락처/입장 링크를 제거하고 반가워요+중지/재생/다시보기 아이콘으로 변경하여 infra/platform/README.md의 조작 안내만 현행화. 서버 API/DB/Caddy 설정 변경 없음. 배포 과정의 용량 검사 실패로 미사용 과거 프론트 이미지를 로컬 동일 레이어 복구본 확인 후 제한 정리, 현재·직전 및 모든 컨테이너 사용 이미지/DB/볼륨 보존. 프론트 PROGRESS ‘명함 최소 UI·재생 제어’와 docs/audit/card-controls-20261027.json 참조.


## 공개 명함 3D 연출 문서 반영 (2026-10-27)

- 명함 프론트의 등장0.8초/뒷면1초/앞면 전환0.7초/이후 진행 막대5초 입장으로 변경되어 `infra/platform/README.md` 시간 안내만 현행화. 서버 런타임/API/DB/Caddy 설정 변경 없음. 프론트 배포·브라우저/시험 증거는 front PROGRESS의 ‘명함 3D 등장·뒤집기 및 진행 막대’ 및 `.local/business-card-animation-20261027/` 참조. 기존 미배포 출금 정책 작업 보존.


## 공개 명함 도메인 (2026-10-27)

- 요청: `business.crefans.com/card?who=khpark`에서 박경호 대표 핑크 명함 표시 후 서비스 소개 홈 이동, 운영 배포. 명함 이미지 로드 후5초, 계속 보기로 중지, 바로 보기로 즉시 고정 주소 `https://beta.crefans.com/service/landing` 이동. 임의 redirect 파라미터는 사용하지 않는다. 잘못된/누락/중복 who는 middleware404. 공개 업무 연락처·명함만 제공하고 회원/결제 데이터는 사용하지 않는다.
- 구현: front `app/card/page.tsx`, `components/business-card/`, 명함 PNG와 두 공통 Provider의 구형 인증/테마 제외. server `infra/platform/Caddyfile`의 별도 business 호스트는 명함/관련 이미지/Next정적파일만 허용, 다른 경로404. Route53 A는 기존 EC2 원본 연결, Caddy HTTPS 자동 발급. 기존 관리 SSH 규칙 보존.
- 검증: front check360/360(타입·레이어 포함). 신규5검사에서5초/중지/unknown·중복/캐시 이미지 처리 확인, 캐시 감지 제거 시 해당 시험 실패·원복 확인. 첫 운영 WebKit 캐시 이미지 자동 이동 실패를 발견하여 수정했고 최종 운영 검증은 아래 증거로 보완한다. 최초 교체 중 health 재시도에서502 한 번 발생 후 정상화, 무중단 보장은 하지 않는다.
- 배포 범위: 기존 운영 source `notice-category-20261026`에서 명함 관련7파일만 반영. 미커밋 출금 최소액/약관/QA 산출물 변경은 배포에서 제외했고 원본 작업 파일은 보존. 회원 DB/API/worker/admin 컨테이너 및 금융/가입 정책 유지. 커밋/푸시 없음.
- 최종 상태: `business-card-fix-20261027` 운영 배포 완료. HTTPS12검사·Chromium390/1280·WebKit390에서 자동 이동5.1~5.3초/중지/즉시 이동/가로 넘침 없음·pageerror0 확인. API/worker/admin/DB/proxy5개 컨테이너ID·재시작 수 보존. 최종 증거 front `docs/audit/business-card-20261027.json`. macOS의 DNS 이전 음성 캐시로 최종 검사는 공개/권한 DNS의 A를 명시해 연결했고 TLS검증은 유지했다. 공개 DNS5개 정상 및 Route53 INSYNC. 비공개 실행·소스해시·로그는 front `.local/business-card-fix-20261027/`, 최초 배포 이력은 `.local/business-card-20261027/`. 실제 인쇄물의 휴대폰 QR 스캔은 별도.



## 출금 최소액 10만원 상향 (2026-10-27, 로컬)

- 사용자 결정(2026-10-27): 출금 최소액을 "둘 다 10만원"으로. 콩 출금은 이미 1,000콩=총액100,000원이라 불변, 멤버십 원화 수익 출금 최소액만 10,000→100,000원. 화면 시험 실패 9건은 사용자가 허용(실패해도 됨)으로 결정.
- 서버: `beta-policy.ts` minimumWithdrawal 100000, `finance.service.ts` 오류문구, 약관 `legal-documents.ts` 6조 "최소10만원부터"·version 2026-10-27.1·updatedAt 2026-10-27(effectiveAt=null 유지). 시험: platform-finance 금액×10과 경계시험(99,999 거부·100,000 허용) 추가, platform-provider-http 금액×20·PG 대사 완료 필드 추가·지급일을 수요일로 고정(기존에 금액·대사 필드·요일 3중으로 낡아 있었음), e2e-server fixture 200,000원.
- 프론트: 스튜디오 출금 min/버튼/안내 100,000원, 목업 검사·문구, 크리에이터 안내 "최소 10만 원". 시험 crefans-finance·service.spec 금액 갱신. 문서 platform-api·platform-implementation·provider-contracts·beta-role-test-plan·service-api-binding·release-test-scenarios.
- 검증(로그 `crefans_front/.local/min-withdrawal-20261027/`): server build0, 서버 12개 파일 97/97 PASS, 대조검사(최소액 10,000 원복 시 경계시험만 실패, 원복 SHA 확인), front check 355/355, E2E 기준4파일 17/17. 운영 배포·커밋 없음.
- 주의: 운영 베타 가입자가 약관 2026-10-25.1에 동의했을 수 있다. 운영 반영 시 신규 버전 동의 흐름(POLICY_VERSION_CHANGED)과 크리에이터 대상 사전 고지 기간을 정해야 한다(공정위 시정 사례상 불리한 변경은 개별 통지·충분한 기간 필요, 근거 확인 2026-10-27 언론보도 수준이라 법령 원문 확인 필요). 10-27 QA 보고서의 INC-04는 이 변경 전 기록이다.

## API 명세서 최신화 (2026-10-27)

- 사용자 요청. 0d6044e 코드에서 DB 연결 없이 OpenAPI 생성(`.local/export-openapi-20261027.cjs`): 전체124·유저67·스튜디오42(전용26+공통16)·콘솔34(관리자31+공통3). `docs/platform-api.md` 경로 표는 124개와 누락/초과0으로 이미 일치했고, 개수 서술 3곳(100/56/37/26)만 갱신.
- 검증: platform-openapi 시험(124/67/42/34 단언) R09 통과, front `npm run check:docs` 만료 확인 후 `docs:record`(스냅샷 수준, 시험 증명 아님)→PASS. 운영 Swagger 화면 개수는 열람하지 않음. 구형 docs/api-endpoints.md는 폐기 기록이라 미변경.
- QA 재시험 중 로컬 dev DB에 migration8개를 적용했다(front PROGRESS 2026-10-27 참고). 커밋 없음.

## 미커밋 변경 정리 (2026-10-26)

- 사용자 요청으로 feat/bean-support의 누적 소스·에셋·검증 문서 변경을 보존해 리포별 커밋으로 정리. 로컬 비밀 설정/실행 폴더는 제외하고 .DS_Store/TypeScript 빌드캐시는 파일을 삭제하지 않고 추적만 해제. AGENTS 규약 보존.
- 알려진 실제 비밀번호·개인키·AWS 액세스키·Telegram 토큰·Toss 운영 비밀키 패턴 검사에서 후보 없음(이 패턴 검사는 모든 비밀정보 부재의 보장이 아님). 검증 결과와 커밋 후 clean 확인은 /tmp/crefans-commit-cleanup-20261026에 저장.
- 이번 정리 검증: npm run build: NestJS 빌드 통과. 추가 실금융/E2E 재실행은 하지 않음.
- 이번 작업은 소스 보존/커밋 정리이며 운영 배포·원격 push·브랜치 병합을 수행하지 않음. 현재 기능/배포 상태와 미결정 정책은 아래 로그 유지. 다음: 운영 피드백 및 별도 요청 시 통합/푸시.


## 모든 프로모션 후원 수익 출금 (2026-10-26, 운영 배포 완료)

- 사용자 확정: 이번 이벤트 한정이 아닌 모든 프로모션콩 후원 수익 출금 허용. 과거 수신 lot도 지급·후원 출처가 검증되면 포함. 직접 구매/지급받은 잔액은 출금 불가, 수수료20%·최소1,000콩(총액10만원/실지급8만원)·PIN/본인계좌·수요일·BETA/BANK 가드 유지.
- 일반/프로모션 후원 원본을 보존해 예약·관리자/은행 반려·완료·중복·동시 요청을 처리. 기존 `reserved-paid` 공동 예약 계정과 lot allocation으로 정확히 원종류 복원. 공통 지갑/스튜디오/목업과 별도 콘솔의 회사 부담 출금 재원 표시 일치. 이벤트에 “* 프로모션 콩은 후원받은 사람이 출금할 수 있습니다.” 우측하단 보조 문구 반영.
- 서버 빌드/격리MySQL·PG/은행 대역·Swagger36, front 레이어/타입/단위355, admin 타입/단위5 통과. 프론트 E2E 고유3개(첫2개+실패1개 selector 보정 재시험), admin E2E2개 통과. 순수 프로모션·혼합 출금·출처 누락/동결/보류·직접 출금/자기후원 차단·중복과 잔액 보존 검사. 실제 은행/PG 송금 검증 아님.
- API/worker/front/admin `promotion-payout-20261026` 운영 반영. 기존 운영 대비 runtime server5/front6/admin1 파일 변경. 3 amd64 빌드, 실행소스server203/front646 SHA·3이미지 RootFS/manifest, 16HTTPS·6컨테이너·새worker 정상. DB25 migration·금융건수·잔액해시·수수료정책 불변. DB/proxy 유지, 백업 `/opt/crefans-backup-promotion-payout-20261026`.
- 운영 Chromium390/1280·WebKit390에서 목업지갑3,050콩/프로모션50콩, 목업·실서비스 이벤트 우측 보조문구/넘침없음 확인. PC 목업3,050콩 혼합출금에 일반3,000·프로모션50·실지급244,000 표시. WebKit 최초 강제 페이지 전환 중 미리읽기 중단 오류는 독립 페이지 진단에서 해당 요청200·오류0 확인 후 요청 종료를 기다리는 검사로 전체 재통과; 제품 코드 변경/오류 숨김 없음.
- BETA=true, 실제 판매승인/은행출금=false 및 가입 gate 보존. 운영 콩후원/출금 실이력0건이므로 금융 종단은 격리DB·대역 범위. 실제 지급·메일·회원정보 변경 없음. 관리자 내부 화면은 격리 E2E와 배포이미지 동일성, 운영은 로그인 보호 검사 범위.
- 증거: front `docs/audit/promotion-payout-20261026.json`; 코드/근거는 server `docs/platform-api.md` 최신 절. 과거 이벤트 정책 질문은 이번 승인·배포로 해소. 용량은 로컬 동일 복구본이 있는 미사용 구이미지6개만 정리, 현재/최근복구본·DB볼륨 유지. 세 리포 누적 미커밋·AGENTS 보존, 커밋/푸시 없음. 다음: 운영 피드백, 별도 실판매/은행 개방 검수.

## 행사명 변경에 따른 화면 계약 현행화 (2026-10-26, 완료)

- 프론트 이벤트 명칭을 크레팬스 오픈베타로 변경하여 docs/current-contracts.md의 화면카탈로그 제목 한 곳을 재생성. API/DB/서버코드·운영이미지 변경 없음. 검증/운영배포 증거는 front docs/audit/openbeta-name-20261026.json. AGENTS 유지.

## 후원 유형·출금 출처 운영 배포 (2026-10-26, 완료)

- API/worker/프론트/독립 관리자 콘솔 `tip-attribution-20261026` 배포 완료. 게시물·프로필 후원, 당시 게시물 제목, 유형별 받은후원, 출금에 실제 포함된 후원 출처와 수수료·실지급 표시 반영. 아래 구현 당시 미배포 기록은 이번 배포로 해소됨.
- DB·설정 백업 후 nullable 제목 snapshot migration `20261026120000_tip_attribution` 적용(총25개). 기존24개 checksum·금융건수·정책 유지. 6컨테이너 정상, 재시작/OOM 없음, 새worker failures={} 확인. 운영 실행소스 server203/front620 SHA 및 세 이미지 RootFS·릴리스·소스manifest 일치. DB/proxy 컨테이너 보존.
- 3개 amd64 운영빌드·14HTTPS검사 통과. 운영 Chrome 모바일390 보낸후원 제목검색/이동내역 구분, PC1280 스튜디오 집계/목업출금1,200콩의 게시물1,200·프로필0·수수료24,000·실지급96,000 표시 확인. 실제 금융 실행 없음. 관리자 운영 로그인 보호 확인; 로그인 세션 부재로 내부 화면은 이전 격리 E2E와 배포 이미지 동일성으로 범위를 구분함. 실제 운영 후원·출금은0건이므로 실데이터 종단 검증으로 확대하지 않음.
- 기존 초대가입 gate(signupReady=false)·실판매/은행출금 비활성 유지. 복구 `/opt/crefans-backup-tip-attribution-20261026`(DB/.env/runtime.env). 디스크 사전 확보는 동일 레이어가 로컬 보존된 미사용 이미지5개만 정리; 현재·최근 복구 이미지/DB 볼륨 유지.
- 증거: front `docs/audit/tip-attribution-deployment-20261026.json`; 구현 검증은 `tip-attribution-20261026.json`의 당시 기록 유지. 누적 미커밋 보존, AGENTS 변경 없음. 다음: 운영 피드백 및 별도 실결제/은행출금 개방 검수.

## 후원 유형·게시물·출금 출처 표시 (2026-10-26, 운영 미배포)

- 게시물 후원/프로필 후원을 팬 보낸후원·지갑이동, 공통 스튜디오 받은후원 및 별도 관리자 콘솔에서 구분. 후원 당시 글 제목 저장·연결, 과거 미기록은 현재 제목/정보 없음으로 명시하고 원장 사유 불변. 신규 사유는 유형별 기록.
- 스튜디오 유형별 일반/프로모션 총수·건수, 관리자 live/test/promotion별 사용량. 출금 allocation을 따라 게시물/프로필 포함 수량을 표시하고, 총액·20%수수료·실지급은 기존 저장금액 사용. 충전·후원 중복합산/권한·금융 정책 변경 없음.
- 서버 build·격리 MySQL/결제·은행 대역18개(신규2), Swagger11, front 레이어/타입/단위350, admin 타입/단위5 통과. 대역 1,000일반+50프로모션 게시물후원/500일반 프로필후원→1,200출금에서 게시물1,000/프로필200·수수료24,000·실지급96,000·지급1회·확정수수료1회 확인. 제목 수정·삭제 후 보존/기존 current fallback/프로모션 출금거절도 검사.
- Chromium390/1280·WebKit390 팬 목록/검색·지갑 및PC 스튜디오 목업출금 표시 검증. 관리자 브라우저2개(격리 실API 프로모션/원장 + 응답fixture 후원분류·출금배분·지갑) 및390/1280 화면 확인. 실제 PG/은행·운영회원 금융 실행 없음.
- 초기 검증에서는 콘솔 타입 이름 오기, 브라우저 검색 role 불일치와 모달 닫힘 애니메이션 중 캡처를 수정 후 재검증했다. 테스트 성공을 실공급자/운영 검증으로 취급하지 않는다.
- 증거: front docs/audit/tip-attribution-20261026.json. 다음 운영 배포 시 API/프론트/독립콘솔과 migration20261026120000 필요. 현재 운영 이미지·DB는 변경하지 않음. 누적 미커밋 보존, AGENTS 유지.

## 게시물 후원 금융 경로 조사 (2026-10-26, 코드 변경·배포 없음)

- 질문에 대한 정적 대조: 게시물/프로필 후원 모두 BeanTip→일반/프로모션 수익lot→studio/admin 전체콩집계→eligible→출금20%수수료 경로 공유. 멤버십 RevenueEntry와 별도. 이동.reference_id→tip.id→post_id, 출금allocation→lot→tipAllocation→post_id 추적 가능.
- 부족: 원장reason은 일괄 ‘크리에이터 일회성 후원’; 스튜디오/콘솔 받은후원 표에 게시물/프로필 구분과 대상게시물 제목·링크 없음. 게시물별 매출구분 집계 없음. 연결ID는 있으나 운영자가 화면에서 쉽게 추적하기 부족.
- 격리 DB platform-beans.test.cjs 16통과(공급사대역). 게시물 식별/중복/비허용거절과 일반 후원출금은 각각 검증되지만 유료게시물후원→출금→관리자 분류의 전용 종단검사는 없음. 운영금융실행 없음. 증거 docs/post-tip-finance-audit-20261026.json에 코드해시/HEAD/검사결과.
- 다음 권장: 사유/타입·게시물 스냅샷/상세연결, 스튜디오·콘솔 분리표시, 게시물 일반콩의 출금·수수료·집계 종단검사 보강. 현재 턴은 조사만 수행. AGENTS 유지.

## 팔로워·팔로잉 공개 설정 (2026-10-26, 운영 배포 완료)

- 기존 팔로잉 공개에 팔로워 공개 추가. 설정→개인정보 관리에서 각각 저장. 일반팬/크리에이터 공통, showFollowers optional로 구클라이언트 생략시 기존값보존; 잘못된타입 거절. DB show_followers 기존컬럼 사용, 새migration없음.
- API bootstrap/publicProfile에 followersPublic/followingPublic 전달. 타인의 비공개 팔로워 숫자/카운트 미전달, 비공개팔로잉 기존처리 유지. 목록403은 기존 서버정책. 본인 마이페이지도 비공개 항목 자물쇠·링크없음으로 일치.
- 격리DB4·Swagger11 통과. 모바일390/PC1280 설정 두스위치 off저장·재열기보존·개별on 통과. front 공통자물쇠 라벨 검사 갱신 후348통과.
- front/API/worker follow-privacy-20261026 운영 배포. 실행소스front619/server201 일치,14HTTPS·6컨테이너·신규worker 정상. migration24개/금융건수·정책불변. 운영목업390/1280 설정저장·독립스위치, Chromium390/1280·WebKit390 시온자물쇠/모카공개링크 통과. 실제회원 설정은 변경하지 않음. 복구 /opt/crefans-backup-follow-privacy-20261026, 증거 front docs/audit/follow-privacy-20261026.json. 다음 운영피드백. AGENTS 유지.

## 게시물 후원 허용 설정 (2026-10-26, 운영 배포 완료)

- 스튜디오 작성/수정에 공통 Checkbox ‘이 게시물에서 후원 받기’. 기존/신규 기본허용. tipsEnabled 공통 Post/StudioContent 응답, 목업 설정 및 팬화면 연결. 전체공개 후원 가능 유지, 자기후원 차단 유지.
- postings.allow_tips 기본true migration20261026110000. saveContent 생략시 기존설정 유지, 잘못된 타입400. 후원시 게시물 행 잠금 후 비허용409 POST_TIPS_DISABLED; 기존 성공 요청 재시도는 멱등 응답 보존. UI도 비허용 글 버튼 미노출.
- front348/server build/beans16/Swagger11 통과. 격리DB 전체공개후원·설정해제차단/잔액·원장불변·재허용·생략보존·잘못된타입 검사. PC 브라우저 체크박스 기본/해제저장/재허용저장 및 공개글모달 통과.
- 운영 front/API/worker post-tip-setting-20261026 배포. DB백업후 migration적용 총24개. 실행 소스front619/server201 해시일치·6컨테이너·신규worker 정상·금융건수/설정보존·14HTTPS 통과. 운영목업PC 체크박스 저장/공개후원 및 Chromium390/1280·WebKit390 후원확인·완료·중복1명 통과. 실제금융실행 없음. 복구 /opt/crefans-backup-post-tip-setting-20261026, 증거 front docs/audit/post-tip-setting-20261026.json. 다음 운영 피드백. AGENTS 유지.

## 후원·프로필 목록 통합 운영 배포 (2026-10-26, 완료)

- frontend/API/worker social-tips-20261026 운영 반영. 후원 확인 모달, 게시물별 고유 후원자·전용모달·충전복귀, 프로필 팔로워/팔로잉 목록 및 시온 목업 비공개. PC 좌우26px·모바일 기존폭·44px높이 유지. 아래 미배포 기록은 당시 상태로 현재 모두 배포됨.
- front check348, server build, 격리DB19, Swagger11 통과. 운영 Chromium390/1280·WebKit390 반복목업후원→1명/확인완료, 충전복귀2화면, 시온·지우 관계목록8회, 너비390/700/701/1280 검증. 실제 운영 관계목록 양방향200·잘못된query400 확인. 비공개403/소유자 허용은 격리DB 검사. 실제 금융 실행 없음.
- DB 백업 후 migration20261026090000 및20261026100000 적용, 총23개. 실행중 소스 front619/server200 해시일치, 6컨테이너 정상·신규worker heartbeat확인, 금융기록 건수·20%/7일·베타/live판매/출금gate 보존,14HTTPS검사 통과. 관리자/DB/proxy 컨테이너 유지.
- 최초 전송은 서버 디스크100%로 중단(운영교체 전). 미완료 압축 제거 및 로컬 동일레이어가 보존된 오래된 미사용 프론트이미지14개만 정리해10GB 확보 후 재전송 성공. 현재/오늘 복구이미지·DB·볼륨 보존. 향후 서버 디스크도 전송 전 점검 필요.
- 복구 /opt/crefans-backup-social-tips-20261026(.env/runtime.env/database.sql), 추가 컬럼·인덱스는 앱 롤백시 유지. 증거 front docs/audit/social-tips-deployment-20261026.json, 상세 front .local/social-tips-20261026. 다음: 사용자 운영 확인. 기존 AGENTS 유지.

## 프로필 팔로워·팔로잉 목록 (2026-10-26, 미배포)

- 공통 프로필 숫자 링크: 본인 기존 목록, 타인 ?profile= 경로. 공개 목록 페이지는 목업·서비스 공통. 시온 목업만 followersPublic/followingPublic=false; 다른 목업 및 운영 계정 설정 변경 없음.
- GET profiles/:id/connections: 20명 페이지, 양방향 조회, 비활성 회원 제외. 비공개는 익명/타인403, 소유자 허용. show_followers 기본true migration 추가, 기존 show_following 재사용.
- front check348, backend build, 격리DB3, Swagger11 통과. Chromium390/1280 시온·지우 양방향 진입8회 통과. 증거 front docs/audit/profile-connections-20261026.json. 운영 미배포; 다음 배포 front/API/migration 필요.

## 게시물 후원·고유 후원자 집계 (2026-10-26, 미배포)

- 기존 post_id 후원 연결 활용. 게시물 응답 및 후원 성공/멱등 응답 supporterCount=COUNT DISTINCT sender_id. 프로필 후원 제외, 개인 식별정보 미노출. post_id/sender_id 인덱스 migration20261026090000 추가.
- 공통 TipButton 게시물은 동전 아이콘+후원자 수, 전용 제목/대상게시물 카드/확인/완료 화면. 공유 모델 집계로 반복 후원1명 유지. 게시물 후원 유입 충전 완료도 같은 게시물 모달 복귀. 기존 프로필 후원 유지.
- front check348통과, server build·격리DB beans16통과. 고유회원1/2·멱등·프로필후원 제외·잘못된게시물 거절/잔액유지 확인. 기존 탈퇴테스트계정 재사용 오류는 독립fixture로 수정. Chromium390/1280·WebKit390 반복목업후원1명 유지/전용모달/확인완료 및390/1280 충전복귀 통과. 모바일 스크린샷 검토.
- 운영/실PG미실행. 다음 배포 API+front+해당migration 필요. 증거 front docs/audit/post-tipping-20261026.json. 기존 AGENTS 유지.

## 이력 필터 운영 배포·로컬 저장소 최적화 완료 (2026-10-26)

- frontend/API/worker를 bean-history-20261026로 배포 완료. 주문 생성 KST CF번호·목업20/41/28예시·3이력 기간/상태/방향/검색·총수/페이지 적용. 이전 미배포 기록은 당시 상태이며 현재는 운영 반영됨.
- 로컬 Docker 디스크 부족 이미지에서 빈 파일을 소스 해시 검사로 발견해 전송 전 차단. 멈춘 backend 재시작·과거 생성압축 추가5.864GB·24시간 이상 미사용 빌드캐시5.846GB 정리. 여유9.3GiB 확인. 소스/DB볼륨/운영복구본 보존. 캐시 없는 순차 재빌드 후197server+615front 파일 해시 모두 통과.
- 운영6컨테이너 정상,14HTTPS응답,새worker heartbeat,21migration·금융건수·20%/7일·live판매/송금gate 유지. Chromium320/390/1280·WebKit390 운영 목업 필터/검색/페이지/초기화/번호/가로넘침0·pageerror0 통과. 실제결제/송금 없음.
- front infra/platform/deploy-preflight.py 추가:8GiB/엔진 사전검사, 정상·공간부족 대조 통과. 배포 build.py 연결/순차빌드, 압축 직접스트리밍, AGENTS 재발방지 기록. 증거 front docs/audit/bean-history-deployment-20261026.json 및 .local/bean-history-deploy-20261026. 복구 /opt/crefans-backup-bean-history-20261026. 다음: 운영 피드백; 새 이미지 빌드 전 사전점검 필수.

## 이력 필터 운영 배포 시도 (2026-10-26, 미배포)

- 사용자 운영 배포 승인. front/API linux/amd64 이미지 bean-history-20261026 빌드 모두 성공. 전송 전 이미지 소스 검사에서 로컬 디스크90MiB 및 Docker metadata.db I/O 오류 발생. 운영 전송/교체 전 실패하여 운영은 front bean-wallet-ui-20261026, API/worker bean-vat-20261025 그대로 실행 중임을 SSH로 재확인.
- 과거 생성 압축파일6개만 정리해2927447446bytes 확보, 소스/검증/운영복구본 보존. Docker 재시작 및 멈춘 로컬 backend/UI 종료·재실행 후 엔진은 아직 연결 불가. Docker 초기화·볼륨삭제 수행하지 않음.
- 다음: 로컬 Docker 엔진 복구 후 front .local/bean-history-deploy-20261026/probe.py와 before.json 기준선 재확인, ship.py → verify.py → browser.cjs. 빌드 컨텍스트/해시·복구 포함 deploy.sh 준비됨. 배포 완료로 보고하면 안 됨. 공개 증거 front docs/audit/bean-history-deployment-20261026.json.

## 주문번호·지갑 이력 필터 (2026-10-26, 운영 미배포)

- 지갑/보낸후원 GET에 KST기간·주문상태·이동방향·후원검색 필터. 소유권을 고정하고 필터→정렬→20개 페이지→동일조건총수. 잘못된 날짜/enum/type/검색길이400, LIKE 와일드카드 리터럴 처리.
- 주문 createdAt 노출로 프론트 CF-YYYYMMDDHHmmss 표시 지원. 내부 UUID·가격/VAT/출금정책·원장 계산·DB스키마 유지. Swagger query 설명 갱신.
- build 및 격리DB 콩/원장/OpenAPI31검사 통과.26개주문/25개후원 날짜경계·20개 초과·타인내역 차단·invalid조건·와일드카드 검사. 테스트 fixture의 Date문자열 비교와 기존 탈퇴계정 재사용을 고친 뒤 통과. 프론트348·4브라우저조건 통과. 증거 ../crefans_front/docs/audit/bean-history-filters-20261026.json.
- 로컬 반영, 운영 미배포. 현재 API/worker bean-vat-20261025. API/프론트 함께 배포 필요. 실PG/송금 없음.

## 콩 신규 충전단가110원 VAT포함 운영 배포 (2026-10-25)

- 사용자10% 인상 지시에 따라 beanPolicy.chargeKrwPerBean=110과 BeansService 신규 주문 계산만 변경. krwPerBean=100/출금20%/최소1000콩 유지; 기존 주문 저장금액과 멱등 재시도/PG창/승인 보존. DB migration/재가격 계산 없음.
- npm run test:beans30검사·프론트329검사·격리DB/PG은행 대역 Playwright4시나리오 통과. 신규 금액변조 차단·기존 구가격 주문 재시도/승인1회지급·후원/기존 출금금액·PG응답유실/동시요청·원장 보존 확인. 실PG 승인이나 세무분류 확인을 뜻하지 않는다.
- crefans-api:bean-vat-20261025(API/worker)와 같은 릴리스 프론트 배포.14HTTP·API196/프론트610실행SHA·새worker heartbeat/6컨테이너 정상. DB/admin/proxy ID·21migration·금융건수·20%/7일·live판매/송금gate 유지. runtime.env는 APP_RELEASE만 변경,집IP SSH 유지.
- 상세/공식근거/복구/한계는 ../crefans_front/docs/audit/bean-vat-deployment-20261025.json 및 프론트 PROGRESS 최신 기록. 실결제/후원/지급/메일·commit/push 없음. 다음: 운영 화면 피드백, 실제판매 gate는 PG/세무·별도약관 미확정 해소 전 유지.


## 프론트 소프트3D 콩 이미지·배수 표기 운영 반영 (2026-10-25)

- 프론트만 crefans-front:bean-soft3d-20261025로 교체. 공용 충전9카드 v5 PNG와 30/50/100의 동일 크기 ×10 적용. API/worker는 bean-wallet-20261025 유지, API/worker/admin/DB/proxy ID·runtime.env·21migration/금융건수·20%/7일·가입/실금융 gate 보존. 서버 변경/재배포·실금융/메일 없음.
- front328검사/amd64빌드·602실행 SHA/9운영 PNG SHA·14HTTP·로컬/운영 각7브라우저 검사 통과. 증거 ../crefans_front/docs/audit/bean-soft3d-deployment-20261025.json, 상세와 복구는 프론트 PROGRESS 최신 기록. 미커밋 보존·commit/push 없음.


## 프론트 클레이 콩 충전 이미지 운영 반영 (2026-10-25)

- 프론트만 crefans-front:bean-clay-20261025로 교체했다. API/worker는 기존 bean-wallet-20261025이며 API/worker/admin/DB/proxy ID·runtime.env 바이트·21migration/금융건수/수수료20%·보류7일/기존 가입·실금융 gate 유지. 서버 소스·스키마·정책 변경/재배포 없음.
- 공용 충전9카드 이미지·중복 지갑 목업 안내 제거,10개 에셋 운영SHA·프론트563실행파일·14HTTP·로컬/운영 각7브라우저 검사 및 front328검사/amd64빌드 통과. 금융 실행/외부발송 없음. 증거 ../crefans_front/docs/audit/bean-clay-deployment-20261025.json. 프론트 상세/복구는 해당 PROGRESS 최신 기록을 따른다. 누적미커밋 보존,commit/push 없음.


## 지갑·충전·잔액 계층 운영 배포 (2026-10-25)

- 사용자 배포 지시로 앞선 지갑 툴팁/모바일 커버 내지갑·9수량3열 전용충전·사용가능/출금가능 주요2지표/접힌 계층과 서버 응답 확장을 모두 bean-wallet-20261025에 반영했다. API/worker 및 프론트만 교체, 독립 콘솔·DB·프록시 컨테이너 ID 보존. 목업/서비스 공유 유지.
- server196/front553 실행파일 SHA와2이미지 linux/amd64/전체RootFS 일치. 컨텍스트 server199/front554 작업본 해시 불변, 변경은 beans.service와 요청UI/라우터·타입/목업 및2컴포넌트 추가다. build2개 통과 후712,538,906바이트를 개인 SSH로 직접 전송해 SHA 검증/적재했다. Mac에 큰 압축본을 만들지 않았고 적재 후 생성한 원격 압축본만 삭제했다.
- .env의 API_IMAGE/FRONTEND_IMAGE, runtime.env의 APP_RELEASE만 변경. /opt/crefans-backup-bean-wallet-20261025에 비공개 설정 백업, 복구 이미지는 API/front beans-20261025. DB migration없음,21개 체크섬·수수료20%/보류7일 version2·금융 주문/충전/후원/출금 건수 불변. 집IP SSH 지속 허용 보존.
- 운영 HTTPS14개(정상200/인증필수401), 브라우저14개(360/390/767/1280 잔액/계층·목업충전, 스튜디오 목업예약20%견적,390/1280 프로필 진입/툴팁·9가격, 실제충전 비로그인 차단) 통과. 모바일 지갑/충전/프로필 캡처 직접 확인. 6컨테이너 restart0/OOMfalse, 새 worker 시작 이후 heartbeat failures={} 확인. 실제PG·후원·프로모션·송금/메일/별도봇 시험 발송 없음.
- 신규 실제 지갑 필드의 인증 운영 호출은 미실행이며, 격리DB/공급사 대역29검사·프론트328검사와 실제 운영 소스/가드 검사를 구분한다. 가입 signupReady=false/빈 초대 명단, email-only/beta/live콩판매false/실출금false/광고메일false 유지.
- 증거 front docs/audit/bean-wallet-deployment-20261025.json, 원본 server .local/bean-wallet-deploy-20261025. 두 리포 feat/bean-support 누적미커밋 보존·커밋/푸시 없음. 아래 미배포 로그는 이전 시점 기록이며 현재 배포 상태는 이 로그가 우선한다. 다음: 사용자 화면 확인·버그 대응.


## 콩 잔액 주요 지표·세부 계층 (2026-10-25, 운영 미배포)

- 지갑/스튜디오 공용 BeanBalanceSummary에서 사용 가능한 콩·출금 가능한 콩 두 지표만 크게 표시한다. 일반/프로모션·출금조건충족 일반후원·사용보류/출금제외 후원/받은프로모션/출금처리중은 기존 AccordionItem의 기본 접힘 안 계층 리스트다. 총합과 하위 분류가 혼동되지 않게 출금 제외 그룹을 별도로 명시한다.
- 서버 wallet 응답에 spendableBreakdown과 withdrawableBeans를 추가했다. 사용가용은 미동결 구매/프로모션 lot group 합, 출금가용은 스튜디오/견적의 기존 eligible(live/실입금/보류완료/미동결 일반후원) 재사용. raw 원장잔액을 가용액으로 표시하지 않으며 누락값은 미확인으로 표시한다. API 경로/DB/출금 정책·최소액/수수료/PIN/은행 검증은 변경 없다.
- 서버 build+격리DB/PG·은행 대역 콩/원장/Swagger29검사 통과(동결 구매 제외·입금 전0/후1100·보류/동결0·예약1000 후가용100). front 레이어356파일·타입·328검사 통과(신규 요약3개 포함). 로컬3010 브라우저9개:360/390/767/1280 요약/계층/목업충전 반영8개+스튜디오 예약·20%견적1개. 모바일/PC 캡처 확인.
- 처음 브라우저의 region 다중일치 locator를 명시 패널로 수정했고, 펼침 중 캡처는 애니메이션 최종 높이를 기다려 다시 생성했다. 증거 docs/audit/bean-balance-hierarchy-20261025.json, 원본 양 리포 .local/bean-balance-hierarchy-20261025. 실금융/외부발송·운영배포·커밋 없음.
- 다음: 요청 시 서버 추가 응답과 직전 충전/지갑 UI를 함께 배포. 운영 신규 필드 미반영 상태에서 합계를 임의 추정하지 않는다. 기존 가입/실금융 차단·외부 준비 미완료는 유지한다.


## 프론트 콩 충전 전용 화면 계약 반영 (2026-10-25, 운영 미배포)

- 프론트 공용 /preview/beans/charge·/service/beans/charge 추가로 docs/current-contracts.md의 화면 카탈로그를45→46으로 재생성했다. 서버 API123개·DB73모델/21migration·주문 금액산출/결제/원장/정산 로직은 변경하지 않았다. 기존 PG 결과 success/fail 경로 유지.
- UI는9개 수량3열·1콩100원, 선택 전 제출 차단/같은 주문 재시도. 프론트325검사·로컬 브라우저11개 및 키보드검사 통과. 증거 front docs/audit/bean-charge-page-20261025.json. 실제 PG/DB 공급사 E2E 재실행·금융 실행·배포 없음. 프론트와 직전 지갑 UI 변경은 사용자 요청 시 배포할 상태다.


## 잔여 미배포 대조·PASS 보류 설정 반영 (2026-10-25)

- 전체 실행 입력801개(server197/front547/admin57)를 이전 배포 문맥과 대조하여 누락·차이0건, 운영 DB21개 migration checksum과 활성 인프라4개 SHA 일치를 확인했다. 베타 정책·광고 동의/철회·안내/FAQ·콩 상품 및 공유 UI/독립 콘솔 코드는 이미 beans-20261025에 반영되어 있었다. 앱 코드·이미지를 불필요하게 재배포하지 않았다.
- 빠져 있던 운영 SIGNUP_IDENTITY_MODE=email-only를 추가하고 API/worker만 재생성했다. 설정 원본을 /opt/crefans-backup-release-completeness-20261025에 비공개 백업하고 다른 runtime 값·이미지 설정 바이트 보존을 검사했다. 첫 시도의 백업 권한·따옴표 사전검사 실패는 변경 전에 중지됐고 수정 후 성공했다. SSH 지속 허용 규칙은 유지했다.
- 운영 HTTP16개, 브라우저8개(기존 콩6개와390/1280 실제 가입 화면 PASS 미노출·연령 확인·약관 차단2개), 서버196/프론트551 실행 파일 SHA·3이미지 전체 RootFS, 6컨테이너 restart0/OOMfalse 및 배치 failures={}를 재검사했다. DB/프록시 ID 유지, 실제 원장 균형·회사1억·정책 version2 수수료20%/보류7일 확인. 캡처 직접 확인.
- 가입은 빈 초대 명단·signupReady=false로 아직 닫혀 있다. 실결제·은행출금·광고메일 비활성화 유지. 이메일 연령 체크를 본인/성인인증으로 간주하지 않는다. 실제 금융·프로모션·메일·별도봇 테스트 발송 없음. 실PG 승인/은행 bridge·실제 개인정보 처리 사실/시행일·초대 명단 및 부하/복원 검수는 남아 있다.
- 증거: front docs/audit/release-completeness-20261025.json, 원본 server .local/release-completeness-20261025. 문서에 남아 있던 PASS 미적용·DB정책/결제migration 미적용 현재 설명을 갱신했다. 과거 실행 기록은 당시 상태로 보존한다. 세 리포 feat/bean-support의 누적 미커밋 보존, 커밋/푸시 없음.


## 콩 기능 운영 테스트 배포 (2026-10-25)

- 사용자 운영배포 지시로 API/worker·팬 프론트·독립 콘솔을 beans-20261025로 반영했다. 콩 지갑/충전·후원·스튜디오·콘솔 진입과 기존 목업 링크 유지. beta.crefans.com/preview/beans, /preview/studio/beans, /service/beans, admin.crefans.com/console/beans. 실제 서비스/콘솔은 기존 로그인·역할 가드를 유지한다.
- 운영 백업 /opt/crefans-backup-beans-20261025에 설정·단일 트랜잭션 MySQL dump/SHA를600/700으로 보존. migration17→21(베타/광고claim/콩원장/콩상품4개), 회사초기1억/발행대조-1억·genesis1회·증감0 확인. 승인 정책 DB version2=20%/보류7일(기존 version1=20%/0일). 기존 주문·출금0건, 테스트 자금을 실제 매출/자본금으로 기록하지 않는다.
- 운영 BETA_MODE=true/BEAN_LEDGER_ENABLED=true, BEAN_LIVE_PAYMENTS_APPROVED=false/BANK_PAYOUTS_ENABLED=false/MARKETING_MAIL_ENABLED=false, test_ck/test_sk와 CREFANS_E2E=false를 확인. 다른 비밀값/설정 보존. 가입 법률/초대 gate는 해제하지 않았고 실제 PG·PASS/은행 연결 완료/가입 개방으로 보고하지 않는다.
- local검증728소스 일치와3개linux/amd64 이미지 빌드, private SSH archive739,548,464바이트/SHA 대조. 운영 서버196/프론트551파일 SHA와3이미지 RootFS/아키텍처/릴리스 일치. HTTP16개(정상200/인증필수401), 실제 운영 브라우저6개(390/1280 목업충전·프로필후원·최소1000콩/20%견적·실지갑/콘솔로그인보호) 통과. 변경 전 새 지갑 미존재 대조 검사 통과. 실제 DB 원장재계산·21migration·배치heartbeat failures={}·6컨테이너 restart0/OOM false, DB/proxy ID 유지.
- 준비 중 Mac 디스크 부족으로 압축 실패·로컬 Docker 응답 중단 발생: 불완전 압축본/명시한 오래된 생성물·비활성 테스트 캐시만 정리하고 볼륨 초기화 없이 복구, 직접 SSH 스트리밍으로 전환했다. 운영 디스크97%→70%(15GB여유), 현재/직전복구이미지·소스/증거·DB/미디어볼륨 보존. 임시 패키징의 middleware 누락도 최종 rebuild 전 수정·이미지/실행파일 해시로 검증했다.
- 배포 초기에 sudo가 이미지 환경 덮어쓰기를 제거해 migration이 구버전으로 실행됨을 발견했다. bash stdin/compose interactive 소비 문제도 확인해 명시적 sudo env·--interactive=false로21migration이미지를 실행,4개실적용/재시작/원장·배치정상까지 재검사했다. 초기 오류 이력을 삭제하지 않는다. HTTP200만으로 DB완료를 선언하지 않는다. OCI index와runtime ID 차이는 전체RootFS레이어로 확인한다. 로그인 안내는 heading이 아닌 기존텍스트여서 브라우저locator를 수정하고 재검사했다.
- 복구: API/worker post-views-20261025, frontend gallery-close-soft-20261025, admin creator-verification-20261024와 백업설정으로 앱4개만 복구한다. 추가 DB테이블·원장·정책감사이력은 보존한다. down/볼륨삭제/seed/DB reset 금지. 집IP SSH 지속규칙 유지. 커밋/푸시 없음, 누적미커밋보존.
- 증거 front docs/audit/bean-deployment-20261025.json, 원본 server .local/bean-deploy-20261025. 다음은 사용자 실제화면 확인·버그수정이며 실PG 업종승인·법정환급/충전동의·은행연동/실입금·실출금 및 운영 부하/복원 검수는 별도다. 이번 배포검사에서 실제 사용자 충전/후원/프로모션/출금·메일·별도봇테스트 발송은 수행하지 않았다.


## 콩 상품 전체 연결·배포 준비 (2026-10-25, 운영 미배포)

- 팬 지갑/충전·결과/보낸 후원, 프로필·게시물·갤러리의 후원 레이어, 스튜디오 받은 후원·출금/PIN·내역, 독립 관리자 콩 지표·프로모션 지급·원주문 실입금 대사·출금 승인/사유 반려·개인지갑 출처 추적을 연결했다. BeanContext/BeanPages는 preview/service 공유, 기존 목업 URL 유지. 새 카탈로그 /preview/beans와 /preview/studio/beans, 실제 /service/beans 및 /service/studio/beans.
- 원장4+상품8모델/추가 migration2개·123 API(콩19개, Swagger 유저66/스튜디오42/콘솔34·공통 중복)·45화면. 기존 멤버십 원화 매출과 콩 충전/후원/확정 출금수수료를 합산하지 않으며 test/live/promotion을 구분한다. 회사초기1억·일반/프로모션 출처·프로모션 우선·구매잔액/프로모션 출금불가·받은일반콩1000콩 총액10만원부터/출금시20%를 적용했다.
- 회사 지갑 선행 잠금·원장/lot/예약·outbox 원자 저장, 요청키/내용 충돌·자기후원/타인주문·금액 검증, PG 승인 응답 유실/DB 실패 재조회, 신뢰하지 않는 웹훅 재조회 신호, 입금/7일 보류·PIN6자리/5회30초·2분 수량/계좌버전 인증, 은행 불확실 예약 유지·확정 반려 반환, 지급시 콩전량 회사복귀·수수료1회, 출처 취소 동결·미지급 보류·잔액/미완료건 탈퇴 차단을 구현했다. 신규 실제 출금 직전 PG 원결제 재조회 실패도 거부한다.
- 서버 build 및 실제 격리 MySQL/공급사 대역·금융/정기결제/베타/원장/Swagger86개, 프론트 레이어/타입321개, 콘솔 타입5개와 두 프론트의 배포용 빌드 통과. 새 콩4개+가입1개 및 기존 구독/환불/카드복구/유료미디어/베타18개 브라우저 검사 통과. 콘솔 브라우저11개도 통과하여 고유 브라우저 총34개를 확인했다. 캡처는 각 리포 .local/bean-product-20261025/screens에 보관한다.
- 초기 실패와 수정: 공유 AccountPages/BeanPages 순환 import 분리, 회사지갑 선행 잠금으로 동시 지갑생성 충돌 제거, 대역 결제검증 필드/제어 주입 수정, 목업 링크 이동으로 상태 보존, 동결잔액을 제외한 경합 테스트 준비, 관리자 strict locator 범위·nullable/DTO 타입 보완. 오래된 결제 수명주기 검사가 개발 DB의 미적용 열에서 실패하여 해당 테스트도 격리 E2E DB·정책 백업/복원으로 전환했다. 신규7일 환불 snapshot과 과거 계약 보존, 미입금 환불예약·수요일 검사 기대를 현행 계약으로 수정하고 재검사했다. 운영/개발 DB migration·환경 수정·실결제/송금/메일/봇 발송은 하지 않았다.
- feature BEAN_LEDGER_ENABLED/live 판매 BEAN_LIVE_PAYMENTS_APPROVED 기본false, actual 환경 미활성화. beta 은행송금 차단과 테스트콩 실제출금 금지를 유지한다. 실제 PG 충전/후원/환금성 업종 승인·판매약관/충전동의·법정 환급/유효기간·일한도, 은행/계좌검증 bridge·실입금 대사/실송금, 운영 migration/배포·부하/장애복구 검수는 남아 있다. 이 조건 없이 실금융 개방 완료/출시 무결함을 주장하지 않는다.
- 증거: 프론트 docs/audit/bean-product-20261025.json, 의미/근거/배포 순서는 서버 docs/platform-api.md·docs/platform-implementation.md·infra/platform/README.md 및 별도 콘솔 README. 세 리포 feat/bean-support의 기존 누적 미커밋 보존, 커밋/푸시·운영배포 없음. 과거 아래의 상품 미연결/정책 답변대기 기록은 이 로그와 정책 확정 기록으로 대체한다.


## 콩 정책 확정·최소 출금10만원 (2026-10-25)

- 사용자가 권장3안을 수락: 프로모션콩 우선 사용, 프로모션콩 후원 가능/현금출금 불가, 본인 구매콩 출금 불가·후원받은 일반콩만 수익출금. 콩 최소 출금은 수수료 차감 전 신청액100,000원=1,000콩으로 해석·안내했다. 수수료20% 20,000원/실지급80,000원. 기존 멤버십 원화 출금 정책은 이번 콩 정책 변경에 자동 합치지 않는다.
- `server/src/platform/bean-policy.ts`에 정책을 모으고 `beanWithdrawalQuote`가 받은일반콩 계정/최소1,000콩을 검사한다. 999콩 거부,1,000콩/1,001콩 견적, 구매·프로모션·프로모션수익·예약/회사지갑 거부를 검사했다. 일반 가치계산 beanCashQuote는 최소 출금액과 분리한다.
- 상세 설계의 답변대기/최소액 미정 부분을 확정값으로 갱신했다. 상품 충전/후원/은행 API·UI·집계는 여전히 후속 구현이며 운영 배포/DB/외부 금융 변경은 없다. 다음: 확정 정책에 따라 충전주문/재고예약/출처lot→후원/프로모션 우선 소비→출금/은행→공용UI·스튜디오/콘솔·대사 순서. PG/법정환급 조건과 실금융 검증은 별도다.
- 증거: front `docs/audit/bean-policy-confirmed-20261025.json`. 이전 로그의 답변대기는 이 기록으로 해소한다. 기존 미커밋과 feat/bean-support 유지.


## 콩 후원 설계·원장 기반 (2026-10-25, 상품 기능 미연결)

- 사용자 요청:1콩100원·출금시20%·회사초기1억·일반/프로모션 구분·이동/사유이력·가입지갑. 세 리포 feat/bean-support로 기존 누적 미커밋을 보존하고 분기했다. 신규 기능을 dev로 초기화하지 않았다.
- 구형Wallet/Transfer는 신규platform 미연결·Cognito/Decimal 구조여서 신규 BeanWallet/Account/Movement/Entry로 격리했다. 내부 균형원장·멱등키/내용해시·지갑순 잠금/ReadCommitted·잔액부족/동결/발행대조 보호·회사1억 초기이력을 구현했다. 출금 원화20% 정수 견적 함수와 BEAN_LEDGER_ENABLED 기본false의 가입 지갑/5계정 생성을 연결했다.
- 상세 DB·화면·API·매출 중복방지·충전lot/출금예약·실패복구·작업순서/합격조건·공식근거는 server docs/platform-implementation.md의 콩 후원 확장 설계. 팬 지갑/충전/후원레이어, 스튜디오 후원/출금, 독립콘솔 지갑/수불/대사/매출 변경을 계획했다. 실제 화면/충전/후원/출금 API와 집계는 아직 미연결이다.
- **답변 대기:** 프로모션콩 현금화/회사부담, 구매자 자기충전잔액 출금 범위, 사용순서. 권장 묶음을 질문했으며 임의 채택하지 않는다. 후원 취소 UI 미제공과 법정 충전금 환급·오결제·차지백을 분리해야 한다. PG 충전/후원/환금성 계약 및 법적 분류 미확인. 출금 최소액 총액/실지급액 기준 등도 결정 필요.
- 새 migration은 격리 E2E DB만 적용, 운영/개발 DB·환경·배포·외부 발송/결제/지급 없음. 원장 코드에는 공개 API/기존 수익원 연결이 없어 기존 매출을 늘리지 않는다. 검증: 서버 build·Prisma validate, 원장4+OpenAPI11개와 실제 격리API/DB 가입 Chromium1개(지갑1/계정5) 통과. 증거 front docs/audit/bean-support-20261025.json. 다음: 답변 확정 후 충전주문/회사재고예약/출처lot→후원→출금예약/은행→공용UI/콘솔/3Swagger→기존구독회귀 순서.


## 확정 베타 정책 구현·검증 (2026-10-25, 운영 미배포)

- 사용자 선택7.C/10.C/13.B/16.C·나머지A를 구현했다. 베타 빈 초대명단 거부·일반 콘텐츠·테스트 키만 허용·실송금 차단, 신규 미사용7일 환불과 기존 계약 보존,24시간 간격 추가3회 갱신, 테스트→실과금 차단, PG 입금 대사/미확인잔액 제외·최소1만원·수요일 신규 지급(기처리 송금 확인은 매일)을 적용했다. 수수료/보류 원본은 기존 DB version/감사 경로이며 운영 선택값2000bps/7일 적용은 배포 단계에서 수행한다.
- 광고 선택 동의/철회 버전·이력, 최고 관리자 캠페인 대기열, 발송 직전 동의 재검사·경합 잠금, 무료 비로그인 수신거부, 처리결과/2년 확인, SMTP 결과불명·중단 발송 자동 재전송 금지를 구현했다. 필수 인증/거래 안내와 분리하며 광고 실제 발송은 하지 않았다. 목업/실서비스 공용 팬·크리에이터 이용안내2화면과 FAQ, 설정/출금/결제 정책 표시를 연결했다.
- 서버 build 및 정책·17계정 역할·금융·법률·OpenAPI46개, 프론트 레이어/타입·단위321개, 브라우저19개 고유 시나리오 통과. PC/모바일 안내 캡처 확인, 실제 격리 MySQL·SMTP/PG/PASS/은행 대역이다. 초기 Swagger 개수2건·5천원 출금 시나리오·스위치 접근성 이름 기대값을 새 계약에 맞춰 수정했다. 수신거부 HTML POST의 이중응답 오류는 실제 브라우저에서 발견하여 수정하고 서버 지속응답까지 재검사했다. 실패한 E2E의3명/2문서 등 해당 fixture만 추적해 정리했다.
- 새 migration2개는 전용 crefans_platform_e2e에만 적용했다. 개발/운영 DB migration·환경값 변경·배포·실외부발송·커밋/푸시는 없다. 두 리포 feat/beta-signup의 누적 미커밋 변경을 보존했다. 테스트 통과를 실서비스 개방/무결함 보장으로 보고하지 않는다.
- **개방 전 남음:** 초대 이메일·베타 시작일, 실제 탈퇴/항목별 보유·파기, AWS/Google/Telegram 계약·국가·보유기간, 사업자/PG·세무 사실 확인. 법률문서 effectiveAt=null/signupReady=false 유지. 광고 서명키/발송 활성화·실SMTP/DKIM, 실제 PG/은행·수요일 공휴일/마감은 별도 확인한다. 실제17명 동시 사용·운영 부하는 미검증이다.
- 최신 근거는 front `docs/audit/beta-policy-implementation-20261025.json`, 선택표/개방 조건은 front `docs/beta-role-test-plan.md`, 적용 절차는 server `docs/platform-api.md`의 확정 베타 정책 절이다. 문서 계약104 API(유저58/스튜디오37/콘솔28),43화면,19migration·60문서 검증과 잘못된 링크/누락/변경 탐지 대조 검사도 통과했다. 다음은 실제 처리 사실·초대명단 준비와 가입 시행본 확인 후 별도 운영 적용이다.


## 정책 결정 당시 기록 (2026-10-25, 아래 구현 대기는 상단 최신 로그로 대체)

- 사용자 답변: **7.C, 10.C, 13.B, 16.C, 나머지 A**. 초기17계정 초대·일반 콘텐츠·테스트 결제만·2주 베타, 판매자/중개 기본안 검토, 총20%에 PG비용/수수료VAT 포함, 미사용7일 전액환불(법정 권리 별도), 이용후 해지예약/개별환불, 실패후24시간 간격3회 추가, 보류7일·최소1만원·수요일 지급·초기 이체비 플랫폼 부담, 판매중단시 신규/갱신중단·기결제기간 제공, 테스트금융 분리·실과금 새 동의로 기록했다.
- Telegram은 IP/사건 식별자를 유지하되 실제 계약·국외이전 요건 확인, 고객지원 평일10~18시/2영업일 첫답변 목표, 팬/크리에이터 안내 각1페이지+공통FAQ, 광고메일은 베타부터 선택적 사전 동의·수신거부 절차를 갖춰 운영한다. 만19세 이상·약관 코드관리·미사용환불 별도 진입버튼 없음 유지.
- [확정 정책·미구현 항목](../crefans_front/docs/beta-role-test-plan.md)과 [원문 선택·조사 기록](../crefans_front/docs/audit/beta-policy-questionnaire-20261025.json)에16개 답을 보존했다. 환불 API의7일 기한, 정산 DB정책/실입금 대사/주별지급/최소액, 갱신 횟수·기한 경계, 광고 동의/수신거부/발송 제외 등은 후속 구현·검수 대상이다. 현재 제품 동작과 선택을 혼동하지 않는다.
- 조사 당시 운영 signupReady=false·시행일null. 초대 이메일, 시행/시작일, 보유·파기 실처리, AWS/Google/Telegram 실제 국외이전 사실, 신고·공개 사업자 정보 및 PG·세무 조건은 추가 확인한다. 일반 콘텐츠 베타 선택만으로 법률 게이트를 해제하지 않는다. 실청구/실출금 없음.
- 이번 범위는 정책/검수 문서 갱신이다. 질문 답안16개와 사람이 읽는 정책표의 일치 검사를 실행하고 문서 계약·참조·스냅샷을 검사한다. 제품 테스트·운영 설정·외부 발송·배포·커밋/푸시는 수행하지 않는다. 검증 결과는 front `.local/beta-policy-decisions-20261025/verification.json`에 기록한다. 다음: 확정 정책에 맞는 구현·실제 처리/공식 근거 확인 후 약관·개인정보처리방침·안내를 정리하고 검수한다.

## 조회수 표시 계약 운영 반영 (2026-10-25)

- `crefans-api:post-views-20261025`를 API/worker에 반영했다. 기존 creator-verification 운영184소스를 대조해 service.ts DTO의 views/total_view_count 연결과 openapi-contract.ts Post.views 설명2파일만 선별했다. DB migration·증가 로직·권한 정책 변경 없음. 앞선 로컬 조회수 표시 계약의 미배포 상태를 해소했다.
- 선별 소스 build·실제 격리DB/HTTP3+Swagger11 통과. 피드/상세/bootstrap의0·일반·잠긴 글 누적값 및 본문/미디어 차단·읽기 전후DB불변 확인. 운영184소스/이미지 일치, API/worker restart0/OOM 없음, health200. 실제 운영 공개 posts0건으로 실제 행 값 비교는 하지 못했으며 격리DB 증거와 구분한다.
- 프론트 동시 배포/운영12브라우저 검증, DB/admin/proxy·집SSH규칙 보존. 복구 `/opt/crefans-backup-post-views-20261025`, 증거 `crefans_front/docs/audit/post-views-deployment-20261025.json`. 기존 미커밋 보존·커밋/푸시 없음. v1 자동 누적 집계는 여전히 미구현이며 저장된 값 표시 완료로만 보고한다.

## 게시물 조회수 표시 계약 (2026-10-25, 로컬 구현)

- 공통 게시물 DTO와 Swagger Post에 views를 추가해 기존 Posting.total_view_count를 전달한다. bootstrap/피드/상세에서 동일하고0/잠긴 글에도 누적 숫자를 제공한다. 접근 판정·본문/미디어 차단·DB 스키마는 변경하지 않았다.
- build·실제 격리 MySQL/HTTP3개·OpenAPI11개 통과. 읽기 전후 누적값 불변,0/일반/잠긴글 값을 검증했다. 프론트의 공용 아이콘 표시와308단위/브라우저12는 front/docs/audit/post-views-20261025.json. 기존 미커밋 보존, 운영 미배포·커밋/푸시 없음.
- 신규 v1에는 조회 증가 처리가 아직 없다. 이번은 저장된 값의 표시 계약이며 새로운 중복/노출 집계 정책을 구현하지 않았다. 자동 집계 완료로 보고하지 않는다. legacy 비버전 API는 연결하지 않는다.

## 인증 크리에이터 배지 운영 배포 (2026-10-24)

- 사용자 요청으로 `creator-verification-20261024` API·worker·독립 관리자·프론트를 운영 반영했다. 목업 모카·지우·북부대공(시온), 기존 하늘의 닉네임 오른쪽 배지가 프로필·피드·탐색·랜딩 등 공용 UI에 표시된다. 운영 콘솔에서 활성 ADMIN/SUPER_ADMIN이 부여·해제할 수 있으며 PASS와 별개다.
- 직전 운영 front493/server183파일을 대조한 뒤 배지 범위만 선택했다. 프론트12변경/3추가, 서버6변경/1migration추가, 관리자 Console.tsx를 반영했다. 운영에 `20261024120000_creator_verification` 하나만 적용했으며 기본false·NOT NULL 확인. 실제 크리에이터0명이라 계정 부여/해제는 수행하지 않았다. 별도 모바일 댓글 입력바·PASS 보류 가입 작업은 배포에 포함하지 않았다.
- 선택 소스 검사: front299, API/권한·감사·Swagger23, admin5와 격리DB 실제API 관리자 E2E1 통과. 세 amd64 이미지 빌드 및 이미지 브라우저6 통과. 운영 PC/모바일 Chromium·WebKit 브라우저6과 TLS HTTP18 통과. 서비스 화면의 인증/해제 브라우저 검사는 API 대역이며 운영 실계정 검증과 구분한다. 운영 front496/server184소스해시·이미지 일치, DB/proxy ID 유지·교체4서비스 running/restart0/OOM 없음, 집 SSH 지속 규칙 보존.
- 첫 운영 WebKit 검사에서 빠른 페이지 전환의 Next 사전 로딩 취소가 검출되어 로딩 완료 후 이동하도록 검사를 보완하고6개를 재검증했다. 실패 로그/trace를 보존했고 제품 사전 로딩 오류 자체를 수정했다는 주장은 하지 않는다. 검증 스크립트의 compiled 경로 오기와 증거 파일명 충돌도 교정해 재실행했다. PC·모바일 화면 육안 확인.
- 배포 증거: `crefans_front/docs/audit/creator-verification-deployment-20261024.json`, 원본 `crefans_front/.local/creator-verification-deploy-20261024/`. 복구 설정 `/opt/crefans-backup-creator-verification-20261024`. 이전 관리자 standalone에는 원본소스가 없어서 과거감사17파일+이미지로 비교했다는 한계를 기록했다. 커밋·병합·푸시 없음. 아래 배지 구현/목업의 미배포 기록은 이번 배포로 해소됐다. 물리기기·실계정 인증 판정 정책·기타 출시 검수는 별도다.

## 인증 크리에이터 배지 (2026-10-24, 로컬 구현)

- 사용자 결정: 운영자가 직접 부여·해제하며 PASS 본인인증과 분리한다. 생성형 이미지로 파란 체크 배지를 만들고 공통 CreatorName에 적용했다. 목업 하늘·모카·지우 예시와 미인증 비교 예시, 프로필·피드·탐색·멤버십·메시지·댓글·팔로잉/팔로워 및 디자인 카탈로그를 공유한다.
- 서버 Creator.is_verified 기본 false + migration, 활성 ADMIN/SUPER_ADMIN 전용 PUT /api/v1/admin/creators/:id/verification, 수정 필드 허용목록, 트랜잭션/행 잠금/변경 이력과 공개 isVerified 응답을 연결했다. 별도 관리자 콘솔에서 부여/해제 확인, 저장 실패 표시와 재조회. 일반 회원/PASS/광고 상태로 자동 부여되지 않는다.
- 검증 범위: 프론트300검사, API/권한/감사/Swagger23검사, 관리자5검사, 실제 API·격리 DB 관리자 E2E1 및 프론트 PC/모바일 Chromium·WebKit 6개. 화면·긴 이름·미인증·해제·실패/취소·권한 거부·중복 해제 감사 이력 대조. 문서 계약은 API100개(유저56/스튜디오37/콘솔26), migration17개. 증거는 front/docs/audit/creator-verification-20261024.json.
- 로컬 개발 DB와 격리 테스트 DB에 새 migration을 적용했다. 운영 DB/앱 미배포, 커밋·푸시 없음. 기존 모바일 댓글 입력바 등 미커밋 작업 보존. 운영 배포는 migration → API·콘솔·프론트 순서이며 기존 화면 인증 상태는 다음 조회 시 갱신된다. 실제 기기 검수·인증 판정 정책 자체는 검증 범위 밖이다.


## 최신 운영 배포 (2026-10-24) — 홈 검색·카테고리 및 메시지·알림 미확인 표시

- 사용자 배포 요청에 따라 `https://beta.crefans.com`에 `feed-inbox-20261024`를 반영했다. 홈 검색 진입/ChipRow 카테고리 필터·페이지 넘김, 모바일 메시지/알림 제목24px, 빨간 미확인 점/노란 미확인 행, 표시된 수신 메시지의 읽음 처리를 공용 목업·실서비스·스튜디오에 적용했다.
- 운영 기준 소스 front475/server183개 해시를 먼저 대조한 뒤 front11/server4파일만 선택 반영했다. 준비중 PASS 보류 가입·법률 게이트·금융/미디어 설정은 이번 배포 범위에서 제외했다. DB migration/seed는 없으며 프론트·API·worker만 교체했다. DB·관리콘솔·프록시 컨테이너와 집 SSH 규칙은 보존했다. 복구 설정은 `/opt/crefans-backup-feed-inbox-20261024`.
- 선택된 배포 소스로 front23개, server17개(격리DB/HTTP·OpenAPI) 및 두 amd64 이미지 빌드 통과. API 이미지의99개 계약(유저56/스튜디오37/콘솔25)과 모든 런타임 파일 해시 확인. 배포 이미지와 운영에서 각각 목업5환경×2기능, 실제 어댑터 API대역3경우 통과. 별도 운영 실API Chromium390/1280·WebKit390에서 빈 피드·검색 이동·비로그인 안내 확인. 운영10경로200·읽음 API 비로그인401·Swagger3문서 비로그인401, 세 교체 컨테이너 running/restart0 확인.
- 운영 DB의 카테고리/게시물은 비어 있다. 초기 검사는 카테고리 존재를 가정해 실패했고 실제 bootstrap 응답과 맞게 빈 목록 기대값을 수정해 재검증했다. 운영에는 전체 칩만 표시되며 데이터 있는 필터·읽음 성공 동작은 목업/응답 대역/격리DB로 검증했다. 실제 회원 메시지·외부 금융 실행·실기기 검수는 하지 않았다.
- 배포 증거: `../crefans_front/docs/audit/feed-inbox-deployment-20261024.json`, 양쪽 `.local/feed-inbox-deploy-20261024/`의 원본 로그·화면·소스 해시. 아래 구현 시점의 미배포 기록은 이 배포로 해소됐으며 가입 개방의 미결정 사항은 그대로다. 커밋/병합/푸시는 하지 않았다.

## 최신 구현 (2026-10-24) — 홈 피드 카테고리 필터

- GET /api/v1/posts에 선택적 category 쿼리를 추가했다. 홈은 활성 크리에이터의 분야를 먼저 제한한 뒤 기존 공개조건·정렬·20개 커서 조회와 유료본문 접근 판정을 적용한다. 전체/미지정은 기존 전체 피드이고 creatorId 프로필 조회는 category에 영향을 받지 않는다. API 수99개·DB 스키마는 동일하다.
- build 성공, 신규 실제 격리 MySQL/HTTP2개와 OpenAPI11개 검사 통과. 같은 분야22개의20+2 페이징·다른 분야/비활성/미공개/예약 글 제외·비구독 유료본문 비노출·빈 결과/전체/길이 제한·프로필 기존 동작을 확인했다. 테스트 데이터는 해당 UUID만 정리했다.
- front check292개와 브라우저 목업5환경·실제 모델 API 대역2환경 검증. 근거 front `docs/audit/feed-toolbar-20261024.json`, `tests/platform-feed-category.test.cjs`, `docs/platform-api.md`; 실행 로그 `.local/feed-toolbar-20261024/`. **운영 미배포**, 금융/외부 공급사 실행·새 migration 없음. 앞선 미배포 메시지 읽음/가입 변경과 AGENTS 규약 유지.

## 최신 구현 (2026-10-24) — 메시지 읽음 상태

- inbox DTO를 실제 메시지 ID와 수신자 기준 unread로 연결하고 `PUT /api/v1/members/:id/messages/read`를 추가했다. 인증 세션의 수신자·지정 발신자·요청된1~100개 ID만 기존 `DirectMessage.read_at`에 저장하며 DB migration은 없다. 다른 회원/대화/아직 표시되지 않은 새 메시지는 변경하지 않는다. 반복 요청은 최초 시각을 유지한다.
- Swagger 유저56/스튜디오37/관리자25, 전체 합집합99개로 계약을 갱신했다. 서버 build, OpenAPI11개, 실제 격리 MySQL과 HTTP4개 검사 통과. 토큰 검증은 대역이며 누락/잘못된 세션·잘못된 ID·타인 데이터·새 도착·재요청을 검사했다. 생성 테스트 행은 정리했다.
- 근거: `tests/platform-message-read.test.cjs`, `docs/platform-api.md`, front `docs/audit/inbox-unread-20261024.json`. 로그는 `.local/inbox-unread-20261024/`. **로컬 구현·검증이며 운영 미배포**, 외부 발송/실계정 메시지는 없다. 기존 PASS 보류 가입 변경과 그 미해결 조건을 보존하고 AGENTS의 객체별 권한·검증 규약을 따른다.

## 현재 작업 (2026-10-24) — PASS 보류 가입·17계정 베타 검수

- `feat/beta-signup`에서 서버 `SIGNUP_IDENTITY_MODE=pass|email-only`와 선택 이메일 초대 명단을 구현했다. 기본/오타 설정은 PASS 필수. email-only는 이메일 일회용 proof·필수 동의/문서 버전·만19세 이상 확인을 검사하고 identity_hash=null/실명 빈 값으로 가입한다. 임의 본인/성인인증 boolean은 무시하며 민감 콘텐츠·출금 인증은 계속 제한한다. bootstrap 요구사항으로 프론트 PASS UI를 제어하며 Swagger/환경 템플릿도 반영했다.
- 서버 기존 HEAD c100a3a의 배포 관련 누적 변경을 보존하여 작업 브랜치를 생성했다. dev로 초기화하거나 기존 사용자 변경을 폐기하지 않았다. 커밋/병합/푸시/운영 배포/실제 환경 모드 전환은 하지 않았다.
- 검증: 서버 build 성공, 가입·인증·법률 게이트·OpenAPI 23개 통과. 관리자/금융 정책 19개 통과. 실제 격리 DB에 17계정을 생성하는 신규3개 검사에서 0/2/10 구독·12회 승인·20% 원장과 18역할×3크리에이터×8공개조건=432권한 판정, 해지예약/만료/갱신/환불·관리자 guard/원장 대조 통과. 테스트 데이터 정리·원래 테스트 금융 정책 복원 완료. 공급사는 대역이며 실제17명 동시 사용·AWS/CDN 검증이 아니다.
- 프론트 check289개, 브라우저 E2E 기존16개+새 이메일 가입1개 통과. 첫 서버 검사는 로컬 MySQL 정지로 실패하여 기존3307 데이터를 재시작 후 통과했다. 새 E2E의 메일 생성 대기와 cohort 결제 대역의 configForClient 누락을 보완한 재검사 결과도 보존했다.
- **미완료/실제 가입 차단:** 현재 법률문서 signupReady=false(시행일 미정·탈퇴/파기·국외이전·콘텐츠 범위 미완료)는 그대로다. 사용자에게 초대 이메일 한정/일반 이메일 가입 범위를 질문했고 답변 대기 중이다. 가입 모드 구현을 실제 가입 개방으로 보고하지 않는다. 운영 수수료20% 외 정산보류일수 미결정, 실제 PASS/은행·금융 검수도 남는다.
- 상세 모집 계획/97개 상태: front `docs/beta-role-test-plan.md`, `docs/audit/beta-cohort-plan-20261024.json`. 검증 증거 front `docs/audit/beta-signup-20261024.json`, 양쪽 `.local/beta-signup-20261024/`에 명령/결과/최초 실패 보존. 다음은 가입 범위 결정·시행 문서/실제 처리 절차 일치 후 실제 설정과 운영 검증이다.


다른 에이전트가 이 파일만 읽고 이어받을 수 있도록 유지한다. 규약은 `AGENTS.md`.

## 운영 SSH 결정 (2026-10-24)

- 사용자 요청으로 현재 집 공인 IPv4 한 개(/32)의 TCP 22를 AWS `crefans-beta`에서 지속 허용했다. 규칙 `sgr-0042cbcbcd1b74b35`은 임시 배포 규칙이 아니므로 배포 정리 시 삭제하지 않는다. 기존 웹·관리 접속 규칙은 보존했다.
- AWS 규칙 재조회·기존 키/호스트 검증을 사용하는 SSH 접속 성공 확인. 정확한 주소는 server `.local/home-ssh-20261024/verification.json`에 보관한다. 공개 증거: server `docs/home-ssh-access-20261024.json`.
- 크레팬스 규칙 삭제 자동화는 발견되지 않았다. 별개 NHN 엔씨솔루션의 한 달 SSH 종료 일정은 유지했다. 이후 집 IP가 달라지면 그 시점에 새 주소를 확인해야 한다.

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

### 2026-10-21 수수료 정책 관리 구조 조사
- 사용자 질문에 코드만 조사했다. 기준 HEAD c100a3a, 조사 시작 시 작업 트리 clean. rg 및 finance.service.ts/admin.controller.ts/prisma/schema.prisma 대조: 플랫폼 수수료율/정산 보류는 ConfigService의 PLATFORM_FEE_BPS/SETTLEMENT_HOLD_DAYS에서 읽고 최초 결제 snapshot에 저장한다. 갱신은 기존 구독 snapshot을 이어받는다. RevenueEntry에는 계산된 fees/net/gross를 저장한다.
- DB에서 운영 수수료율을 편집하는 정책 테이블·관리 API/화면은 현재 없다. 출금 review는 양의 정수/잔액 검증이며 별도 이체 수수료 정책 계산은 없다. 거래별 수수료 기록과 DB 기반 운영 정책 관리를 구분해 보고한다. 구현/정책값 변경은 요청되지 않아 수행하지 않았다. 읽기 전용 코드 조사이므로 제품 테스트는 재실행하지 않았다. 향후 DB 정책 관리 추가 시 적용 시점/버전/기존 구독 적용 범위를 먼저 결정해야 한다.

### 2026-10-21 수수료율·정산 보류의 DB 관리 구현
- 사용자 요청으로 수수료율/정산 보류 원본을 financial_policies의 platform 행으로 전환했다. 최초 신규 결제 claim transaction에서 DB를 읽어 platformFeeBps/settlementHoldDays/financialPolicyVersion을 snapshot으로 보존한다. 변경 후 신규 가입에는 즉시 적용, 기존 구독 갱신·처리 중 승인 복구는 기존 snapshot 유지. env 키는 미사용이며 DB 미설정 시 신규 결제를 차단한다. 출금 수수료/최소 출금액/재시도 DB 관리는 이번 범위가 아니다.
- GET/PUT /api/v1/admin/financial-policy 및 GET /history 추가. 활성 SUPER_ADMIN만 가능. 정수bps0~10000/보류0~365/version/필수 사유 검사, version 조건부 변경으로 동시 수정409, 변경자·이유·시각 포함 financial_policy_changes 기록을 같은 transaction으로 반영한다. 감사 저장 실패 시 정책도 rollback. 관리자 UI는 추가하지 않았다.
- migration 20261021080000_db_financial_policy는 빈 version0 행만 생성한다. 운영 값은 미정이다. 기존 로컬 test10%/0일은 dev:billing이 최초 미설정 행에만 초기화하고 이후 DB 수정값은 재시작으로 덮어쓰지 않는다. 로컬3307에 적용, API3001/worker를 새 코드로 재시작했다. 실금융·운영 변경은 없음.
- 반복 검사 npm run test:policy(빌드+8 tests). 기존 E2E DB를 named lock으로 단독 사용하고 사전 정책/이력 복원·합성 fixture 삭제. E2E runtime도 같은 lock 사용. 새 임시 DB 생성 시 기존 사용자 권한1044로 실패했고, 새 DB ALL PRIVILEGES 부여는 자동 심사가 거절했다. 권한 변경은 실행하지 않고 기존 E2E DB 사용으로 해결했다. 추가 관리자 승인을 요구하지 않는다.
- 검증: backend build, 정책 HTTP/DB 8 tests 및 기존 금융·빌링·환불/출금 회귀60 tests PASS. 권한 거부/invalid/동시 수정/감사 실패 rollback/환경값 fallback 거부/정책 변경 후 신규 적용·기존 갱신/승인 복구 보존/0%/초기화 미덮어쓰기 포함. 공급사 대역이며 실제 PG 결제/환불은 실행하지 않았다. API/문서 계약 재생성 및 check:docs로 현행화한다.
- 증거: front docs/audit/db-financial-policy-20261021.json. 공식 권한/감사 근거와 예시 JSON은 server docs/provider-contracts.md 및 infra/platform/README.md. 다음: 필요한 경우 관리자 UI 연결, 사업자가 운영 수수료율/보류를 승인해 등록. 원격 공개 push는 앞선 승인 보류를 유지하며 수행하지 않는다.

### 2026-10-21 AWS 초기 배포 계획 조사
- 사용자 요청은 간단한 계획이며 실제 AWS 리소스 생성/과금/배포는 실행하지 않았다. c100a3a + DB 금융 정책 작업 트리 기준 infra/platform/compose.yml·Dockerfile·Caddyfile·README를 대조했다. 현재 구성은 Caddy+frontend+API+worker+MySQL 단일 호스트 및 영속 media/DB volume이며, 신규 미디어는 아직 로컬 저장이다. Docker 이미지 실제 실행/운영 HTTPS 검증은 기존 미실행 상태를 유지한다.
- 권장안: 기존 AWS 리소스 먼저 확인, 국내 초기 이용자 기준 서울 Lightsail Linux IPv4 4GB급 1대로 테스트 배포 시작(용량은 실제 부하 후 확정). MySQL은 초기 비용을 위해 같은 호스트에 격리, 독립 백업과 복원 검증 필수. 도메인/HTTPS 연결 및 staging에서 Toss test/SMTP/권한·해지·미이용 환불·worker 검사 후 상용 전환. 새 미디어 S3 비공개 저장 연동은 추가 개발이며 초기에는 API 권한 확인 경로를 유지한다. CloudFront 서명 전달/캐시와 RDS 분리는 성장 후 별도 단계로 검토한다. 즉시 유료 출시 가능하다는 판단은 하지 않는다(PASS·은행 실연동·운영 PG·정책 등 남음).
- 공식 근거 확인2026-10-21: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html (서울 지원), https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html (Linux 공개IPv4 4GB 기본요금 월24USD, 세금/저장소/백업/추가 트래픽 등 별도), https://aws.amazon.com/lightsail/faq/ (인스턴스/백업), https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html (향후 비공개 origin 및 서명 전달). 서버 기본요금을 전체 영상 서비스 비용으로 해석하지 않는다. 4GB 적합성은 미검증 권장 시작점이다.

### 2026-10-21 배포 계획 EC2 기준으로 조정
- 사용자가 Lightsail 외 일반 클라우드도 가능하다고 조정했다. AWS 일반 구성인 서울 EC2 Linux 1대 + EBS + 비공개 S3를 권장 기준으로 변경한다. 현재 Docker Compose로 프론트/API/worker/MySQL을 같은 호스트에서 테스트 배포하고, 도메인/HTTPS·독립 백업/복원·운영 시나리오 확인 후 상용 전환한다. 사양은 부하 검증 후 확정, 초기 RDS/ALB/NAT Gateway 상시 비용은 피하는 안이다. 신규 S3 업로드 연동 추가 개발과 PASS/은행/운영 PG 미완료 경계는 그대로다. 리소스 생성/과금/배포는 하지 않았다.
- 공식 확인2026-10-21: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/storage_ebs.html (EC2 영속 EBS/백업), https://aws.amazon.com/ec2/pricing/on-demand/ (인스턴스 외 전송/공인IPv4/해당 시 CPU credit 과금). Lightsail 월정액과 EC2 총 비용을 동일시하지 않는다. 이번 변경은 계획/기록뿐이며 제품 테스트 재실행 대상은 아니다.

### 2026-10-21 최소 비용 베타 배포 범위 확정
- 사용자 요구: 저렴하게 크레팬스를 실행하고 나중에 확장할 수 있는 EC2, 베타 동안 백업 구축은 생략 가능. 앞선 백업 필수 선행 계획을 베타 범위에서는 보류한다. 기존 백업을 삭제하거나 AWS 자원을 생성하라는 지시는 아니며 이번에는 계획만 조정한다.
- 시작 권장안: 서울 EC2 t3a.medium(x86_64,2vCPU/4GiB) 온디맨드1대, Ubuntu LTS, EBS gp3 약50GB. frontend/API/worker/MySQL/Caddy를 기존 Docker Compose로 함께 실행, 신규 미디어도 베타는 영속 volume 사용. 별도 RDS/ALB/NAT Gateway/CloudFront/S3 이관/자동 백업은 초기 범위에서 제외한다. HTTPS·DB 외부 접근 차단·기존 유료 콘텐츠 권한 검증은 유지한다. 실제 메모리/CPU/디스크/동시 재생 부하로 사양을 확인하며 전체 용량 적합성을 보장하지 않는다. 장기 예약·Spot은 초기 기본안으로 삼지 않는다.
- 확대: 같은 x86 계열 상위 사양으로 정지/변경/재시작(중단 발생), 이후 필요 시 미디어 S3/CDN·DB 별도 분리. 백업/복구 검증은 상용 전환 전 재검토. 가격은 서울 생성 시점에 인스턴스/EBS/IPv4/전송/해당 시 CPU credit을 합산한다.
- 공식 근거 확인2026-10-21: https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html (t3a.medium2vCPU/4GiB), https://repost.aws/knowledge-center/resize-instance (EBS 기반 호환 인스턴스 사양 변경), https://aws.amazon.com/ec2/pricing/on-demand/ (별도 과금 요소). 이번은 계획 문서 변경이므로 제품 테스트는 재실행하지 않는다.

### 2026-10-21 AWS 계산기 실제 베타 비용 산출
- 사용자가 제공한 https://calculator.aws/#/createCalculator/ec2-enhancement 를 Chrome에서 직접 조작했다. 서울/Shared/Linux/t3a.medium1대/온디맨드100%(730h)/gp3 50GB/스냅샷없음/기본 IOPS·throughput/공인IPv4 1개를 입력했다. 실제 자원 생성·과금·계약은 하지 않았다. 견적 탭을 유지했다.
- UI 단가/합계: EC2 0.0468USD/h ×730=34.164, gp3 0.0912USD/GB·월 ×50=4.56, IPv4 0.005USD/h ×730=3.65. 기본 합계42.374USD(UI42.37). 원화는 실시간 환율이 아닌 1400원 가정, VAT10% 포함65256원. 계산기 EBS는 EC2항목에 포함, IPv4는 VPC항목에 별도 추가했다.
- UI에 인터넷100GB를 넣었을 때 100×0.126=12.60USD가 표시되어 계산기가 무료100GB를 자동 차감하지 않음을 확인했다. 공식 EC2요금의 AWS 서비스/리전 합산 월100GB 무료분을 다른 서비스가 쓰지 않는다고 가정해 별도로 차감한다. 총전송100/300/1000GB에서 VAT포함 원화 약65256/104064/239892원. 사진·영상은 저장량보다 누적 다운로드/시청 바이트가 전송 비용을 좌우한다.
- 공식 확인2026-10-21: https://aws.amazon.com/ec2/pricing/on-demand/ (무료100GB, 추가 비용), https://aws.amazon.com/vpc/pricing/ (IPv4시간0.005USD), https://aws.amazon.com/tax-help/apac-vat-rates/ (한국VAT10%). CPU잉여 크레딧/도메인·DNS/Workspace·PASS·PG·은행 비용은 제외, 계정 실제 무료한도 잔여/리전별 청구/환율은 미확인. 백업/S3/RDS/CDN/ALB/NAT는 베타 범위에서 제외.
- 증거: front docs/audit/ec2-beta-cost-20261021.json(계산/가정/출처/제외) 및 /tmp/crefans-ec2-beta-estimate.png(UI42.37USD). 산술을 재계산해 대조했으며 제품 코드 변경이나 제품 테스트는 없다. 문서 snapshot/check:docs만 갱신한다.

### 2026-10-21 EC2 베타 배포 준비 및 승인 대기
- 사용자 요청 구성: 서울 t3a.medium 1대, gp3 암호화50GiB, IPv4 1개, beta.crefans.com, 같은 호스트의 front/API/worker/MySQL/Caddy. 베타 백업 생략, Toss test 전용·출금/파일삭제 off. 기존 IAM 역할/정책은 변경하지 않는다.
- AWS 계정/기존 VPC·공개 subnet·Canonical Ubuntu24.04 AMI·기존 SSH 키 일치를 읽기 전용 확인했다. 기존 도메인/SG/DB를 덮어쓰지 않고 별도 베타 SG와 DNS를 계획했다. 새 SG 생성 시 자동 승인 심사가 공개80/443 및 관리 PC /32 SSH 범위의 별도 승인 부족으로 거절했다. 명령은 실행되지 않았으며 AWS 인스턴스/EIP/DNS/권한 변경 없음. 구체적 범위·비용·SMTP/Toss test 설정 전달을 묶어 사용자 승인 요청, 우회하지 않음.
- frontend .dockerignore에 .local/세션/결과/중첩.env 제외 보강. backend infra/platform/bootstrap-ubuntu.sh와 compose.beta.yml로 공식 Docker 설치·로그 제한·키 SSH·2GiB swap·메모리 한도와 검증 이미지 태그 지정 준비. 비밀 설정과 이미지 archive는 ignored .local/aws-beta 아래만 보관, AWS 관리자 키 제외. GitHub push/운영 데이터 복제/기본 관리자 생성 없음.
- 로컬 Docker credential helper 지연은 개인 설정을 수정하지 않고 공개 이미지용 빈 auth config+기존 공식 Buildx/Compose plugin으로 해결. front/API linux/amd64 빌드 PASS, front check 레이어/타입/274 tests PASS. 새 격리 Docker MySQL에12 migrations PASS, Caddy 경유HTTP8 checks PASS(health v1 envelope, service3/preview3, 익명 admin401). Chrome hydration 피드/로그인 안내/목업 프로필 확인, 관측 console error0. 이미지 일반 사용자/로컬 비밀 폴더 제외 확인. 테스트 전용 컨테이너/볼륨 정리하며 기존3010/3001/3307과 사용자 DB는 유지한다.
- 근거·소스해시·명령 결과: front docs/audit/aws-beta-preparation-20261021.json. 설치/보안 공식 근거와 절차는 server infra/platform/README.md. EC2 생성·공개DNS/TLS·원격SMTP·PASS/은행/운영금융은 미검증이며 배포 완료가 아니다. 새 DB의 PASS/공개약관/금융정책 미설정 차단을 유지한다.

### 2026-10-21 사용자 승인 후 EC2 베타 배포 실행
- 사용자가 구체적 구성에 "승인"으로 답해 기존 자동 심사 차단이 해소됐다. 동일 AWS 계정849615239502/서울, 승인된 웹80/443 공개·관리PC /32 SSH·기존 키·SMTP/Toss test 비공개 전달 범위로만 실행했다. 새 IAM 권한/역할/키는 만들지 않았다.
- 신규 자원: EC2 i-0c24409aae93555f2, SG sg-0fa9862683387a4df, 암호화 gp3 50GiB vol-0bce242d71aed98bc, EIP15.164.140.26, beta.crefans.com A(TTL60). 기존 apex/메일 DNS/기존 DB/보안 그룹은 변경하지 않았다. 실제 과금 시작됨. Standard credit/IMDSv2 required/hop1/no profile/정확한 ingress 10항목 명세 대조 PASS.
- 공식 Ubuntu24.04 bootstrap 완료, Docker29.9.2/로그 회전/키 SSH/루트 EBS 내2GiB swap. AWS 콘솔의 ED25519 호스트 지문과 SSH 스캔을 대조한 known_hosts만 사용했다. 이미지 원격 SHA256 원본 일치, 환경파일600/디렉터리700 확인. 원격 업로드는 앱 이미지와 승인된 SMTP·Toss test 설정만 포함, AWS 관리자 키·로컬 DB·회원/결제 fixture는 제외.
- Caddy `/`를 `/service/feed`로302 연결해 구형 root 앱 대신 신규 실제 피드로 진입하도록 배포 설정 보완. /preview/* 유지. 새 Docker MySQL 초기화 및 마이그레이션·앱 시작 진행 중. 실행 기록 /tmp/crefans-beta-remote-deploy.log, 리소스 추적 .local/aws-beta/resources.json. 공개 HTTPS/SMTP 연결/브라우저/worker 최종 검증은 이어서 수행하며 아직 완료로 주장하지 않는다.

#### EC2 베타 배포 최종 검증 결과
- https://beta.crefans.com/service/feed 및 /preview/landing 공개 접속 완료. 루트302→신규 피드, HTTP308→HTTPS. 실제 유효 인증서로14 HTTP checks PASS: 서비스4/목업3/루트/환경경로2/health/익명admin401/업로드401/잘못된Origin403. source Caddy와 원격 설정 SHA 일치. five containers running, MySQL healthy, host 공개는 proxy80/443뿐. 실제 DB12 migrations 완료, worker-health tick 완료·failures{}.
- Chrome 실도메인에서 피드 빈 상태/알림·내 프로필 로그인 안내/랜딩 목업 hydration 확인, 관측 error0. 서비스/목업 탭 유지. 새 DB 회원·구독·주문0과 금융정책 version0/null 확인. 정상적인 미설정 차단을 보존했다. SMTP 원격 STARTTLS·인증 PASS이며 메일은 보내지 않았다. Toss test 전용·출금/미디어삭제 off·AWS 키 미전달 확인.
- 최초 /.env,/runtime.env 요청은 구형 포괄 페이지의 HTML200이었다. respond 단독 차단도 Caddy 자동 정렬 때문에 fallback handle 이후가 되어 HTTP 검사가 다시 실패했다. 공식 handle/directive order 확인 후 같은 레벨의 handle matcher로 수정, Caddy validate/reload 및 공개 재검사404 PASS. 초기 실패/수정 증거를 함께 보존하고 검사 기대값을 완화하지 않았다. 원격 셸 heredoc에서는 compose run stdin 소비를 확인해 앱 시작을 별도 명령으로 실행했고, 후속 절차에는 -T --interactive=false 명시.
- 원격 임시 업로드 archive만 제거, 실행 이미지·/opt/crefans 비밀설정·DB/미디어 volume과 로컬 비공개 release는 유지. 디스크 약39GiB 여유. AWS 자원 비용 발생 중이며 backup은 요청대로 없음. 기존 apex/메일DNS/IAM/로컬 실행 서비스는 변경 없음. GitHub push/실금융/실메일 발송 없음.
- 상세 증거 front docs/audit/aws-beta-deployment-20261021.json 및 server infra/platform/README.md. 준비 증거/274 tests/빌드 이력은 aws-beta-preparation-20261021.json을 보존. 코드 변경은 Caddy 루트/민감경로 처리이며 원격 validate/HTTP를 검증, 제품 테스트를 이유 없이 재실행하지 않았다. 문서 계약·snapshot/check:docs 후속 갱신.
- 남은 것: PASS 실연동, 게시할 약관·금융/갱신 정책 확정, 이후 실제 가입/결제/구독 시나리오, 실메일 수신/운영 부하·복구 검증. 빈 DB의 worker tick/SMTP 인증/배포 성공을 상용 출시나 금융 전체 검증 완료로 해석하지 않는다.

### 2026-10-21 AWS 월별 요금 읽기 전용 조사
- 사용자 요청으로 동일 계정의 2026-09 전체 및 2026-10-21까지 월 누적 UnblendedCost/서비스/청구유형/도메인 usage type을 Cost Explorer API로 확인했다. 지난달 확정 집계와 이번 달 estimated를 구분하고 세금 포함 합계·서비스 항목 합산 일치를 Decimal로 검증했다. 청구서 결제 완료/원화 카드 청구액 확인으로 확대하지 않는다.
- 개인 청구 금액·계정 정보·명령/시각/결과 증거는 ignored .local/aws-beta/billing-review-20261021.json(600)에만 보관한다. 공개 문서에 금액을 복제하지 않는다. 도메인 비용과 VPC/DNS 등의 기여를 분리했다. 이번 조회에는 방금 배포한 EC2 비용 그룹이 아직 없어 최종 월 요금과 다르다. 공식 CE 문서의 최소24시간 주기 갱신/집계 지연 근거를 안내한다.
- 읽기 전용 조회만 수행. 결제·청구설정·AWS 리소스 변경 없음. 후속 업무 없음, 이번 달 최종 요금은 월말 이후 다시 확인해야 한다.

### 2026-10-21 PASS 실제 연동 재개 조사
- 사용자 요청으로 기존 IdentityProvider/IdentityController 및 서드파티 연결 안내를 확인했다. 로컬/배포용 설정에서 PASS 공급사 정보 미설정, 공개 beta identity/start signup 요청은503/PASS_NOT_CONFIGURED를 확인했다. 공급사 호출 전 거부하는 경로이며 실제 휴대폰/SMS 인증은 발생하지 않았다. 기존 계약 업체/공식 문서 유무를 사용자에게 질문했고 확인 대기다.
- NICE 공식 휴대폰본인확인 상품(PASS 지원)·사업자 신청·모듈 배포 절차를 재확인했다. 공식 문서의 상품/계약과 실제 암호화/API 명세를 구분하며 비공식 블로그/타 공급사 테스트 키를 가져와 구현하지 않는다. 기존 계약이 없다면 NICE 우선 후보로 신청 준비 항목을 front docs/third-party-setup.md에 정리했다. PortOne도 조사했지만 휴대폰 확인과 통합인증 상품/계약이 다르므로 임의 전환하지 않았다.
- 런타임 코드/배포/환경/가입·성인인증 보호를 변경하지 않았다. 공급사 미선정·공식 명세/키 미확보 상태에서 본인인증을 가짜 성공시키지 않는다. 계약·요금 동의·외부 문의 발송 없음. 다음: 사용자 기존 계약 확인→정확한 공식 명세/테스트 자격정보 확보→전용 브리지 구현→보안 대역/실공급사 인증→베타 반영. 증거 front docs/audit/pass-readiness-20261021.json. 이번은 조사/문서 변경으로 제품 유닛 검사를 불필요하게 재실행하지 않으며 문서 계약/스냅샷 확인을 수행한다.

### 2026-10-21 운영 outbox·사업 이벤트 훅 (분담 작업)
- 담당 범위: `prisma/schema.prisma`에 PlatformOperationalEvent만 append, `prisma/migrations/20261021161000_operational_events/migration.sql`, `src/platform/operations-events.ts`, auth/signup·finance/finalize/cancelSubscription/retryBilling·studio 콘텐츠 작성/수정/삭제/프로필·service 팬 프로필 및 전용 테스트. main/module/jobs/http/worker/operations.service/request-context/security는 다른 담당자 소유로 편집하지 않았다. 현재 브랜치 feat/operations-security, HEAD c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1 + 기존 금융 정책·병렬 운영/보안 미커밋 변경 상태를 보존한다. AGENTS.md는 이미 필요한 규약을 포함해 변경하지 않았다.
- 계약: enqueueOperation(tx:Prisma.TransactionClient,type:string,data:Record<string,unknown>,dedupeKey?:string):Promise<PlatformOperationalEvent>. tx.platformOperationalEvent / platform_operational_events. id(uuid/varchar36),type(varchar64),data(JSON),ip/peer_ip(varchar45 nullable),request_id(varchar36 nullable),dedupe_key(unique varchar191 nullable),created_at/available_at(now),attempts(0),locked_until/delivered_at(nullable),last_error_code(varchar64 nullable). dispatch 인덱스 delivered_at/available_at/locked_until. requestContext에서 ip/peerIp/requestId를 받으며 배치에서는 null.
- 이벤트: member.signup, subscription.started, subscription.renewed, subscription.cancelled, content.created, content.updated, content.deleted, creator.profile.updated, member.profile.updated. 메타데이터 allowlist targetId/memberId/creatorId/subscriptionId/postId/orderId/planId/status/previousStatus; scalar 식별자만 허용, 본문·이메일·임의 객체·개행 거부. 타입명 /^[a-z][a-z0-9_.-]{0,63}$/ 검사. 가입/주문별 dedupe와 실제 auto_renew 변경 시 해지 이벤트, 각 사업 transaction 내부 기록으로 실패 시 rollback. 표시명은 위 타입을 운영 디스패처에 매핑해야 한다. 예약 발행 content.updated 훅은 jobs 담당자의 후속 범위다.
- 검증: macOS zsh/Node v22.7.0, 2026-10-21T14:53~14:55Z. `node --test tests/platform-operations-events.test.cjs` exit0/14 PASS: 실제 127.0.0.1:3307/crefans_platform_e2e에 named lock 후 migration deploy, 합성 fixture 정리. 기본값/문맥/allowlist/잘못된 타입/동시 dedupe/transaction rollback/가입 replay·proof rollback/첫구독·갱신/원장/해지 동시성/팬·크리에이터 프로필/콘텐츠 CRUD 및 outbox 실패 주입 대조 검사. 공급사 호출 없는 DB 검사이며 HTTP/Telegram/운영 검증은 아니다. 이 담당자는 dev DB에 migration을 적용하지 않았다(이후 사용자 담당자가 dev 적용 보고).
- 최초 동시 upsert 테스트는 P2002로 12/13 실패1을 재현했다. MySQL transaction 안에서 unique 충돌만 잡고 SELECT ... FOR UPDATE로 기존 행을 읽도록 보완해 통과했다. 근거 확인2026-10-21: https://docs.prisma.io/docs/orm/v6/reference/prisma-client-reference (concurrent upsert unique error), https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html (locking read). 기존 행의 delivery/attempts/data를 재설정하지 않는다.
- Prisma generate는 일반 .env를 로드하지 않는 임시 schema/cwd와 설치된 generator 절대 경로로 실행(exit0), 두 신규 모델 포함 확인. 최초 임시 경로 generate의 자동 설치 시도는 실패했으며 설치를 우회해 기존 generator를 직접 사용했다. 초기 build는 helper JSON readonly 타입 및 병렬 operations.service 미생성으로 실패, helper 타입 수정·다른 담당자 파일 준비 후 `npm run build` exit0. 이후 사용자 요청으로 빌드 중복 실행을 중단했다.
- 추가 요청: retryBilling은 기존 처리/실패 throw를 보존하고 pending.length+revoked.length+expired.count 반환만 추가. `node --test tests/platform-billing-activity.test.cjs` exit0/3 PASS(소스 TS 직접 로드, DB/공급사 대역): no-work0·등록/해제/만료 합산·실패 뒤 다음 작업/만료 진행과 기존 오류 보존. 이 반환값 추가 이후 전체 재빌드는 사용자 담당자에게 맡겼다. 미해결: 기존 만료 update는 이미 expired인 행도 다시 매칭하므로 정확한 no-work 집계에는 별도 조건 보완 필요; 결제 조건 임의 변경 없이 사용자에게 알렸다.
- 변경 검증: 지정 사업 파일/schema `git diff --check` exit0. finance 소스에서 이 담당자 추가분만 메모리 제거한 SHA256이 사전 a178cd517b6d5d142828a1dacade8c7d6aadc7b0779764d00e5af8de756cf890과 일치하여 기존 미커밋 금융 정책 로직 보존 확인. 최종 helper SHA256 3e435fee5b8a39488318787895b08dd184cdccc783df7775767c900072efd044, finance da6eaa2e7923aa22eb488a86f338c858de81f7e7aa8f783971a10c195e651c4c, migration 0ce6cf718f5ee4497dc90300d3c97e61a070e379cf58eb3b3df6b34bc9aa8701.
- 봇 조사(키 이름만): Crefans .local/platform.env/.local/aws-beta/runtime.env/release/runtime.env에는 TELEGRAM_OPERATIONS_BOT_TOKEN/TELEGRAM_OPERATIONS_CHAT_ID 및 Telegram 관련 키 없음. UBA .env에는 TELEGRAM_ENABLED/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, NC .env에는 TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID가 있으나 Crefans 전용 자격으로 검증하지 않았고 값 출력/재사용/Telegram 호출하지 않았다. 원격 현재 환경 미조회. 전용 자격 매핑과 실채널 검증은 운영 담당 후속이다.
- 외부 메시지·배포·원격/운영 DB·금융 실행 없음. 위 검사는 이 담당자의 범위이며 다른 담당자의 ops/security 테스트 완료를 대신 보증하지 않는다.

### 2026-10-21 API 인젝션 자동 차단·신뢰 IP 요청 컨텍스트 (독립 보안 작업)
- 범위/기준: `/Users/ethan/repository/crefans_server`, `feat/operations-security`, 시작 HEAD `c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1`. 시작부터 PROGRESS/docs/infra/package/schema/금융 관련 dirty 파일이 있었으며 모두 보존. 이 작업은 `src/platform/request-context.ts`, `src/platform/security.service.ts`, `tests/platform-security.test.cjs` 신설, schema의 `PlatformSecurityIp` 블록 및 `prisma/migrations/20261021160000_platform_security_ip/migration.sql` 추가와 본 로그만 작성했다. main/module/Caddy/operations/기존 dirty 파일은 이 작업에서 수정하지 않음. 같은 작업 트리에 다른 에이전트의 동시 변경이 있음. AGENTS.md 기존 규약 유지. 커밋/배포/운영 DB migration/Telegram 발송 없음.
- 시작 합격 조건: 직접 socket 기본값·명시 IP proxy만 단일 `X-Crefans-Client-IP` 신뢰, XFF/CF 위조 무시, 비동기 next 안에서도 ALS/선택적 req.requestContext 일치. 구조화 query의 고신뢰 SQL만 거부하고 desc/ID/q/body/webhook body는 허용. 첫403→10분 안 두 번째 탐지로24시간 API 차단, loopback 자동 차단 제외, DB 다중 인스턴스 잠금/재시작 상태 유지, 만료 후 첫 요청에서 한 번 해제. DB/outbox 실패 시 의심 요청 거부·차단 성공 오보고 금지. 원문 URL/query/body/credentials를 이벤트에 넣지 않음.
- 공개 계약: `requestContext: AsyncLocalStorage<PlatformRequestContext>`; `PlatformRequestContext={ip:string,peerIp:string,requestId:string}`; Express Request에 선택적 `requestContext`. `@Injectable() PlatformSecurityService` 생성자 `(db:PrismaService, config:ConfigService, ops:PlatformOperationsService)` (`./operations.service`), `async middleware(req:Request,res:Response,next:NextFunction)`. 전역 Express 설치 시 호출은 `security.middleware(req,res,next)` 또는 bind로 this 유지 필요. req.ip/XFF에 의존하지 않는다. request ID는 서버 UUID로 생성한다.
- `TRUSTED_PROXY_IPS`: 쉼표 구분 exact IPv4/v6만, 빈 설정은 direct socket. 비어 있지 않은 목록의 CIDR/hostname/wildcard/zone ID/빈 항목 등은 시작 시 값 노출 없이 throw. IPv6 축약·IPv4-mapped 정규화로 동일 DB 키 사용. loopback은 실제 선택된 client IP의127/8와::1만 제외하므로 loopback proxy 경유 원격 공격자는 차단된다. peer 없는 경우 문자열 unknown. Caddy header overwrite/static private proxy IP·main/module 연결은 사용자 소유이며 이 단위 테스트로 운영 프록시를 검증한 것은 아니다.
- 스키마: `PlatformSecurityIp {ip String @id @db.VarChar(45),blocked_until DateTime?,window_start DateTime,count Int @default(0),detected_at DateTime?; @@map("platform_security_ips")}`. AuthRateBucket은 worker의 만료 삭제와 별도 의미라 재사용하지 않음. 일반 정상 요청은 read-only, 의심/차단 상태 요청은 INSERT ON DUPLICATE KEY 후 같은 interactive transaction에서 SELECT FOR UPDATE 및 DB CURRENT_TIMESTAMP(3)로 판단. 이미 차단된 동안 기간 연장/카운트 증가 없음. 해제 때 카운트/탐지 시각 초기화. 정상 요청 DB 조회 실패는503; 의심 요청은403 유지.
- 후속 사용자 검토 반영: 상태 UPDATE와 `tx.platformOperationalEvent.upsert()`를 같은 트랜잭션으로 묶어 outbox 실패면 상태까지 롤백. events `security.injection_detected`(IP별10분에 한 번), `security.ip_blocked`, `security.ip_released`. dedupe key type/IP/판단시각. 데이터는 고정 안전 필드 `{ip,count,blockedUntil,rule,action}`만, 별도 outbox `ip/peer_ip/request_id`는 ALS에서 가져온다. 커밋 뒤 `ops.record(type,data,sameDedupeKey)`는 운영 서비스 동일 키 upsert/로그 계약을 사용. 운영 outbox 스키마/dispatch는 다른 에이전트 소유. release outbox 실패도 해제 상태를 롤백하며503으로 거부한다.
- 탐지 범위: `/api/v1` query의 id/*Id/page/limit/offset/sort/status(숫자형 bracket 배열 포함)만, union select/SQL 지연 함수/stacked SQL/동일 literal boolean 비교를 검사한다. 총 query16KiB/100필드/대상 값2KiB/decode최대3회. 초과는400이며 자동 차단 카운트 없음. 자유 q 및 body는 스캔하지 않음. 이벤트에 route/원문 URL을 넣지 않아 query 경로 누출 없음. 이는 고신뢰 탐지 보조 계층으로 모든 SQL 공격 검출을 보장하지 않으며 기존 parameterized queries를 대체하지 않는다.
- 공식 근거(확인2026-10-21): [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)의 socket peer 신뢰 경계·프록시 헤더 overwrite 필요성을 이 서비스의 전용 헤더/exact allowlist에 적용. [Node AsyncLocalStorage](https://nodejs.org/download/release/v22.15.0/docs/api/async_context.html)의 run(callback) 비동기 전파를 사용(실행 Node22.7). [Prisma v6 transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)와 [MySQL8 locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)에 따라 트랜잭션/동일 IP PK 행 잠금 사용. [OWASP SQL injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)의 parameter binding 우선 원칙 유지. 2회/10분/24시간 및 loopback 예외는 업계에서 자동 확정한 정책이 아니라 이 구현에서 선택한 기본 정책(사용자가 숫자를 직접 지정한 것은 아님).
- 최종 검증2026-10-21 14:55UTC(23:55KST), macOS arm64 Node22.7.0, 격리3307 `crefans_auth_test`. `node --test tests/platform-security.test.cjs`: 기본18 PASS/실DB1 SKIP. `.local/platform.env`에서 DATABASE_URL만 dotenv.parse로 읽고 hostname127.0.0.1/port3307 확인 후 DB명을 crefans_auth_test로 바꾼 URL을 자식 프로세스 `SECURITY_TEST_DATABASE_URL`에 전달해 같은 명령 실행: **19 PASS/0 FAIL/0 SKIP, exit0**. 자격정보는 출력하지 않음. 테스트는 security/outbox 테이블이 없으면 지정 SQL로 생성하고 합성 IP의 상태·outbox 행만 finally 제거한다. 테스트 테이블은 남으며 운영/개발 DB migration 아님.
- 실DB 검사: 독립 PrismaClient2개 동시 공격10요청에서 count2/차단1/탐지1, 새 service 인스턴스 정상 요청403, DB 만료시각 조정 뒤 동시6요청의 해제1/재탐지 새count1, outbox4행(탐지2·차단1·해제1) 확인. 실제 DB 트랜잭션 안 outbox delegate 실패 주입 후 count1/null block/탐지1 유지(rollback) 확인. DB 실패/UPDATE 실패/outbox 실패/Telegram 협력자 실패는 제한된 메모리 대역으로도 검사. Express 실제 loopback HTTP에서 private header IPv6와 XFF 무시 및 await 뒤 ALS 확인. 나머지 spoof/loopback/다중 표기/오탐/encoded3회/한도/만료는 직접 middleware 요청 대역. 운영서비스/Telegram은 계약 대역이며 실제 발송하지 않는다.
- 음성/대조 검사: OR tautology/union/지연/stacked 값은403, desc/일반 ID/q/body는 next; 잘못된 신뢰 목록은 시작 throw; 의도적 DB/outbox 실패 시 차단 성공 이벤트 없음·rollback, reporting 실패 뒤에도 committed outbox 유지. 검사 성공 로그만으로 실운영 프록시·실Telegram·전체 공격 커버리지를 주장하지 않는다.
- `npm run build` 최종 exit0(실제 협업 operations 파일/생성된 PrismaClient 포함), `git diff --check` exit0. 초기 빌드는 작업 중 미생성 operations.service/PrismaClient와 readonly metadata 오류로 exit1이었고 협업 파일 준비 후 해결되어 최종 빌드를 재실행했다. 소유 소스 TS 단독 계약 대역 검사도 통과. Prisma schema validate exit0: 최종 schema 사본을 임시 디렉터리에서 CLI validate, 명시적 dummy local DATABASE_URL로 검증해 일반 .env 자동 로드를 피했고 임시 파일 삭제. 초기 validate는 CLI가 일반 .env를 자동 로드했으나 schema validation만 했고 DB 접속/변경은 없었다. 제품 전체 회귀/실프록시/실운영 적용은 이번 범위에서 미실행.
- 최종 SHA256(14:55:26UTC): request-context.ts `13512a4313574f8cc760477c3d8f9d1740e187665f30ab425167b7820ec72997`; security.service.ts `9a02c966832986613a0ccdfce41314373f2240dd7c457eb96e3d40ab65adf4fa`; tests/platform-security.test.cjs `6b42d430b717a1c1d51ded5623eff5c1f3e570ce39c89db3fa1efdcba048f13f`; security migration.sql `1dfd3a3c4b1fc8147ea840c23772fef342810e6f683c65b66da21d663c4670e6`; PlatformSecurityIp 모델 블록만 `003aeac1627b513eb352f246e073ea7827806090bf7ed958d0c992cb7499c226`(공유 schema 전체는 동시 편집 중). 후속: 사용자 소유 main/module/Caddy 연결 후 전체 middleware 순서/프록시 spoof와 운영 outbox 연동을 확인. 이 작업에서 배포하지 않는다.

## 2026-10-22 크레팬스 운영 알림·주입 방어 구현 및 격리 검증

- `[crefans] operations` 전용 채널, 무작업 worker1시간 요약을 사용자 확정. 서버 feat/operations-security에서 기존 금융정책/베타 배포 미커밋 변경을 보존하고 신규 작업, 프런트는 UI 변경 없이 문서·감사 증거만 갱신한다. 양쪽 기존 feature는dev의후손이어서 현재base를이어새branch로분리했으며reset/stash/기존커밋재작성없음.
- 오류5xx/실행중치명예외·batch, 가입/구독/갱신/해지예약/콘텐츠CRUD/예약공개/팬·크리에이터프로필 이벤트, 안전 metadata와 실제IP, DBoutbox/retry/중복제한, 고신뢰query주입탐지와24시간API차단 구현. 상세는 server docs/platform-implementation.md, infra/platform/README.md. DB14 migrations은 격리3307에만 적용. 베타원격은아직12 migrations/이전이미지.
- build와도메인/금융/인증/권한/HTTP/security/operations **160tests PASS/0skip**. 기존API3001은test PG설정이라미설정기대검사2개실패, 별도API를수동bootstrap한2차검사에서는cache/originmiddleware누락으로2개실패. 최종실제main을임시포트에서키없이실행하여160/160PASS. 기존실행API/프런트/worker설정유지. 전용DB·공급자대역이며실금융/실메일/실Telegram아님.
- 실제Caddy컨테이너+echo upstream에서고정proxyIP/위조전용IP헤더덮어쓰기/CF제거/민감경로404/루트302 PASS. 테스트컨테이너/네트워크 finally정리. APIHTTP에서오류IP·원문에러미노출·탐지/차단/해제큐확인. 실DB잠금·동시성·rollback, 대역429/발송장애/잘못된채널거부/시간요약/치명오류종료대조포함.
- 전용봇토큰/채널ID는기존privateenv3곳에없음. NC·UBA설정재사용없음. 사용자에게BotFather전용봇생성·채널게시권한추가·privateenv토큰입력을요청했다. 새key이름을빈값/주석과함께private설정및runtime.env.example에추가. 전용채널존재는TelegramUI확인했지만봇연결/실수신은미완료. 보안접근을넓히는봇생성/게시권한은사용자진행필요.
- 현재미완료: 전용봇연결→실수신테스트→새MacIP의AWS SSH접속승인/연결→베타migration/이미지/Caddy/네트워크교체와운영검증. 앱초기DB실패/OOM/강제종료는외부가용성모니터필요. 모든SQL난독화/자유본문/정적페이지를막는WAF라는주장금지.
- 증거 docs/audit/operations-security-20261022.json. 문서계약을검토후재생성하며docs:record는snapshot-only임을유지,check:docs와test:docs를별도수행한다. 이전전체프론트E2E를재실행한것으로확대하지않는다.

### 2026-10-22 운영 알림 신규 변경 독립 검토
- 사용자 요청은 read-only 검토·실제 버그만 보고. 제품/설정/테스트 파일은 수정하지 않았고 상위 진행로그 의무에 따라 본 기록만 추가했다. 대상 operations.service.ts/main.ts/http.ts/jobs.service.ts/worker.ts/Caddyfile/compose.yml, HEAD c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1 + 기존 dirty/동시 변경. 160개 통과는 사용자 제공 정보이며 이번 검토에서 전체 재실행하지 않음. 실제 Telegram 자격정보/DB/외부 발송 없음.
- 검증2026-10-21T15:05:11Z(10-22 00:05KST), darwin arm64 Node22.7.0: `docker compose --env-file /dev/null -f infra/platform/compose.yml config --no-interpolate` exit1 `yaml: line 24: did not find expected key`; js-yaml load도 exit1 `duplicated mapping key (35:5)`. api/worker depends_on 안에 잘못 삽입된 logging(35/49)과 named volume logging(76)을 지적. 첫 config 시도 --no-env-resolution은 설치된 Compose에서 미지원 exit1이므로 지원 옵션으로 재확인했다.
- 소스 TS를 ts-node/register/transpile-only로 읽고 in-memory DB/Telegram transport 대역만 사용한 inline node 명령 exit0: 이벤트A sendMessage429/retry_after120 뒤 이벤트B를 +1.2초 flush하면 실제 transport에 두 번째 send가 발생. operations.service.ts69/72의 event별 available_at만으로 같은 bot/channel cooldown이 유지되지 않음(API+worker 모두 timer41). Telegram 공식 FAQ https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this 의 같은 chat초당1회 권장 및 Bot API https://core.telegram.org/bots/api#responseparameters 의 retry_after 확인2026-10-22. 실Telegram rate limit 재현은 아님.
- 같은 inline 검사에서 JobsService.tick의 finance.renew를 정상 no-op 반환 대역으로 실행하면 activity.renewal=1. 실제 finance.service.ts renew의 existing.retry_at>현재시각 경로는 null/no-op이며 jobs.service.ts23의 unconditional return1로 매분 즉시 worker.completed 생성(operations.service.ts81). 이미 expired인 billingRegistration 재집계 문제는 현재 notIn[completed,expired]로 수정된 것을 확인해 지적에서 제외. 민감정보/ALS/다른 시간집계 관련 별도 확정 버그는 보고하지 않음.
- 검토 스냅샷 SHA256: operations.service.ts 62ce0d943cb56aa6e2347fbdba4b9b2ae9bc805d25c9209dc788791480faf4af; main.ts 79e1136b53a6d65de98ea85dc26459d25b27ee800a393ffd160dd880fc463aed; http.ts bef82c3bbf6e7bb07d322be84de6945eb57c667e29f6b919867e1d7a07dce302; jobs.service.ts d5866740e7204a1554494726dfa571deca3388d8a4f391ede4ba0937fd22db31; worker.ts dbccbeebd3eca3c9736ba4f2dc11eed87d378288d558657da38ab528c3f4c62b; Caddyfile 24d08272f560f113a9c291e09bdf28dd299f1e7d4379bdbc3fb9d97f4fd72d7f; compose.yml 1355d338e53fea394fd9e5985e11250c7c9c871dc771ca8fcc59348d995afe9c. 다음 조치는 사용자 담당 수정이며 이 검토에서 구현/배포하지 않았다.
- 2026-10-22 독립 검토 최종 재확인(2026-10-21T15:06:14Z): 사용자 수정 후 현재 compose.yml을 다시 읽고 js-yaml 파싱·api/worker service_healthy·named volume 검사 exit0. SHA256 e4c16d8ce44907bdddb74c5c20fdd0365c20474eae997397d3d485fab9b412bc. 이전 Compose 지적은 해결되어 최종 발견 목록에서 철회. merged docker compose config exit0/160 tests PASS는 사용자 제공 결과이며 이번에 전체를 다시 실행한 것은 아님. 현재 fatal handler는 event.id 지정 flush를 사용하며 테스트 CLI도 소유 합성 행 범위라는 사용자 설명과 구분해 새 결함으로 보고하지 않는다. operations.service.ts(62ce0d943cb56aa6e2347fbdba4b9b2ae9bc805d25c9209dc788791480faf4af)69/72의 채널 공유 cooldown 부재와 jobs.service.ts(d5866740e7204a1554494726dfa571deca3388d8a4f391ede4ba0937fd22db31)23의 no-op 갱신 활동 과집계만 최신 소스에서도 남아 있음을 확인. 제품 코드 수정/실Telegram/배포 없음.

- 검토 후 보완(2026-10-22): Telegram429 대기는 개별 큐 항목뿐 아니라 API/worker 공용 PlatformJob gate에 반영하여 다른 이벤트가 제한을 우회하지 않도록 했다. 재시도 미래시각은 실제 응답 시각 기준이며 fatal/연결확인 CLI는 해당 이벤트ID만 선택한다. 연기된 retry_at 갱신은 처리건수0으로 반환하여 매분 잘못된 완료알림을 만들지 않는다. 실제 갱신 자동종료도 구독해제 이벤트에 포함. 새 대조검사·최종 재검증 결과는 감사 증거를 따른다.

- 최종 소스 검증 확정: 2026-10-22 00:09~00:10 KST 실제 Nest build exit0, 도메인/금융/권한/HTTP/운영알림/실DB 보안 **162 PASS/0 FAIL/0 SKIP**. 내부 배치 오류는 job/errorType/안전한 내부 errorCode를 즉시 기록하고 원문 메시지는 제외한다. 전체 시나리오의 실공급사 결제·Telegram실수신·프런트E2E를 수행했다고 주장하지 않는다. 최신 audit/operations-security-20261022.json이 소스SHA/명령/시각/종료코드와 미검증 경계를 보존한다.
- Prisma migrate CLI는 사전검사한 로컬3307/dev DATABASE_URL을 명시 전달하여 새2개 migration을 적용했으며 로그에 일반.env 자동로드가 표시되었다. 이후 새 런타임/테스트는 일반.env를 로드하지 않는다. 명시 환경변수 우선으로 실제대상은 로컬dev DB였고 운영DB 접속/수정은 없었다. schema validate는 임시사본+명시dummyURL로검증했다.

## 2026-10-22 운영 알림·API 주입 방어 베타 배포 완료

- 사용자 명시 배포 지시로 beta.crefans.com에 API/worker `crefans-api:operations-20261022` 반영. image sha256:48763dc75668cf5c92dced009bcc6b85ab986885475ee22279d610e00abee0be. 프런트 기존 beta-20261021 유지, `/preview` 링크 유지. 로컬162검증 대상의 operations/security/jobs/Prisma 원문 SHA와 실제 컨테이너 일치 확인. 신규2개 migration 포함 실제DB14개 완료, API/worker/DB/frontend/Caddy5개 running.
- 공개HTTPS14검사PASS(서비스/목업/루트/TLS/민감파일404/401·Origin403/no-store), 실제 외부접속원 보안6검사PASS: 전달IP헤더 위조 무시·실제IP/고정proxy172.30.90.2 기록, 첫SQL403→두번째 API차단→정상health403→본인테스트차단만만료처리→해제기록/health200, PASS 미설정503 오류의 IP/outbox 보존. 실가입/실금융/실메일 없음. 실제회원/구독/주문0, 출금·미디어삭제 false 유지.
- worker 매분 실행·worker-run3건/worker-health failures{} 확인. 무작업1시간요약은 로컬 시계검사 통과이고 운영에서1시간 실제 경과 수신검사는 아직 아님. 전용 Telegram token/chatID는 원격에도빈값이므로 이벤트4건은큐에유지. Telegram 실발송/수신 완료라고 주장하지 않는다. 전용봇 생성/채널게시권한/비공개값 입력 후 실제 수신검증이 남았다.
- 실제배포 중 두문제 발견·복구: Docker --env-file이 Compose dotenv 따옴표를 그대로넘겨 사전DB URL검사실패(마이그레이션전/기존앱유지), Compose run --rm --no-deps -T --interactive=false의정식env파싱으로수정. 이어고정proxy .2와동적IP 충돌로자동롤백, 기존설정·이미지·네트워크재기동확인후 dynamic ip_range172.30.90.128/25 분리. 실제Docker회귀검사에서API를자동주소할당한뒤Caddy .2 기동/헤더검증PASS, 최종운영네트워크도동일범위. 초기 readiness502는기대한envelope200까지제한재시도. 실패로그는비밀값제거후Git밖에보관.
- 데이터/미디어/인증서 named volume3개 보존. 사용자 베타정책에따라DB백업을새로구성하지않았으며 설정·이전이미지 롤백자료는 원격 /opt/crefans-backup-operations-20261022 (0700). DB 역migration 없음. 배포스크립트는 `.local/aws-beta/operations-release/deploy.sh`, 원격이미지archive는로드·SHA대조후제거. 기록된이전태그/설정으로복구가능하나추가형schema14개는유지한다.
- 관리PC IP 변경으로 기존 /32가맞지않아 배포전용 현재IP TCP22 /32 임시규칙만CLI추가. 검증후해당규칙ID만삭제했고원래3 ingress권한복원확인. 80/443 기존공개와DB/API/Next 비공개유지, IAM/DNS/기존규칙수정없음. 이후SSH는다시허용된관리IP에서만가능하다.
- Chrome 실제 /service/feed 재접속과 /preview/creator/haneul 목업 내용확인, 피드화면증거저장. 배포·구성·실동작증거 front docs/audit/operations-deployment-20261022.json. 실제클라이언트IP·민감설정은공개증거에복제하지않고ignored private자료에만보관한다. 공식Docker ipam의 ip_range 정의확인2026-10-22: https://docs.docker.com/reference/compose-file/networks/#ipam.
- 다음: 전용봇연결/실수신·실제1시간요약/초기DB실패·OOM 외부감시 구성. PASS/은행/운영금융정책·상용가입/결제검증은별도미완료. 이번배포를상용출시완료로해석하지않는다. 애플리케이션소스변경없고배포네트워크설정과관련실Docker회귀검사만수정했으므로162금융/도메인검사를불필요하게재실행하지않았다.

## 2026-10-22 운영자 콘솔 존재 여부 조사·최소 구성 제안

- 사용자 질문에 코드 읽기 전용 조사. 신규 crefans_front app/components/features/lib/types에서 admin 화면/호출 미발견, 기존crefans_admin별도프로젝트의dashboard/users/posts/media/board/reports/login은존재. 해당프로젝트는비버전/admin/auth·/admin계약이고서버src/admin/admin-auth.controller.ts는Cognito인증. 신규플랫폼자체인증/api/v1과그대로호환되지않는다. 레거시관리자실행/별도외부호스팅가용성은조회하지않았다.
- 신규 PlatformAdminController에는11개endpoints(금융정책조회/수정/이력, 문의목록/답변, 신고목록/처리, 문서목록/저장, 카테고리설정,광고노출설정). PlatformAuthGuard+활성Admin권한, 금융정책최고관리자제한. 현재베타Compose에는관리자전용컨테이너없고신규프런트관리화면없음. URL의HTML200만으로화면존재를판정하지않는다.
- 제안(아직구현지시/정책확정아님): 운영현황, 회원·크리에이터, 콘텐츠·신고, 결제·정산조회, 고객지원, 운영설정 6메뉴의작은콘솔. 기존신규API/공유폼·표재사용. 초기에는임의환불/송금/일괄강제삭제기능을추가하지않고현상조회·신고숨김·문의답변·문서게시·이미DB화한수수료/보류기간에집중. 회원상태/게시물숨김/관리자결제조회/운영기록API는추가필요.
- 관리자권한은서버검증/최소권한, 변경과보안기록은민감값제외감사기록을기본설계요건으로제안. OWASP Authorization/Logging Cheat Sheet 공식문서확인2026-10-22. 이번은구현/권한부여/배포/금융실행없음, 제품테스트불필요. 근거파일·HEAD·SHA·검색범위는front docs/audit/admin-console-inventory-20261022.json. 다음은사용자구체구현지시후범위확정·화면/API보완.

## 2026-10-22 독립 운영 콘솔·매출 조회 구현

- 사용자 지시: 매출 조회 포함, 프론트 프로젝트에 넣지 않고 소스·리포 분리. 별도 crefans_admin(feat/operator-console) 신규 /console 런타임을 구현, 서비스프론트 app/components/features/lib/types diff 없음. 기존레거시관리자URL은새콘솔로redirect, Cognito/비버전API/AuthProvider 런타임제거(미사용파일참고보존). 클라이언트토큰저장/기본계정 없음.
- 메뉴6개: 운영현황, 회원·크리에이터조회, 콘텐츠메타/신고처리, 매출·정산조회, 문의답변/공지FAQ, 금융정책/약관. 매출은KST최대366일/승인일원장/환불원기간귀속/전체·일별·크리에이터20명페이지. 수수료비용차감전·테스트결제포함가능·현금흐름/회계매출/순이익/PG대사아님을표시. 결제내역생성일/출금전체기준명시. 실패/미승인제외,민감PG/회원필드select제외,동일RepeatableRead스냅샷.
- 신규7개 /api/v1/admin 조회API: me/overview/members/posts/revenue/payments/withdrawals. 활성Admin서버guard유지, 금융조회ADMIN/SUPER_ADMIN, 정책SUPER_ADMIN. 문의/문서/신고변경은관리자·대상ID outbox와원자저장, 원문미포함. 신고PENDING경합201/409, 자동숨김아님. 기존금융정책버전/사유/감사유지. local3002 Origin기본값추가, 운영명시목록은수동설정필요.
- **초기버전제외**: 회원강제정지/콘텐츠숨김복구·관리자보호미디어상세/환불·송금버튼/PG테스트운영분리/발생일기준환불현금흐름. 운영콘솔전체완성/출시가능을주장하지않는다. 다음은운영배포·실관리자계정지정과필요시강제조치권한/감사설계.
- 검증: 서버Nest build exit0, 격리MySQL 관리자8+기존금융정책8=16 PASS, 콘솔타입+단위3 PASS, real-main/실DB Chromium E2E4 PASS(실로그인/조회/답변저장/신고/잘못된Origin403/API503대조/모바일). production build exit0. 초기E2E alert locator2건실패는Next announcer중복선택으로수정후전체4재검증. 이전162검사를이번에다시돌렸다고확대하지않는다.
- 관리자기존Next14.2.32취약점조사후15.5.28 + PostCSS8.5.31 동일메이저override. 공급사보안릴리스/OWASP/Toss공식문서확인. 최종 npm audit --omit=dev 취약점0/exit0, 개발도구포함moderate2/high8/critical0(미해결10건). 강제메이저일괄업데이트없음. 빌드/E2E재실행으로override호환확인.
- 로컬기존billing-test API/worker를동일설정으로재시작해새관리자API반영(운영DB아님), 콘솔loopback3002기동. /login200·익명/admin/me401·서비스3010/feed200. 기본관리자생성/권한부여/운영배포/실결제·외부발송없음. E2E3013/3003/.next-e2e와운영개발DB/3010/3002캐시격리,합성데이터정리.
- 증거: /Users/ethan/repository/crefans_admin/docs/verification-20261022.json에HEAD/dirty/소스SHA/명령/시각/exit/대조검사/미실행범위. docs/screenshots에합성매출PC/모바일화면. 과거admin-console-inventory는구현전시점기록으로유지하며현재상태는본로그와새증거가우선한다.

## 2026-10-22 독립 관리자 운영 배포·Telegram 실연결 완료

- 사용자 명시 요청으로 https://admin.crefans.com/console 배포. 동일EC2에별도crefans_admin소스/이미지/standalone·비루트·readonly컨테이너384MiB를추가. ADMIN_IMAGE=crefans-admin:console-20261022, API/worker=crefans-api:admin-20261022, 서비스프론트beta-20261021/목업유지. Caddy는관리자admin/auth3종만직접API전달하고다른API404,실제IP헤더덮어쓰기유지. 정확한admin Origin추가,host-onlySecure쿠키확인. 새EC2/IAM/DB백업없고apex/메일DNS변경없음.
- 요청 이메일은 기존 사용자 이메일의 한영전환 입력으로 해석. 운영DB미존재를확인후운영자1명만명시bootstrap(SUPER_ADMIN활성). 기존회원있으면덮어쓰기거부,비밀번호는salted scrypt해시로만전달저장·로그미출력. email_verified는수동운영자확인이지SMTP챌린지/PASS성공이아님. Chrome실로그인·운영매출0조회PASS,실제회원1/주문0. 금융정책값을임의설정하지않음.
- 별도실행승인후공식BotFather에서crefans_operations_bot(CREFANS Operations)생성, [crefans] operations에게시만허용. 정보변경·메시지수정삭제·스토리·초대·관리자추가·차단·방송권한해제,getMe/getChatMember검증. 토큰/채널ID는.local/platform.env600및운영runtime.env600비공개저장. 로컬과beta각자기합성이벤트발송후Telegram앱의동일ID/action실수신확인(접수만으로완료주장안함). 운영미발송0. 실제1시간요약경과수신은아직아님.
- 검증: amd64 Nest/Next Dockerbuild exit0,readonly standalone로그인200/정적asset7개200,공개정상TLS검사12 PASS(관리자로그인·매출셸/익명401/민감파일404/타API404/악성Origin403/기존beta서비스·목업·health200). 관리컴파일JS2개원격SHA로컬일치,6컨테이너running. DB/미디어/Caddy볼륨보존,14migration기존상태조회만·seed/reset/추가migration없음. 임시현재IP/32 TCP22규칙은완료후해당ID삭제,원래3ingress복원. 원격임시암호해시/봇전달JSON/이미지archive제거,실행설정/이미지보존. 롤백 /opt/crefans-backup-admin-20261022(700).
- 초기실패: Docker타입검사참조lib/utils COPY누락2회보완후build성공,bot가입update미수신은승인된채널연결메시지로chat확인, Caddy재기동/TLS발급중일시연결오류는제한재시도후정상공인TLS로재검증(보안경고우회없음). 이전162전체테스트를다시돌렸다고확대하지않는다. 상세HEAD/dirty/sourceSHA/image/명령결과/미검증경계는crefans_admin/docs/deployment-20261022.json. 실운영매출화면docs/screenshots/admin-live-revenue.png,로컬합성알림수신telegram-connected.png. 민감값/실제접속IP는공개증거에포함하지않음.
- 다음: 필요시회원정지/콘텐츠숨김·보호미디어관리, PASS/은행/실PG·실가입,실1시간요약수신,외부장애감시. 운영콘솔/Telegram접속완료를상용출시완료로단정하지않는다.

## 2026-10-22 UBA Console UI 운영 반영 완료

- 관리자 이미지 crefans-admin:uba-ui-20261022(amd64, sha256:4134d32623c844265d1ae8e7657bfa7d25d90ce68ffa7a9720684e2ae74165f2) 배포. 로컬/원격 archive SHA-256 일치, readonly·비루트 standalone smoke 및 브랜드/폰트/라이선스 자산200. 위 진행 로그의 빌드/배포 대기 상태는 본 완료 기록으로 갱신한다.
- 타입+단위3, real-main/격리MySQL E2E6, production Docker build PASS. 운영 HTTPS 공개검사14 PASS(익명401·비허용Origin403 대조 포함), 로그인된 Chrome에서 새 그룹메뉴/매출화면/사이드바접기·펼치기 확인. 화면 docs/screenshots/uba-console-live.png. 운영 0원은 실제 조회이며 가짜 매출을 넣지 않았다.
- admin만 --no-deps --no-build로 교체하고 API/worker/DB/frontend/proxy 컨테이너ID 모두 보존. migration/회원/금융정책 변경 없음. 시작 직후 일시502는 제한 readiness 재시도 후 정상화, 최종14개 공개검사 통과. 임시SSH 규칙 삭제·기존3 ingress 복원, 원격업로드 archive 삭제. 롤백 /opt/crefans-backup-admin-uba-20261022.
- 증거: crefans_admin/docs/uba-ui-deployment-20261022.json. 이전 서버16건/보안전체검사를 이번 UI변경에서 다시 실행했다고 확대하지 않는다. 실PG대사/기존 미구현 강제운영조치 범위는 유지.

## 2026-10-22 콘솔 모바일 메뉴 회귀 검증 지원

- 별도 관리자 공통 layout에 메뉴를 유지해 스크롤 초기화 수정. 백엔드 제품 런타임은 변경하지 않았다. tests/admin-console-server.cjs의 합성 관리자 이메일은 실행별 ADMIN_E2E_EMAIL(.invalid)로 격리, 반복 실행 시 동일 이메일의 10분 로그인 제한 누적 방지. 기존 rate limit은 그대로이고 운영 DB/메일 발송은 사용하지 않는다.
- 관리자 real-main/격리DB E2E7·단위3/타입 검사 통과. 최종 관리자 배포·공개 체크·임시SSH 회수와 source SHA 근거는 crefans_admin/docs/mobile-nav-20261022.json 및 관리자 PROGRESS 후속 기록 참조.

- 2026-10-22 관리자 이용약관 편집 제거 배포 완료: crefans-admin:no-terms-20261022, sha256:44a056da5e011906ebb89c57f5b0698a14cd35a12a229d4dc8360f8bb448b909. 타입/단위3·주요경로E2E1·Dockerbuild·운영TLS14 PASS. Chrome운영설정에서 개인정보·운영정책 두종류만확인, 이용약관없음. 서비스약관/API/DB삭제없음. 관리자만교체·다른5컨테이너ID유지. 원격archive제거·임시SSH삭제·기존3ingress복원,롤백 /opt/crefans-backup-admin-terms-20261022. 근거 crefans_admin/docs/no-terms-20261022.json.

## 2026-10-22 구독 대시보드 구현·검증

- 신규 /api/v1/admin/dashboard를 별도 운영 콘솔 /console에 연결. 신규 구독·갱신 포함 결제 건수·총 구독 결제액·환불 차감액과 전일 증감, 7/30/90일 두 그래프·일별 표. 날짜는 KST, 오늘은 전일 같은 시각까지, 과거일은 하루 전체. 전일0 비율 미표시. 현재 잔여 구독은 별도 현재 스냅샷이며 해지예약 포함. 운영 현황 카운터 유지, 이용약관 편집은 계속 제외.
- 구독별 최초 승인 식별, 원장 현재 환불은 원승인일 귀속, 실패/미승인 제외·누락일0, 금액 safe integer·서버 financial role guard·동일 RepeatableRead. 실제 PG대사·회계매출·MRR·고유 구독자 수로 해석하지 않는다. 테스트 결제 환경 분리 미구현은 유지.
- 검증 합격: Nest build, 관리자 타입+단위3, 격리MySQL/HTTP11 (권한·한국시간 경계·갱신/환불·잘못된 입력·빈기간·현재유효/해지예약/만료/미래구독), real-main Chromium E2E8 (DB숫자·전일0·그래프·기간변경·모바일·API503대조·기존관리기능). 초기 TS Map추론오류1건을 명시타입으로 수정 후 통과. 합성 데이터 정리, 실결제/실외부발송 없음. PC/390px/다크화면 확인. 새DB스키마/마이그레이션 없음.
- 공식 근거 확인2026-10-22: Toss API/거래 정의, Stripe active subscribers의 고객/구독 단위 차이. 집계 정의와 출처는 서버 docs/platform-api.md, 관리자 README에 기록. 진행 중인 운영배포 결과는 후속 기록과 admin docs/dashboard-20261022.json 참조.

- 운영 반영 완료: admin/API/worker dashboard-20261022. 관리자 image ed547f75e0918c59536d5b960dad76e0f4759fd075fb027c02d47f696fef2f90, API image22c788335cc8a21e3c14c84c48fda7f14f33659f409fe5c9a31902a8dbd27fdf. 로컬/원격 archive SHA 및 테스트된 backend JS 일치. database/frontend/proxy 컨테이너ID 유지, schema/migration/회원/결제/정책 변경 없음. 초기 readiness502 두 번 뒤 제한 재시도 성공, 최종 TLS 공개16 검사PASS. 원격 archive 제거·임시 SSH 회수·기존3 ingress복원. 롤백 /opt/crefans-backup-dashboard-20261022.
- Chrome 실운영 로그인 상태에서 당일 같은시각·과거일 전체비교/7일선택/그래프4선/390px 가로넘침0 확인. 날짜 fill 자동화가 React 상태에 반영되지 않아 실제 달력 키보드 선택으로 검증했다. 제품 날짜입력은 격리Chromium E2E 및 운영 native 달력에서 정상. 뷰포트 원복, 운영 데이터는 실제0건/0원이며 채워진 매출·환불·갱신은 격리DB검증. 실PG금융·대사를 실행했다고 확대하지 않는다.
- 검증증거 crefans_admin/docs/dashboard-20261022.json, PC/모바일운영 및 합성데이터화면 docs/screenshots/dashboard*.png. front check:docs 56문서/92라우트 PASS는 계약·snapshot검증이며 runtime테스트와 구분. 기존 PASS/은행/정책확정/미구현 강제운영조치 등 출시 잔여 범위 유지.

## 2026-10-22 사고 추적용 로그 현황 조사 (구현 전 보고)

- 사용자 요청은 현재 기록 현황을 먼저 보고. 제품/운영설정 변경·실발송·SSH접근 추가 없이 신규 platform/admin/infra/Prisma/공유인증 소스 읽기조사. 최근 배포 dashboard-20261022 API이미지의 주요소스7개SHA가현재파일과일치함을network-none Docker실행+hashlib비교 exit0로확인. 운영DB/원시로그를이번에전수조회한것은아님. 이전테스트를재실행했다고주장하지않는다.
- 존재: 5xx/배치/치명오류·보안탐지/차단/해제·회원가입/구독/갱신/해지/콘텐츠/프로필·관리자문의답변/신고처리/문서저장 DB outbox. IP/peer/request_id/시각/종류/허용ID,전송재시도·최종코드보존. 매분배치개별실행+실처리/실패즉시·무작업1시간요약. 금융정책별도version/변경자/사유/값/시각이력,주문상태/원장은존재.
- 주요부족: 콘솔통합로그조회API/UI 없음(미발송수·배치마지막시각·정책이력·결제상태만). Caddy access log 미설정/API전요청완료로그없음. 일반오류stack/코드위치/release/인증된actor 없음,request_id는내부저장하나응답/Telegram연결없음. 로그인성공·실패/로그아웃/권한거부/관리자조회감사부족,문서/프로필before-after 없음. 금융시도별불변이력/PG상세안전원인보존부족;SMTP메시지ID/접수결과저장없음.
- 보관: 전송완료 운영이벤트(관리자행위포함)·worker-run30일정리,미발송유지. Docker서비스별10m×3용량순환으로기간보장아님. 외부중앙수집/불변보관·장애독립감시미구성. 애플리케이션/DB동일호스트이므로호스트장애시증거손실위험. 로그보존기간법적요구/금융기록TTL은이번에정책확정하지않음.
- 권장 다음순서(아직구현지시없음): 안전한요청/오류상관관계와금융/관리자감사누락보완→알림큐와감사보존분리/외부수집→콘솔검색/필터/상세타임라인. OWASP Logging,Docker json-file,Caddy log 공식문서확인2026-10-22. 상세25개파일SHA/범위/미검증/출처: crefans_admin/docs/logging-inventory-20261022.json. 사용자보고후추가구현지시를따른다.

## 2026-10-22 관리자 정책 문서 섹션 제거 지원

- 사용자 정정으로 독립관리자 운영설정의 개인정보·운영정책 섹션 전체를 제거. 정책 문서는 서비스 코드에서 직접 관리하는 방향으로 관리자 AGENTS에 기록. 금융정책/이력과 고객지원 공지·FAQ는 유지. 백엔드 런타임/공개문서/API/DB 변경 없음. 단순 관리자 UI 변경이므로 관리자 타입+단위3·주요경로E2E1 검사만 실행하며 기존백엔드전체검증을재실행했다고주장하지않는다. 운영 admin이미지 교체 후 결과는 관리자 docs/no-policy-20261022.json 및PROGRESS 참고.


## 2026-10-22 사고 추적 로그 구현 및 로컬 검증

- 요구 합격 조건: 구현 전 logging-inventory의 가능한 공백을 코드로 보완하고, DB/HTTP/금융/SMTP/브라우저/Caddy의 성공·실패·권한·마스킹·동시성을 실제 검사한다. 목업 유지, 운영 콘솔 분리. 기존 미커밋 작업은 보존했다.
- 독립 platform_audit_logs migration, 요청 UUID/IP/actor/role/배포버전/상태/소요시간, 안전한 오류 코드위치·fingerprint, 인증/권한·관리자조회/변경·사업이벤트, 공급사 시도/결과·환불/출금 상태·SMTP 접수, 배치 jobId/worker 지연감시, 비신뢰 브라우저 보고를 구현. business 감사 실패는 트랜잭션 롤백; 외부 금융 관찰 로그 실패는 승인 성공을 재시도로 바꾸지 않음.
- 활성 ADMIN/SUPER_ADMIN만 접근 가능한 로그 목록/상세 API와 독립 콘솔 필터/타임라인 연결. requestId 응답 헤더/Telegram/서비스5xx 안내 연결. Caddy 정상/502 로그의 URI·query·헤더 제거. CloudWatch 선택 override·최소 IAM 예시·외부호스트 monitor/systemd·private JSONL export를 준비했고 연결/설치는 미적용. 보관 기본 request7일/audit자동삭제보류0은 법정 정책 확정이 아님.
- 검증: test:audit 55통과/선택MySQL1skip, 별도 격리 MySQL 보안19통과(skip항목 포함), 금융·인증·메일·관리API 회귀137통과, Caddy 실컨테이너 필터/502/요청ID 통과. 프론트 layer/TS/276·관리자 TS/5·격리DB Chromium9 통과. 원문·키·이메일·계좌/카드/본문 로그 누출 대조와 감사 장애/중복/권한/잘못된 입력을 포함.
- 발견/수정: MySQL upsert 경합의 감사 source_id 중복과 Telegram gate 동시 생성 충돌, frame 정규식 escape, 응답 header mock 보완. 처음 서버/브라우저 회귀를 동시에 실행해 E2E DB 잠금에 거부됨 → 순차 재실행137통과. 별도 신규 스키마 CREATE 권한이 없어 권한 확대 없이 기존 잠금 보호 E2E DB를 사용해19통과.
- local3307 dev/E2E에만 migration 적용. 운영 DB·이미지·보안그룹·외부 발송 변경 없음. 실제 PG/은행/Workspace SMTP·CloudWatch 수신·독립 감시 호스트·보유기간 확정·운영 부하/복원/불변 보관은 미검증/미설정으로 명시. 로그가 모두 비즈니스 행위의 완전한 재현이나 무결성을 보장한다고 주장하지 않는다.
- 상세 docs/operational-logging.md, 명령/시각/종료코드/파일SHA/초기실패와 최종결과는 docs/logging-implementation-20261022.json. 이후 배포 시 APP_RELEASE 지정과 감사 migration/새 API·worker·front·admin·Caddy 적용이 필요하다.


## 2026-10-22 분실·정지 카드 정기결제 복구 (진행 중)

- 사용자 구현·배포 승인. 기존 운영 로그 미배포 변경을 보존하고 그 감사 migration과 함께 배포 준비. 합격 조건: 확정 카드 불능 시 같은 카드 추가 청구 0, 일시 실패 기존 한도/간격 유지, 미확정 결과 동일 주문 대사, 새 기본 카드로 한 번만 갱신, 해지/복구기한 후 재청구 0, 미결제 콘텐츠 권한 0, 안전한 인앱/SMTP outbox/운영 알림 및 실제 브라우저 흐름.
- 근거: Toss 공식 자동결제 승인 error-codes, billing integration; Stripe Smart Retries의 hard decline/기본 카드 변경 문서(2026-10-22 확인). 분실/도난/정지/유효기간/유효하지 않은 빌링키 등은 PAYMENT_METHOD_UNAVAILABLE, 공급사 원문은 사용자에게 노출하지 않음. 5xx/timeout/중복/처리중은 PAYMENT_UNCERTAIN을 유지.
- 기존 RENEWAL_MAX_RETRIES/RENEWAL_RETRY_HOURS 정책 값 유지. 카드교체 복구기간은 예정 갱신일+(재시도수+1)×간격, 다음 월 주기 이전으로 제한. 무료 이용기간 연장 없음. 복구기한 종료/한도 소진 후 자동갱신 종료, 새 카드 등록만으로 이미 해지한 구독 재개 없음.
- 실제 PG/실제 분실신고/외부 수신함 검증과 로컬 공급사 대역·SMTP 수신기는 구분. 검증 및 배포 결과는 후속 기록으로 남길 예정.

- 운영 preflight에서 RENEWAL_MAX_RETRIES/RENEWAL_RETRY_HOURS가 모두 미설정으로 확인됨. 위 '기존 값 유지'는 값이 설정된 환경에 해당한다. 사용자 표준 대응·배포 위임에 따라 기존 release-test-scenarios 권장 수치 3회/24시간을 빈 운영 설정에만 적용하며, 보편 강제 표준으로 주장하지 않는다. 운영 복구기한 최대4일·무료 유예 없음.


## 2026-10-22 카드 불능 대응·갱신 복구 운영 배포 완료

- 분실·정지·만료/잘못된 빌링키 등 확정 카드 불능만 사용불가로 표시하고 같은 카드의 신규 청구를 차단. 일반 확정 실패는 제한 재시도, 결과 불명은 동일 주문 대사 유지. 기본 카드 변경으로 대기 중 갱신 복구, 이미 해지한 구독 미재개, 갱신 대기와 신규구독 중복청구/복구기한 이후 직접 pay 차단. 미결제 콘텐츠 권한 미연장.
- 카드 불능 상태와 billing_notices outbox schema16번째 migration. 인앱 알림·정기결제 실패 Telegram 이벤트/감사, 실패/종료 SMTP 안내와 재전송·동시 claim·해결된 알림 생략. 결제 재시도중에는 안내를 영구 생략하지 않고 보류한다. SMTP 접수후 프로세스 종료의 중복 가능성은 at-least-once 한계로 명시.
- 운영 빈 RENEWAL_MAX_RETRIES/RENEWAL_RETRY_HOURS에 기존 권장 3/24 적용. 최대4일 카드교체 복구·무료이용 유예 없음. 운영 Toss는 test 키, SMTP/운영봇 설정 있음. 관리자 금융정책(수수료·정산보류)은 미설정으로 남아 있으며 임의 확정하지 않았다. 실제 분실카드 실승인·실구독 청구·새 외부 이메일 전송은 수행하지 않았다.
- 검증: 핵심 금융/인증/SMTP/관리 API162 PASS, 최종 복구·메일 경합26 PASS, front276/TS/layer·admin5/TS, 실제 격리 DB Chromium 결제2/관리9, 로그55+선택DB1skip·별도MySQL19, 문서 대조검사5종. PC/390px 카드 교체/복구 및 해지 후 미청구 확인. 자동화의 build/테스트 동시 실행 실패는 순차 재실행, UI transient busy 상태 오판은 저장 완료 대기로 수정했다.
- 배포: API/worker/front/admin billing-recovery-20261022, 기존 미배포 감사 로그·Caddy 안전 로깅 포함. amd64 이미지/실행 소스 SHA 일치, 운영 migration16/6컨테이너 정상/worker 실패0. DB 컨테이너·데이터/미디어 볼륨 보존. 정상 TLS 공개20 검사(401/403/404 대조), 로그인된 Chrome 운영 로그 실제 조회/필터 및 배치 기록 확인. 초기 공개 검사에서 Caddy 차단404에 API 요청ID를 요구한 잘못된 조건을 범위에 맞게 수정 후20 PASS.
- 첫 배포 중 발견한 메일 경합 보완을 후속 이미지로 다시 적용했다. 초기 전송 중단 시도는 프로세스를 찾지 못해 첫 배포가 완료됐으며, 원본 롤백설정을 보존한 채 최종 이미지/소스 일치까지 재검증했다. 원래 롤백 /opt/crefans-backup-billing-recovery-20261022, 후속기록 /opt/crefans-backup-billing-recovery-final-20261022. 추가형 schema는 역migration하지 않는다.
- 원격 업로드 제거, 배포 전용 현재PC/32 SSH 규칙 삭제 및 기존 보안그룹 원상복구 확인. CloudWatch/독립 모니터 설치·법정 보관정책·실공급사/실수신·상용출시 전 검증은 별도 잔여. 증거 docs/billing-recovery-20261022.json, front docs/audit/billing-recovery-{desktop,mobile}.png, admin docs/screenshots/billing-recovery-logs-live.png.

## 2026-10-22 지인 22명 베타 사전 준비 조사

- 읽기 전용 운영 점검: 6컨테이너 정상/현재 재시작0/OOM 없음, RAM available2413MiB·디스크35GiB, 공개 health(DB 포함)/피드/admin로그인200. worker 마지막완료3초전/직전실패0, 최근1시간 감사5xx0·2분초과알림0. 계정1·creator/subscription/order/media0이므로 이 결과로 실사용 안정성을 보장하지 않는다.
- 실제 설정은 PASS3키/은행adapter2키 없음, 자동송금false, Toss양쪽test, SMTP/Telegram/암호화키존재. 금융정책version0·fee/hold null로 정상가입/청구 전제 미충족 확인. 값·개인정보·주문원문은 출력하지 않았다. 정책/키/DB/배포/보안그룹을 변경하지 않았다.
- 권한/빌링복구/worker/미디어/Playwright 소스와 과거검증을 검토. 실제 재생영상·iOSSafari·22명동시·완전호스트장애·복원 검증은 아직 별도. 기존 access 테스트의12byte영상은권한fixture, 모바일Chromium은실기기증거아님. 백업보류방침을 유지하며 실제 지인데이터 전 복원훈련을 권장한다.
- front docs/release-test-scenarios.md에 파일럿 합격목표/순서 추가, 근거 front docs/audit/pilot-readiness-20261022.json. 제품단위/통합/E2E를 이번 조사에서 재실행하지 않았으며 공식Toss/OWASP/AWS 문서와 실환경읽기 근거를 분리했다. SSH초기일반docker권한거부 후 기존sudo로조회성공; 설정확대없음.

## 2026-10-22 S3·CloudFront 운영 전환 (진행 중)

- 사용자 구조전환·충분한 테스트·운영배포 승인. 기존 미커밋 작업 유지. 신규 private S3/disk staging/CloudFront RSA-SHA256 서명60초/권한·환불이용이력 선확인/구독종료 상한/실패row 추적·정리 구현, 기존local·legacy S3읽기 보존. API URL을 유지하고307만CDN전송으로연결. 서명은최대60초 bearer권한으로 발급후로그아웃/정책변경 즉시회수와동일하지않음; 원래구독종료시각은상한반영.
- 서버단위8 PASS, 프론트MediaVideo재인증2 PASS. SDK초반만료초단위반올림 대조실패를floor로수정후통과. 프론트전체검사 진행중. 실제S3/CDN/DB/브라우저 및운영업로드 검증은아직미완료.
- infra/platform/provision-media.py read-only plan 확인 후AWS생성 진행. 전용서울버킷crefans-beta-media-849615239502-apne2,CloudFrontFREE·OAC·trustedkeygroup·browser no-store viewer-response,EC2prefix한정역할/IMDSv2hop2. 배포 private기록 .local/aws-beta/media-release/,키값로그금지. publickey만AWS등록. 신규리소스 journal로중복생성방지,기존다른CDN/버킷미변경.
- 다음:실AWS우회/서명만료/Range·실영상/캐시헤더 검사,격리DB 권한·환불·정리회귀,프론트검사/브라우저,amd64빌드/rollback준비/APIworkerfront만배포/실환경검증. 아직운영완료아님.

### 2026-10-22 S3·CloudFront 전환 검증 진행

- FREE 플랜 ACTIVE, 배포 Deployed. OAC/서명/공개 차단/버킷 범위 역할 + Docker IMDSv2 확인. 운영 앱 변경 전 실제 로컬DB+AWS+Chromium 6개 통합 검사 통과(업로드·권한·환불 경합·캐시/Range·원본/변조/만료 차단·삭제 실패 재시도·만료 URL 재인증/seek).
- 단위8, 프론트278, 서버도메인95, operations47통과/optional MySQL1미실행. 전체 E2E 최초49통과/2실패: 오래된 환불 UI 기대와 손상 PNG fixture 원인. 현재 미열람 API 환불/열람 거부·손상 이미지 거부 계약으로 테스트 교정 후 서비스 E2E12통과; 나머지40 화면/복구 검사는 최초 실행 통과. 금융 공급사는 대역이며 실제 PG 재검증 아님.
- Multer2.3.0, Sharp0.35.5, AWS SDK 갱신. 런타임 audit49→23(critical2→0); 미디어 관련 패키지 보고항목 해소, 기존 공통 의존성 high12/moderate9/low2는 별도 잔여. 자동 major 업그레이드 미실행.
- Docker linux/amd64 API178·front462 소스/asset 해시 대조. front public 일부파일 root 소유권 때문에 읽기 실패해 COPY --chown=node:node로 수정·재빌드/대조. 운영 배포/HTTPS smoke는 별도 최종 결과로 기록한다.

### 2026-10-22 S3·CloudFront 운영 전환 완료

- 14:52 KST beta.crefans.com API/worker/frontend를 media-cdn-20261022로 반영. 기존 DB/admin/proxy 컨테이너 보존, schema 변경 없음. 기존 미디어0 확인 후 전환. FREE CloudFront ACTIVE.
- 실제 HTTPS 운영자 임시5분 세션으로 이미지·영상 업로드201→DB platform key/완료·SSE-S3→API307→CDN200/HEAD200/Range206·바이트 확인. 비로그인API/서명없는CDN/직접S3 403. EC2 역할의 bucket list/접두어밖 write 403. 테스트 파일2건과 임시세션 삭제, media0/member1/creator0 보존.
- 배포 전 롤백 시험의 Docker env-file 따옴표 해석 차이를 Compose 실행으로 수정. 운영 smoke의 테스트 토큰 형식 오류(hex→base64url)도 수정; 두 실패 시 이전 이미지 자동 복구. 최종 이전 이미지의 새 S3 읽기와 새 이미지의 HTTPS 업로드 모두 통과. 실제 회원 비밀번호/계정/결제 변경 없음.
- 14:53 KST API/worker/frontend restart0/OOMfalse, API/feed/preview/정적이미지200, worker failures{}·37ms, 최종 배포 이후 감사 error0. 관찰 구간의 결과이며 무장애 보장 아님.
- [미디어 운영 문서](docs/private-media.md), [실행 증거](docs/media-migration-20261022.json). 60초 bearer URL 한계·단일파일·실기기/부하/백업 미검증·기존 런타임 의존성 high12/moderate9/low2 잔여를 명시.


## 2026-10-22 공유 링크의 비구독 접근 차단 (진행 중)

- 사용자 원래 기획 확인: URL만 전달받은 비로그인/비구독자가 접근할 수 없어야 한다. 기존 60초 CDN bearer 서명은 요구 미충족. S3 저장 유지, API 세션/정확한 상품/기간/환불 권한 확인 후 서버 스트리밍으로 수정. GET/HEAD/Range 모두 검사, 해지예약은 남은 유료기간만 허용. 브라우저에 서명/저장소 URL 미제공, 기존 CDN 직접 접근도 폐쇄 예정.
- 대가: CDN 직접전송/캐시 비용절감은 중단, EC2 전송량/연결 사용 증가. 인증된 다운로드 후 저장/녹화 회수는 별도이며 완전 방지를 주장하지 않음.
- 합격 조건: 실 S3+격리DB/다중 브라우저에서 복사 URL·타상품·만료·로그아웃·HEAD/Range 우회 거부, 정상/해지예약/소유자 재생·seek, 비공개 원본/CDN 폐쇄. 통과 후 API/worker/front 운영 배포와 실제 HTTPS 확인. 기존 미커밋 변경/DB 보존.

### 2026-10-22 세션 보호 미디어 운영 반영·검증

- 15:20 KST beta.crefans.com API/worker/front를 media-session-20261022로 교체. S3 저장 유지, 매 GET/HEAD/Range의 세션·구독·기간·환불 검사 후 API 스트리밍, 외부 서명 URL/307 제거. Next HEAD·취소 신호/보호 헤더 전달. CDN 서명 설정은 활성 runtime에서 제거. DB/admin/proxy 컨테이너·schema 유지.
- 단위10·front278/layer/TS·도메인95·서비스 E2E12 PASS. 실제 S3+로컬DB/Chromium6 PASS: 영상 디코딩/seek, 복사 이미지·영상 URL을 비로그인/다른 로그인 세션에서403, 타상품/만료/로그아웃/비활성 계정/환불 경합/성인·공개 재사용 우회 거부, 해지예약 허용.
- 실제 운영 HTTPS 합성 소유자·구독자·비구독자에서도 이미지/영상 업로드201, GET200/HEAD200/Range206, 비구독/타상품/만료/회수세션 거부 확인. 테스트 자료 제거 후 member1/creator0/media0. API/worker/front running/restart0/OOMfalse, 15:22 관찰 시 배포후 감사error0.
- 기존 CDN은 15:23 KST Disabled/Deployed 확인, 캐시 /* 무효화 Completed, S3 OAC 허용 제거 및 CloudFront 읽기 명시적Deny. 실제 만료 전 서명 URL의200→403 대조 통과; 원본403. AWS 전파 완료 최종상태는 docs/media-session-20261022.json 참조.
- 이미지 소스178+462 SHA 일치. 최초 sandbox DB연결 거부는 허용 네트워크로 재실행; 배포 최초 백업폴더 권한 실패는 앱 변경 전 중단돼 sudo install 스크립트 재전송 후 성공. 호환 rollback은 billing-recovery-20261022 + 신규 S3 버킷 서버 전송이며 실제 객체 읽기 통과; CDN 재활성화 금지.
- 비용 영향: EC2가 바이트를 전송하므로 이전 CDN 직접전송 비용절감 가정 폐기. 이미 허용된 연결/저장 사본·녹화 회수, 탈취 쿠키, 대규모 부하/복구/실금융 검증은 별도 한계. 이 변경을 전체 출시/무결함 보장으로 확대하지 않는다. 상세 서버 docs/private-media.md 및 docs/media-session-20261022.json.

- 최종 문서 계약/인벤토리58·라우트96 및 누락/변경 대조5종 PASS. 실제 실행·운영 증거와 단순 문서 해시 snapshot을 구분해 보존. 후속 미디어 작업에서도 URL 공유로 비구독 접근이 허용되는 설계를 도입하지 않는다.

## 2026-10-22 멤버십 레벨별 공개 (진행 중)

- 현재 상품 지정 공개는 정확한 상품만 허용하며, 최소 레벨 판정은 서버 내부에 있으나 스튜디오 설정이 빠져 있음. 기존 access_plan_id/ membership_level 필드를 재사용해 기존 상품 전용 게시물은 유지하고 accessLevel(최소 레벨) 옵션 추가. DB 구조 변경 없음.
- 멤버십 rank(1~100)를 관리하고 가입 당시 rank 스냅샷 기준으로 판정. 상품 수정이 기존 구독의 레벨/가격을 변경하지 않음. 모호한 상속을 가격으로 추론하지 않음. 공개/최소 레벨/정확한 상품을 명시적으로 구분.
- 합격 조건: 레벨1/2/3 본문·댓글·이미지·영상 권한 행렬, 다른 크리에이터·비구독·만료 차단, 해지예약 기간 허용, GET/HEAD/Range·복사 URL 우회 차단. 설정 저장/수정과 목업/실서비스 동일 UI 확인 후 운영 배포 및 합성 계정 검사/정리. 이전 미커밋 변경 보존.

### 2026-10-22 멤버십 레벨 공개 운영 배포·검증 완료

- 16:02 KST membership-level-20261022 API/worker/front 반영. DB/schema/migration 변경 없이 membership.level과 posting.membership_level/access_plan_id 재사용. 기존 상품 전용 글 유지, 새 최소레벨 설정과 rank1~100 입력 추가. 과거 구독 snapshot의 레벨 유지, 기존 클라이언트의 필드 생략 수정도 레벨 게시물을 전체 공개로 바꾸지 않음.
- 공통 스튜디오/팬/미리보기 UI에 레벨과 공개 범위 표시. 프론트281/layer/TS, 서버 build 및 도메인95, 서비스 E2E12, 실제 S3·격리DB·Chromium9 통과. 신규 작성/수정/새로고침, rank1/2/3 행렬, 본문·댓글·이미지/영상 GET/HEAD/Range·환불·해지예약·만료·타크리에이터·복사 URL·정확한 상품 보존 확인. 금융은 공급사 대역 회귀이며 실결제 재검증 아님.
- 운영 HTTPS 합성 소유자/구독자/비구독자에서도 9개 레벨 조합과 이미지/영상 bytes/HEAD/Range, 해지예약·기간 만료·회수 세션 차단 확인. 가입 당시 레벨이 상품 수정으로 바뀌지 않음. 테스트 자료 삭제 후 member1/creator0/media0. 16:04:57 최종 관찰 시 배포 후 감사error0, API/worker/front running/restart0/OOMfalse. DB/admin/proxy 컨테이너 유지.
- 배포 이미지 API178·front462 소스/asset SHA-256 일치. 이전 media-session 이미지의 실제 S3 읽기를 배포 전 검증하고 자동 복구 준비. CDN은 계속 폐쇄. 임시계정/세션/객체 제거. 장시간 부하/실금융/백업복원 등 별도 범위를 무결함 보장으로 확대하지 않음.
- 증거: 서버 docs/membership-level-20261022.json. 기존 문서의 잔여 CDN 서명60초 설명도 현재 API 스트리밍 계약으로 교정. 테스트 기대값에서 CDN DNS 제거/미디어 소유권403/동일 이름 fixture 선택을 보정했으며 실제 제품 권한 우회로 해석하지 않음.

- 마지막 대조: 상품 ID가 다른 상위 레벨 구독도 최소 레벨 글에는 허용되는 것을 로컬·운영 이미지/영상 Range에서 확인. 기존 상품 전용의 타상품 거부는 유지. 문서58개/계약96라우트 대조 및 음성대조5종은 실제 제품 검사와 구분해 기록.

## 2026-10-22 CDN 비용·공유 링크 권한 조사 (제안, 미구현)

- 사용자 요청은 업계 방식 조사. AWS/Google 공식 문서 확인: 서명 쿠키는 URL만 공유받은 비구독자를 막지만 발급 후 권한 회수는 쿠키 만료와 구분해야 함. 크레팬스에는 Lambda@Edge viewer-request가 현재 세션·상품/레벨·기간·환불 열람을 확인한 뒤 S3/CloudFront가 파일을 보내는 구조를 권장. 캐시 적중도 검사하고 실패 시 거부·허용 결과 캐시 금지. 자체 인증 유지 가능.
- 현재 EC2 스트리밍은 배포 상태의 설명이며 CDN 비용 절감과 URL 공유 차단이 양립 불가능한 것은 아님. AWS 원본→CloudFront 전송 무료; EC2가 원본인 구성도 요금 절감 여지는 있으나 중계 부하는 남음. 권장안은 미디어 바이트를 EC2에서 분리하며 인증 API/DB 부하·지연은 유지.
- Free $0/100GB·100만요청, Pro $15/50TB·1,000만요청; Lambda@Edge 별도 과금·상위 플랜 전용 정책/함수 조합 제한 확인. 100만 미디어 요청, 인증100ms+응답1ms/128MB 가정 시 함수 약$1.83, Pro 포함 약$16.83은 CDN/함수 예시만이며 총 운영비/절감 실측 아님. 작은 사용량에서는 즉시 절감이 보장되지 않음.
- 서버 docs/private-media.md에 비교·구체 보안 경계·실패 대조/캐시 적중/Range/실기기/부하 합격 조건 기록. 근거 docs/media-cdn-research-20261022.json에 공식 출처·확인일·HEAD/dirty·소스SHA·Decimal 계산4검사 PASS 저장. 제품 코드·운영·과금 플랜 변경/배포/새 아키텍처 실험은 미수행. 문서 검토와 문서 스냅샷은 런타임 보안 증명과 구분.
- 문서 검사: `npm run docs:record && npm run check:docs && npm run test:docs` 종료0, 문서58/라우트96/로컬링크181 대조 및 잘못된 입력5종 PASS. 이 결과는 문서의 계약·참조·변경 탐지 범위이며 CDN 실구현 검증이 아니다.

## 2026-10-22 세션 검증 CDN 전환 (진행 중)

- 사용자 테스트 후 구조전환·운영배포 승인. 동일 beta 호스트/세션 쿠키/API 파일 주소 유지, CloudFront viewer-request가 고정 원본 HTTPS API에 HMAC 서명된 권한 조회. 캐시 적중도 기존 상품/레벨/기간/환불 판정, 실패 시 거부. private S3/OAC가 바이트를 전송하며 직접 API 스트리밍은 안전한 롤백/legacy 경로.
- 실IP는 엣지가 생성한 짧은 HMAC 서명으로 인증한 경우만 Caddy 신뢰 경계 안에서 사용. 일반 요청은 캐시하지 않으며 보호 미디어만 불변 UUID 객체 캐시. 브라우저 no-store, 쿠키 S3 전달 금지. 원본 전용 DNS/TLS와 기존 CloudFront 배포 재설정·전파 검증 후 beta DNS를 전환한다.
- 합격 조건: HMAC/변조/시간초과·권한 대조, 실제 S3·CDN cache hit 후 비구독/로그아웃/만료/레벨/환불/GET HEAD Range 거부, 브라우저 영상 seek, 22 동시 요청, 운영 배포 후 같은 검증과 임시 자료 정리. 기존 dirty 변경 보존, DB migration/금융 실행 없음.

- 16:30 KST 원본 준비 배포: API/worker media-edge, Caddy 원본 전용 TLS. beta DNS는 EC2 유지, DB/admin/frontend 컨테이너 보존. 16:31 실제 CloudFront 사전 검증: S3 이미지/영상·레벨9조합·GET HEAD Range·캐시 적중 후 미구독/만료/환불/삭제/로그아웃 거부, 22동시Range 전부206(p95 1082ms), API파일스트림0·권한조회148, 실제IP 보존, 임시 자료 정리 통과.
- WebKit metadata-only 사전로딩을 프레임 재생으로 간주한 검사 조건을 발견. 실제 play 후 디코딩/seek는 진단에서 정상. 기존 MediaVideo media_retry 쿼리도 별도 확인하여 유일한 양의 정수 카운터만 허용하고 매번 인증·캐시키 제거하는 호환 보완 추가. 아직 최종 CDN DNS 전환 전이며 브라우저/장애·최종 이미지 검증 진행 중.

### 2026-10-22 세션 검증 CDN 운영 전환 완료

- 16:47:41 KST beta DNS를 CloudFront로 전환. API/worker `media-edge-final-20261022`, 프론트 `membership-level-20261022` 유지. DB/schema·admin/front 보존. 동일 URL·host-only 쿠키, 매 GET/HEAD/Range의 현재 세션/상품/레벨/기간/환불 검사 뒤 비공개 S3/CDN 전송. 일반 API/페이지는 캐시하지 않고 브라우저 no-store 유지.
- 로컬 단위/loopback37 PASS·선택MySQL1skip, 도메인95, 실S3·격리MySQL·Chromium10, 운영HTTP/로그설정2 PASS. 실제 CloudFront 사전/운영: 이미지·영상 업로드201/GET200/HEAD200/Range206, 레벨9조합/정확한상품/해지예약·만료·계정정지·회수세션·환불·삭제/복사URL 차단. media_retry도 재인증하며 임의 쿼리/예전서명 거부. 캐시3회Hit, 운영 합성검사 권한조회154·API파일스트림0, 실제IP 기록.
- 베타 DNS 전환 전 인증 호스트를 응답 불가로 바꾼 실제 장애 대조: 이미 캐시된 영상503/파일미노출, 정상함수 복구 후206. 테스트 장애함수는 운영에 연결하지 않음. 22동시Range 전부206, 운영 p95 619ms/max684ms. 한 구독의 짧은 동시요청이며 22명 장시간 검증이 아님.
- Chromium/WebKit PC·390px에서 디코딩/재생/seek·복사URL403. 실제 로그인폼201·Secure HttpOnly host-only쿠키·refresh201·미디어206·logout후차단을 두 엔진에서 확인. 물리적 iPhone 검증은 아님. 초기 브라우저시험의 metadata/play 대기와 로그인후자동이동 가정을 실제 UI동작에 맞춰 보정. 임시정리스크립트 /tmp 모듈경로 보정 후 합성계정·파일 제거.
- 16:51:26 KST 최종 확인: CF Deployed/Free ACTIVE, S3공개차단4종/OAC범위/게시된함수SHA 일치. API이미지 amd64 소스180 SHA 일치, 6컨테이너 running/restart0/OOM없음, worker최신실패없음, 전환후감사5xx0. 임시계정0·기존member1/creator0/media0. 원본준비백업 /opt/crefans-backup-media-edge-20261022 및 최종이미지백업 /opt/crefans-backup-media-edge-final-20261022 보존. 문제 시 origin-only로 보호API 전송 및DNS복원, bearerURL 재활성화 금지.
- 증거 docs/media-edge-20261022.json, frontend docs/audit/media-edge-{desktop,mobile}.png. S3/함수 별도과금·인증API/DB 의존은 유지하며 월비용 절감 실측/무결함을 주장하지 않는다. 이미 허용된 연결/저장사본·세션탈취, 물리적기기·장시간부하·실금융·백업복원은 별도. 사용자 기존dirty작업을 보존했고 이 작업에서 Git commit/push는 하지 않음.

- 최종 문서 계약58/라우트98/화면41 및 잘못된 입력 대조5종 PASS. 장애 시험 후 Lambda $LATEST도 정상 코드로 복구(활성 번호버전 불변), 원격 배포 임시파일 제거. 공개 증거에서 비밀값·세션토큰 제외 확인.

## 2026-10-22 베타 모집 가능 여부 재확인

- 17:39 KST 운영 읽기 전용: PASS3설정 없음, Toss client/secret test, 은행adapter 없음/자동송금false, 금융정책version0·수수료/정산보류null, published terms/privacy 없음. worker 최근완료·실패map비어있음. 비밀값/개인정보 출력, 가입/청구/설정 변경/배포 없음.
- 판단: 지인 비공개 모집 공지는 가능하나 현재 그대로 일반가입·구독 초대를 시작할 단계는 아님. auth.service는 본인인증과 게시 약관 스냅샷을 필수로 검사하고 financial-policy는 미설정 시 checkout503. 요청한 약관 하드코딩 방침을 구현·동의이력과 맞추는 작업이 남음. 미디어 배포 검사 통과를 전체 가입/결제 완료로 확대하지 않음.
- 다음: PASS 실제연동/본인가입, 약관·개인정보 실제게시/동의처리, DB금융정책 확정·입력 → 실기기·별도계정 소수 파일럿 → 크리에이터2명/팬20명 확대 권장. 실제 과금은 토스 live활성화·실주기검증 후 별도. 운영정책/가격을 이번 조사로 임의 확정하지 않음. 사용자 백업보류 유지, 복원검증 미완료 경계 명시.
- 공식 토스 API키 문서(https://docs.tosspayments.com/reference/using-api/api-keys)와 OWASP Authorization Cheat Sheet(https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)를 2026-10-22 확인. 증거 front docs/audit/beta-invitation-readiness-20261022.json에 실행시각/종료0/소스SHA/운영boolean과 판정 분리. 이전 실CDN 증거 server docs/media-edge-20261022.json을 재사용했고 제품 테스트는 재실행하지 않음.

## 2026-10-22 플랫폼 수수료 20% 초기값 저장

- 사용자 수수료20% 지정에 따라 17:51 KST 운영 financial_policies.platform/platform_fee_bps를 null→2000으로 저장. 보류기간은 질문 단계로 미결정이므로 null 유지. 기존version0/정책이력0/주문·구독·수익0을 검사한 뒤 동시 변경 방지 조건과 동일 트랜잭션 감사(admin.financial_policy.fee_draft_set)로 수수료 초기값만 저장. 활성 정책 발행·송금·결제·환경변수·코드·schema 변경 없음.
- 검증: readback2000/holdnull/version0/configuredfalse, 감사before/after, paymentPolicy의 FINANCIAL_POLICY_REQUIRED 차단 대조, 10000원×20%=2000원/순수익8000원 계산 확인. 보류기간이 정해지면 기존 SUPER_ADMIN 금융정책 API에 expectedVersion0/fee2000/합의한일수를 함께 넣어 version1 발행할 것. 이번 초기값 기록은 감사 원장에 있고 완성된 금융정책 이력은 아직 생성하지 않음.
- 보류기간은 성공 결제 처리 시각+일수×24시간으로 available_at을 정해 출금 가능 잔액으로 전환하는 내부 대기기간. 자동송금 시점·환불권 소멸·PG입금 확인이 아님. PG 정산은 계약·영업일 주기이므로 별도 확인 필요. 공식 토스 https://docs.tosspayments.com/resources/glossary/settlement 2026-10-22 확인. 임의 보류일수/PG·세금 부담 정책을 정하지 않음.
- 증거 front docs/audit/fee-policy-20261022.json: 실제 명령/시각/종료0/HEAD·dirty/스크립트·소스SHA/검증 결과. 다음 할 일은 보류기간 결정과 앞선 PASS/약관 준비. 직전 모집준비 증거의 fee=null은 변경 전 기록이다.

## 2026-10-22 코드 관리 약관·개인정보처리방침 (진행 중)

- 사용자 요청: 맥북 공식 가이드와 현재 구현을 대조하여 하드코딩·운영배포. Downloads의 개인정보보호위원회 2026.4 작성지침185쪽을 추출하고 국외이전 표(PDF47쪽/본문45쪽)를 렌더링 확인. 2026.9.11 시행 개인정보법·2026.7.21 시행 전자상거래법령 및 AWS/Google/Telegram 공식 자료 대조.
- 사업자 정보: 사용자가 상호 좋아하는일해야지 확인. 로컬 사업자등록정정 제출서와 grade_homepage의 회사 공개정보, uba_server 약관 초안을 교차 확인해 상호·대표자·사업자번호·주소·전화·회사 공개 이메일·개인정보책임자를 반영. 통신판매업 신고번호는 발견 못함(미신고로 단정하지 않음). 원문 개인 서류를 리포에 복사하지 않음.
- 확인된 정책: 수수료20%, 해지예약은 기간말까지 권한 유지, 미사용 전액환불은 고객센터/API, 상품·최소레벨 구분. 법정 청약철회권을 해지예약이나 단순 페이지 진입 기록으로 일괄 배제하지 않음. 정산보류·PG/세금 부담·연령은 임의 확정하지 않음.
- 구현: server src/platform/legal-documents.ts 단일 코드 원본으로 common/가입 문서 제공, 관리자 문서 API는 공지·FAQ만. 문서 본문·버전+SHA·시행 상태/시각을 확인해 member_consents에 원자 저장. 프론트 LegalDocumentBody를 공개문서·가입 모달에서 공유, 실제 모달의 URL 텍스트 표시 버그 수정. 개인정보 안내 확인과 선택 마케팅 동의 분리, preview 샘플·기존 링크 유지.
- 중요한 미해결: withdrawAccount는 비활성화만 하고 개인정보 파기 안 함. 일반요청 외 감사 보유기간 미결정, 인증 만료와 실제 파기 다름. AWS 글로벌 edge·Google메일·Telegram IP알림 국외이전의 실제 국가/계약/보유기간 미확정. 원본이 서울이라고 전부 국내처리라고 쓰지 않음. 가입연령 사용자 질문 중. 이 상태에서 효력 있는 시행본이라고 허위 게시하지 않도록 draft/시행일null/가입·가입인증메일 차단. 기존 로그인/비밀번호복구/미디어 동작 유지.
- 검증 진행: server build, 법률문서 단위5, 실제격리DB+공급사/SMTP대역21, front layer/TS/단위282 PASS. 관리자 API 우회 방지 추가 후 재검증·브라우저·배포 대기. PASS/PG/은행 실검증·외부법률검토·데이터파기 개선 완료를 주장하지 않음.

### 2026-10-22 가입 기준 확정·후속 검증

- 사용자 응답으로 가입을 생일 기준 만19세 이상으로 확정. 법제처/현행 청소년보호법을 대조하여 연도 예외와 구분. PASS adapter signup 요청 minimumAge19, 서명된 콜백 adultVerified===true 및 가입 proof.adult_verified 이중검사. 생년월일 원문 추가 저장 없음.
- 약관·개인정보 초안2와 공통 가입 화면/목업 문구 반영. false/누락/문자열/숫자 콜백과 클라이언트 adultVerified/birthDate 위조 거부, 실패 시 proof 소비·회원 생성 없음 검증. 서버58(front282) PASS, 서비스 E2E 및 후속 이미지/운영 브라우저 검증 진행 중.
- 앞선 legal-draft 릴리스는 18:15KST 초안1로 반영되고 health/문서/6컨테이너 검사 통과. 연령 반영 legal-age 후속 배포 준비. 파기/국외이전/콘텐츠 정책 등 미해결은 유지, 가입 개방 아님.

### 2026-10-22 약관 초안·만19세 제한 운영 반영

- 18:25:14 KST API/worker/front `legal-age-20261022` 배포 완료. 문서 `2026-10-22.draft-2`, 시행일null. 만19세 규약·사업자정보·수수료20%·해지예약/미사용환불·실제 개인정보 처리 항목을 코드 원본과 공유 UI에 반영. 관리자 법률문서 변경 경로 차단, 동의 본문/버전/SHA 원자 저장.
- 최종 변경 검증: server build·연령/약관/가입·SMTP/PASS/은행 대역/운영이벤트58 PASS, front layer/TS/단위282 PASS, 격리MySQL Chromium E2E12 PASS. 앞선 도메인 첫95중4실패는 기존 테스트의 시행본 fixture 누락이었고 테스트만 보정해95 PASS. 제품의 draft gate는 유지. 실제 공급사 결제/메일/PASS 검증과 구분.
- 운영 Chromium1440/390: 실제 API 본문이 코드와 일치, 목차/초안표시/가로넘침없음, 가입 모달 전체문서·자동동의없음, 가입메일/PASS/가입버튼 차단, preview 가입 동작 보존·페이지오류0. 모달 스크린샷은 애니메이션 완료 후 촬영. 18:26KST readonly: member1/creator0/media0, fee2000bps/holdnull/version0 유지, worker실패없음·해당릴리스HTTP5xx0. API/worker/front running/restart0/OOMfalse, DB/admin/proxy 컨테이너 보존.
- 이미지 소스 API181/front464 SHA 일치, amd64. DB migration/seed·미디어/S3/CF설정·금융정책 변경 없음. 백업 `/opt/crefans-backup-legal-age-20261022`에 직전 환경 보존·실패 시 이미지복구 절차. 이번 작업 Git commit/push 없음. 원문 개인서류/비밀값은 공개 증거 제외.
- **미완료/다음 작업:** 효력 있는 약관·처리방침 시행은 아직 하지 않음. 탈퇴후 파기·법정기록 분리/보관기간, AWS·Google·Telegram 실제 국외이전 계약·국가·기간, 통신판매업 신고정보·콘텐츠 허용범위·정산보류/비용/세금 정책을 확정/구현·검증한 뒤 새 시행본을 발행할 것. 실제 PASS연동 시 생일 전날/당일·연초/연말 판정 확인 필수. 가입연령은 더 이상 미결정 아님.
- 공개 검증 증거: front `docs/audit/legal-publication-20261022.json`. 문서 스냅샷은 계약/참조/변경 탐지 증거이며 적법성/무결함·출시가능 증명이 아니다.

- 최종 문서 확인:58문서/98라우트/41화면/188로컬참조 대조 PASS, 누락링크·신규문서·변경소스·변경문서·API변경 실패대조5종 PASS. 모바일 모달 애니메이션 완료 화면과 PC처리방침/모바일약관 시각 검수. 원격 전송 임시파일 제거, 복구백업 유지.

## 2026-10-22 법률문서 전체 공개 배포 (진행 중)

- 사용자 “약관도 다 배포” 지시에 따라 이용약관·개인정보·운영정책 공개본2026-10-22.1을 준비. 공개와 신규 가입 동의 적용을 구분해 publishedAt(공개일)·documentsPublished·signupReady를 명시한다. effectiveAt은 미정이며 미해결 절차를 완료했다고 허위 기재하지 않는다. 기존 만19세/결제/개인정보 guard 유지.
- 약관·처리방침·운영정책·가입 수집안내·선택 마케팅 문서를 공개본으로 일치시키고 초안 표현을 현재 처리현황/신규가입 준비안내로 정리. 개인정보 실제 삭제·국외이전 계약 확인이나 사업정책의 새 결정을 이번 공개 지시로 임의 수행하지 않음.
- 합격 조건: 공개 API와3개 페이지 본문 일치·공개일/버전 표시, published문서라도 signupReady=false면 메일/PASS/가입 차단, 시행일·blockers 우회 없음, 목업·동의 원문/해시 유지. build/단위/격리DB/운영1440·390 브라우저/배포 후health·worker 검사와 증거 기록 예정.

### 2026-10-22 법률문서 공개본 배포 확인

- 18:50:37 KST API/worker/front `legal-public-20261022` 반영. 이용약관·개인정보처리방침·운영정책 및 가입 안내/선택마케팅 문서의 공개본2026-10-22.1, 공개일2026-10-22. `documentsPublished=true`, `signupReady=false`, `effectiveAt=null`을 운영에서 대조. **공개 배포이며 정식 가입 적용 시행·개방 완료가 아님**. 미확정 파기/국외이전/사업정책을 허위로 완료 처리하지 않음.
- server build·관련 단위/격리DB16, front layer/TS/단위282 PASS. 실제 운영Chromium1440/390에서3공개페이지 및 가입모달4문서 본문 전체를 원본과 대조, 공개일/버전·목차·가로넘침없음/자동동의없음/가입차단/preview보존 확인. 18:51:22 최종 browserPASS·페이지오류0. 초기 운영정책 검사에 불필요한 상호 반복 요구가 있어 harness조건만 바로잡아 재검증했고 본문 전체 검사는 유지.
- 18:50:53 readonly: 기존member1/creator0/media0, 수수료2000bps/holdnull/version0 유지, worker실패없음·해당릴리스HTTP5xx0. API181/front464 소스SHA와 amd64이미지 일치, API/worker/front restart0·OOM없음, DB/admin/proxy 컨테이너 보존. schema/migration/미디어/금융정책 변경·실금융/외부메일발송·Git commit/push 없음.
- 복구백업 `/opt/crefans-backup-legal-public-20261022`. 증거 front `docs/audit/legal-public-release-20261022.json`. 이전 공개초안 증거는 당시 버전 기록이며 현재 문서 상태는 이번 증거를 따른다. 남은 실제 개인정보 파기·국외이전 계약/국가/기간·콘텐츠 허용범위/정산 등 사업정책·PASS실연동 검증 후 별도의 시행일을 지정해야 함.

## 2026-10-23 성인 구독 사업 범위 결정 및 결제사 적합성 재검토

- 사용자 확정: 성인 콘텐츠 구독 결제가 핵심이다. 일반 콘텐츠만으로 베타를 진행하는 제안은 채택되지 않았다. 선택형 답변으로 **누드 사진·영상까지, 성행위 제외**를 선택했다. 이는 원하는 사업 범위이며 개별 콘텐츠의 적법성이나 PG 취급 승인을 확인한 결과가 아니다. 만19세·수수료20%·해지예약·미사용 전액환불 결정은 유지한다.
- 공식 문서 확인(2026-10-23): [토스 이용계약 제17조](https://pages.tosspayments.com/terms/onboarding-260701/)의 판매금지 목록에 음란물과 성인유료 서비스 제공이 포함된다. 성행위를 제외한다는 이유만으로 누드 유료 구독이 토스에서 허용된다고 판단하지 않는다. 현재 실제 계약/개별 심사결과는 확인하지 않았으며, 테스트키 결제 성공은 업종 승인 증거가 아니다.
- 해외 대안도 즉시 연동 가능하다고 안내하지 않는다. [CCBill 가맹국가 안내](https://ccbill.com/doc/list-of-countries-for-visa-and-mastercard-processing)는 미국·캐나다·유럽 지정국의 사업/법적 소재 증명을 요구하고 한국은 목록에 없다. [Segpay 공식 FAQ](https://segpay.com/csfaq/)는 미국·영국·유럽 가맹점을 지원한다고 안내한다. 소비자의 한국 카드 결제 가능 여부와 한국 사업자의 입점 가능 여부는 서로 다르며 실제 심사 필요.
- 법적 검토는 PG 승인과 별개다. [정보통신망법 제74조](https://law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1017287871)는 제44조의7제1항제1호 위반 음란정보 유통 처벌을 규정한다. 조회 결과 시행일 표기가 검색 결과와 본문에서 다르므로 시행일을 확정 인용하지 않았다. 개별 누드물의 해당 여부는 이 조사에서 판단하지 않았다. 해외 결제사/서버 이용으로 한국 운영자의 법적 의무가 없어지는 것으로 안내하지 않는다.
- 다음 순서: 구체적 허용/금지 콘텐츠와 성인·출연동의·권리 확인/검수 방식을 문서화 → 현재 한국 사업자와 크리에이터 구독/수익배분 구조를 공개한 PG 공식 심사 및 필요한 법률 검토 → 승인 가능한 공급사 계약/정산조건 확인 → 정책·코드/약관 일치화·검증. 외부 문의 발송/새 계약은 아직 하지 않았다.
- 미결정: 20% 안에 PG비용·플랫폼 수수료 부가세 포함 여부, 보류기간·최소출금액·지급주기. 앞서 제안한 14일/최소1만원/수요일 지급은 미승인 추천이며 PG 계약 확인 없이 확정하지 않는다. 콘텐츠 범위를 더 세분화할 때 성행위 제외 결정을 유지한다.
- 검증 범위: 공식 웹 원문 열람 및 사용자 답변 기록. 저장소 HEAD `c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1`, 조사 시 dirty108경로(기존 작업 포함), 16:56KST 로컬 상태 확인. 이번 변경은 PROGRESS 기록만이며 제품 코드·DB·운영 정책·배포 변경 및 제품 테스트 실행은 없다. 계약 성사·적법성·운영 결제 가능 여부를 완료로 주장하지 않는다.

### 2026-10-23 토스 성인 결제·피딩 결제사 공개근거 대조

- 요청: 토스가 실제 성인물 결제를 금지하는지, 피딩(PDing, 팬딩 Fanding과 구분)의 결제사는 어디인지 웹조사. 합격 조건은 공식 계약 원문과 피딩 직접 게시 자료를 확인하고, 팬 결제/크리에이터 출금/본인확인을 구분하며 공개 자료로 확인하지 못한 내용은 미확인으로 남기는 것.
- [토스 20260701 이용계약 제17조](https://pages.tosspayments.com/terms/onboarding-260701/) 재확인: 판매금지 목록에 음란물·성인유료 서비스 제공이 명시되어 있으며 위반 시 직권취소·서비스 중지/제한·계약해지 조항도 있다. 크레팬스의 누드/성행위 제외·월구독·크리에이터 수익배분 모델에 대한 개별 승인 또는 예외는 확인하지 못했다. 일반적인 19세 이용제한 전체와 해당 계약의 성인유료 업종을 동일하게 단정하지 않는다.
- 피딩 공식 [WEB 출금 가이드](https://blog.pd-ing.com/web-service-guide/w-howtopayout), [APP 출금 가이드](https://blog.pd-ing.com/app-service-guide/a-howtopayout)에 Stripe로 신원/계좌를 연결하는 절차가 있고, [개인정보처리방침 2.1.2](https://legal.pd-ing.com/privacy-policy)에는 신분증/셀카 확인 공급사로 Stripe, Inc.가 명시되어 있다. 이는 Stripe 사용을 뒷받침하지만 현재 모든 팬 카드 결제가 Stripe라는 증거는 아니다. 출금 가이드 최신 개정일·실제 운영 공급사 라우팅은 미확인.
- 피딩 [현재 공개 약관 Payments](https://legal.pd-ing.com/terms-of-service)는 미국 PDing Inc가 청구 주체이고 Tree 선불 포인트로 개별 구매하며 정기구독/반복청구/PG 단위 분할정산을 운영하지 않는다고 설명한다. 크레팬스의 월 정기구독을 그대로 뒷받침하는 비교 사례가 아니다. 현재 팬 checkout PG 회사명은 확인한 공개 문서에 명시되지 않았으며 특정 업체로 확정하지 않는다.
- 피딩 공개 자료의 불일치: [홈페이지](https://www.pd-ing.com/) 하단은 성인/성적 콘텐츠 금지라고 쓰여 있으나, 직접 링크된 [커뮤니티 가이드](https://legal.pd-ing.com/community-guidelines) 및 약관은 성인 확인 구역에서 적법한 성인 콘텐츠를 허용한다고 설명한다. 실제 승인 범위·회사별 특약·과거/현재 변경 사유는 알 수 없다. 위법/우회/특약 존재를 추정하지 않는다.
- [Stripe 공식 FAQ](https://support.stripe.com/questions/prohibited-and-restricted-business-list-faqs), [금지·제한 업종](https://stripe.com/legal/restricted-businesses)도 성적 만족 목적 성인 콘텐츠를 금지하고, 크리에이터 플랫폼 승인 자체가 성인물 판매 허용을 뜻하지 않는다고 명시한다. 피딩의 Stripe 연동 언급을 크레팬스 성인 결제 허용 근거로 사용하지 않는다.
- 증거/한계: 공식 웹 페이지 원문 조회와 Codex 비로그인 브라우저에서 피딩 홈페이지 문구·약관 링크·로그인 선택창 확인. 공개 HTTP 직접 요청은403이었고 우회하지 않았으며 일반 브라우저는 랜딩 정상 표시. 팬 checkout은 확인하지 못했고 새 계정/성인인증/구매·외부 문의 발송 없이 조사 종료. 소스/DB/운영 변경 없이 PROGRESS만 갱신, 제품 테스트는 해당 없음. 다음 단계는 크레팬스의 정확한 콘텐츠 범위와 월 빌링 모델을 제시한 토스의 서면 취급 판단 및 필요 시 피딩의 현재 checkout 공급사/계약 범위 확인이다.

### 2026-10-23 한국 사업자 Stripe 전환 적합성

- 사용자 질문: 한국에서 Stripe를 쓰는 편이 나은가. 합격 조건: 한국 고객 결제 지원, 한국 사업자의 직접 가맹 지원, 성인 콘텐츠 취급을 서로 구분해 공식 문서로 판단.
- [Stripe 지원 국가](https://stripe.com/global)의 Payments 가맹 국가 목록에 한국이 없다. [한국 결제수단 공식 문서](https://docs.stripe.com/payments/countries/korea)는 지원 해외 소재 사업자가 한국 카드·일부 간편결제·KRW·반복결제를 제공하는 기능이며, Business locations 목록에 KR은 없다. 한국 개인사업자와 국내 계좌만으로 일반 Stripe Payments 계정을 개설할 수 있다고 안내하지 않는다. Connect 수취인/지급 지원과 플랫폼 본체의 Payments 직접 가맹 지원도 별개다.
- [금지 업종 정책](https://stripe.com/legal/restricted-businesses)(표시 갱신일2026-09-22)은 성적 만족을 목적으로 하는 성인 콘텐츠를 금지하며 승인된 크리에이터 플랫폼에도 해당 금지를 적용한다. 해외 법인 설립만으로 콘텐츠 금지가 해제되지 않는다. 개별 누드 작품의 분류/가맹 승인 여부를 이 자료만으로 확정하지 않는다.
- 권장 판단: 현재 한국 개인사업자·성인 누드 구독 핵심이라는 조건에서 Stripe로 즉시 전환하는 안은 추천하지 않는다. 토스의 정확한 모델에 대한 서면 판단과 성인 취급을 명시적으로 지원하는 PG의 한국 사업자 계약 가능성·월 빌링·크리에이터 지급 조건 확인이 먼저다. 한국 결제 지원 자체를 부정하거나 피딩의 출금/인증 연동을 팬 결제 승인 근거로 사용하지 않는다.
- 검증: 2026-10-23 공식 웹 원문/국가 목록/금지 업종 대조. 이번 변경은 PROGRESS만이며 계정 신청·법인 설립·공급사 문의·코드/DB/배포 변경 및 제품 테스트는 없다. 가맹 가능성의 최종 공급사 확인은 미완료.

### 2026-10-23 사이트 재화 충전 방식의 토스 취급 조건 확인

- 사용자 제안: 카드로 사이트 재화를 충전하고 재화로 성인 콘텐츠를 구매하면 토스의 성인 콘텐츠 제한을 우회할 수 있는지. 제안 검토이며 기존 월 구독을 재화 모델로 전환하기로 확정하거나 구현 승인으로 해석하지 않는다.
- 합격 조건/공식 근거: [토스 20260701 이용계약](https://pages.tosspayments.com/terms/onboarding-260701/) 원문 제8조3호·제9조1항(신청정보 누락/허위와 진실한 정보 제공), 제17조2항(성인유료 서비스 금지), 제17조3항(환금성 상품 사전신청·승인, 예시에 포인트 충전 포함), 제17조5항(위반 시 취소·중지·계약해지)을 대조했다.
- 판단: 재화 결제는 구현할 수 있는 상품 구조이지만 성인 사용처 제한의 자동 면제 근거가 아니다. 카드→재화→누드 콘텐츠/구독 접근→크리에이터 현금 정산 전체를 설명해야 하며 충전 승인만으로 성인 사용처까지 승인됐다고 간주하지 않는다. 모든 포인트를 일률적으로 같은 법적 분류로 확정하지 않으며 실제 재화/정산 구조에 대한 PG 심사가 필요하다. 사용처를 누락한 신청이나 상품명만 변경하는 방식은 권장하지 않는다.
- 다음 단계: 누드 사진·영상/성행위 제외라는 범위, 재화 충전·사용·환불·크리에이터 지급 방식을 토스에 공개하고 이 전체 모델의 취급 여부를 서면 확인. 피딩의 포인트 사용을 토스 승인 사례로 취급하지 않는다. 선불 규제/잔액 보호/환불 요건은 실제 모델을 선택할 경우 별도 공식 조사하며 이번에는 법적 결론을 내리지 않았다.
- 검증 범위: 2026-10-23 공식 공개 계약 조항 확인과 기록만 수행. 코드·DB·배포·실제 결제·외부 문의 발송 없음, 제품 테스트 해당 없음. 계약 승인 여부는 미확인.

### 2026-10-23 NICE 본인확인 도입 문의 초안

- 요청/합격 조건: NICE 도입 문의 입력란에 붙여 넣을 초안을 작성한다. 사용자 확정 사업 범위(누드 사진·영상, 성행위 제외), 생일 기준 만19세 가입, 초기 크리에이터2명·팬 약20명 베타 계획을 정확히 설명하고, 계약 가능 여부·요금·테스트·연동 자료를 질문하며 외부 제출은 하지 않는다.
- 공식 근거: [NICE 도입 문의](https://b2b.niceid.co.kr/inquiry), 2026-10-23 확인. 직접 open에서는 본문 추출이 없었으나 공식 URL 검색 색인에는 휴대폰본인확인/회원가입 등 선택 항목과 문의내용 2,000byte 제한, PASS·문자 방식, 결과 CI/DI 안내가 표시됨. 실 브라우저의 전체 신청 단계/최신 선택값을 검증한 것은 아니다. 비용이나 성인 콘텐츠 업종의 계약 허용 여부를 확정하지 않음.
- 코드 대조: `src/platform/identity-provider.ts`와 `docs/provider-contracts.md`의 minimumAge19/adultVerified·CI 처리 계약을 확인. 기존 내부 어댑터와 NICE 공식 연동은 구분하며, 공급사 계약·자료·키 확보 후 전용 브리지 개발 및 실공급사 검증이 필요하다.
- 산출물: 채팅에서 복사 가능한 한국어 초안. 가입비/최소약정/실패·취소 과금, 소량 요금제, 테스트 자격정보, Node.js 문서, 도메인·콜백 등록, 최소 개인정보와 보관·파기 조건을 질문. UTF-8 1,508bytes(제한 이내), 앰대시 없음, 본문 SHA-256 `9a05c702addf042cb1ced6a6831794676e6a3bd552677e38ab8809edba0664e5`.
- 검증: 2026-10-23 21:50 KST 이후 공식 공개 안내·사용자 결정·소스 대조, Python UTF-8 길이/assert·해시 계산 종료코드0. 저장소 HEAD `c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1`, 조사 시작 dirty108경로(기존 변경 포함). 이번 변경은 PROGRESS 기록뿐, 제품 코드·설정·DB·배포·테스트 실행 및 외부 문의 제출 없음. 다음 단계는 사용자가 문의 제출 후 회신한 계약 조건/공식 기술 자료 확인이다.

### 2026-10-23 창작자 출금 계좌 확인 서비스 조사

- 요청/합격 조건: 계좌 유효성·본인 명의·점유 확인·실제 지급을 구분하고, NICE/토스 공식 안내와 현재 코드를 대조하여 소규모 베타 권장안을 제시한다. 서비스 선정/계약/송금/제품 구현 승인은 아님.
- 공식 확인: [NICE 계좌정보확인](https://niceid.co.kr/prod_acct.nc)은 계좌 유효성·소유주 성명/생년월일 일치 확인을 안내한다. [NICE 계좌1원인증](https://www.niceid.co.kr/cpsite/prod_acct2.nc)은 계좌정보 확인에 더해 OTP로 실제 계좌 소지를 검증하는 별도 상품이다. 인증 상품을 송금/지급대행으로 간주하지 않는다. 계약별 입력/제공 필드·은행 지원 범위·요금은 아직 미확인.
- [토스 부가 API의 계좌인증](https://docs.tosspayments.com/reference/additional)은 유효성/예금주/식별자 확인을 제공하며 별도 신청 대상. 테스트는 대역이고 간접조회 은행에서는 생년월일/사업자번호 검증이 수행되지 않아 잘못된 식별자에도 성공할 수 있다고 명시한다. 단순 성공 boolean이나 이름 일치만으로 동일인을 확정하면 안 된다. [지급대행 안내](https://docs.tosspayments.com/guides/v2/payouts)의 개인 셀러 본인인증/KYC·별도 계약과 구분하며 크레팬스의 실제 업종 취급 승인은 미확인이다.
- 권장안(미확정): 현재 NICE 상담에 계좌정보 확인과 1원 인증을 함께 견적 요청. PASS에서 검증된 본인 정보와 계좌 명의를 대조하고 최초 등록/계좌 변경 때 1원 인증을 추가한다. 1원 상품에 정보확인이 포함되는지 확인해 중복 계약·과금을 피한다. 매 출금마다 사용자에게 1원 인증을 반복시키는 대신 검증된 계좌 선택·금액/계좌에 묶인 출금 인증·이체 최종 결과를 확인한다. 신규 계좌 등록 후에도 폐쇄/정지 등 변화가 가능하여 과거 계좌 인증을 미래 입금 성공 보장으로 취급하지 않는다.
- 코드 확인: `auth.service.ts` 가입 member.name은 공급사 proof.verified_name에서 저장. `finance.service.ts` account 수정은 verified=false/version증가, verifyAccount는 회원 실명과 계좌를 BankProvider에 전달하고 verified===true 및 버전을 검사, review/payout은 검증 계좌만 사용, 출금 인증은 금액·계좌·버전에 묶인다. `bank-provider.ts`는 내부 /accounts/verify 및 /transfers 어댑터만 호출하며 실제 NICE/토스 연결과 1원 OTP 단계는 미구현. 공급사가 생년월일을 요구하면 현재 최소정보 계약/처리방침과 함께 설계해야 하며 임의 입력 생년월일로 대체하지 않는다.
- 검증: 2026-10-23T21:58:54.774729+09:00, server HEAD c100a3af5a5508adb0e6ba521d2e5238fb5f1ff1/dirty108경로에서 공식 문서 및 소스 읽기. 운영 설정/실공급사 인증·실제 송금·제품 테스트는 실행하지 않음. 과거 팝빌 소개 URL은 이번 open에서404로 현재 근거에 사용하지 않았다. 이후 공급사 회신·견적·지원 은행/검증 항목 확인이 필요하다.


### 2026-10-23 전체 플랫폼 API Swagger 및 운영 배포

- 요청/합격 조건: 현재 `/api/v1` 98개 API를 Swagger/OpenAPI로 문서화하고 운영에 배포. 실제 route와 명세의 누락/추가를 검사하며, 문서·JSON/YAML·정적 파일은 기존 관리자 세션으로만 열리고 실제 요청 실행은 금지한다.
- 구현: `src/platform/openapi.ts`, `openapi-contract.ts`, `main.ts`. 20개 기능 그룹, 공통 성공/실패 틀, 쿠키/Origin, PASS/edge 서명, 파일 multipart·Range 예외, 결제·환불·출금 의미를 명시. 구형 Cognito 런타임과 테스트 API는 제외. 요청·핵심 반환 필드를 코드와 대조하고 관련 검사 9개를 추가했다.
- 공식 조사·사용 안내: `docs/platform-api.md`의 Swagger 절. Nest10 호환 Swagger7.4.2, 이 의존성의 lodash4.18.1/js-yaml4.3.2 패치. 기존 운영 패키지 버전은 변경하지 않았으며 전체 의존성 취약점 해소를 주장하지 않는다.
- 검증: `npm run test:openapi` 빌드+9/9 통과. 누락/오래된 계약 실패 대조, HTML/JSON/YAML/assets 비로그인401·일반회원/비활성관리자403·관리자200, DB 오류 시 차단, OpenAPI 유효성. 격리된 인증/DB 대역이며 실제 공급사 호출 없음. amd64 배포 이미지에서98개 생성 통과. 상세 환경·시각·명령·해시·배포 단계는 [검증 증거](docs/swagger-20261023.json).
- 운영: `swagger-20261023` API/worker 배포 2026-10-23 22:28KST 완료. `https://admin.crefans.com/api/v1/admin/docs`에서 콘솔 로그인 후 조회. 관리자 브라우저의 API 목록/요청/응답 렌더링·검색·브라우저 오류 없음 확인, 두 도메인의 비로그인 문서4종401 및 health200 확인. JSON 직접 브라우저 탐색은 클라이언트 차단으로 별도 확인하지 못했고 로컬 인증 HTTP 검사를 구분 기록했다. DB/frontend/admin/proxy 컨테이너 보존, migration/seed/금융 정책 변경 없음. 롤백 설정 `/opt/crefans-backup-swagger-20261023` 보관.
- 한계: 기존 운영 의존성 경고24건(높음12·보통10·낮음2)은 별도 정비 대상이다. 유연한 JSON 필드까지 생성 SDK 호환을 보장하지 않는다. 실제 결제·PASS·은행 또는 전체 사업 시나리오 검증으로 확대하지 않는다.
- 관리 접속: 이번 배포용 현재 PC 단일 IP의 임시 SSH 규칙을 배포·확인 후 제거했고 기존 관리 PC 규칙만 남았음을 AWS 조회로 확인.


### 2026-10-23 Swagger 유저·스튜디오 / 관리 콘솔 분리 및 운영 배포

- 요청/합격 조건: 문서를 두 페이지로 분리하고 각각 해당 API·모델만 표시. 유저76개, 관리 콘솔25개(관리자22 + 공통 로그인/갱신/로그아웃3), 합집합98개·중복3개. 두 페이지 모두 기존 관리자 열람 제한과 요청 실행 비활성화를 유지한다.
- 구현: `src/platform/openapi.ts`의 단일 계약을 분류해 두 명세를 생성하며 참조 모델·인증 방식·태그도 분리. `/api/v1/admin/docs/user` 및 `/api/v1/admin/docs/console`과 각 JSON/YAML. 기존 문서 진입점은 인증 후 user로302, 종전 통합 원문은404. 상단 전환 링크 제공. 사용 안내는 `docs/platform-api.md`.
- 검증: `npm run test:openapi` 빌드+11/11 통과. 문서 유효성/합집합/분류/권한/HEAD/잘못된 세션/정적파일/실패시차단/계약 누락 대조 검사. 인증·DB 대역과 실제 HTTP 사용, 실제 공급사 호출 없음. amd64 배포 이미지에서76/25/합집합98 생성 확인. 운영 코드181파일 비교에서 openapi.ts만 변경, Prisma·패키지 동일. [검증 증거](docs/swagger-split-20261023.json)에 해시·시각·실행 결과 기록.
- 운영: `swagger-split-20261023` API/worker 배포. health200, 양쪽 도메인/두 문서 HTML·JSON·YAML·assets 비로그인401. 실제 관리자 브라우저에서 기존 경로 자동 이동, 두 제목/범위/상단 전환, 스튜디오 목록 및 콘솔25개 표시, 브라우저 오류 없음 확인. DB/frontend/admin/proxy 컨테이너 유지. 임시 SSH 규칙 제거 및 기존 관리 PC 규칙 보존 확인.
- 범위: 문서·열람 검증이며 실제 PG/PASS/은행·전체 사업 테스트가 아니다. 운영 일반회원/비활성관리자 계정을 새로 만들지 않았고 해당 행렬과 인증 원문 검사는 로컬 대역이다. 기존 의존성 경고는 이전 증거의 한계를 따른다.


### 2026-10-23 Swagger 유저 / 크리에이터 스튜디오 / 관리자 콘솔 3분리

- 요청/합격 조건: 유저와 스튜디오도 각각 분리해 총3개 페이지로 운영 배포. 모든98개 API가 누락 없이 포함되고 각 전용 API·모델은 해당 문서에서만 표시하며 기존 관리자 열람 제한/실행 비활성화를 유지한다.
- 구현: `/api/v1/admin/docs/{user,studio,console}`. 유저55, 스튜디오36(전용21+공통15), 관리자25(전용22+공통인증3). 스튜디오 공통 목록은 실제 StudioRouter/useStudioModel과 인증/미디어/PASS/오류 어댑터 호출을 대조해 선정. 팬 전용 결제/구독과 스튜디오 전용 수익/정산/출금 분리. 상단3개 이동 링크와 개별 JSON/YAML 제공. 사용 안내/규약을 현행화하고 이전2개 문서 기록은 당시 상태로 보존.
- 검증: `npm run test:openapi` 빌드+11/11 통과. 세 문서 유효성/합집합98/정확한 공통 목록/전용 API·모델/권한/HEAD/정적파일/실패시차단/누락 대조. amd64 배포 이미지 생성55/36/25 확인. 운영181파일 대조에서 openapi.ts만 변경, 패키지/Prisma 동일. [검증 증거](docs/swagger-three-20261023.json)에 시각·명령·해시·배포 단계 저장.
- 운영: `swagger-three-20261023` API/worker 배포. 실제 관리자 브라우저에서 서로 다른3개 제목·전환 링크·각각55/36/25 API 표시·스튜디오 검색·경고/오류 없음 확인. 두 도메인/3문서 HTML·JSON·YAML·assets 비로그인401, health200. DB/frontend/admin/proxy 유지, migration/seed/사업 정책 변경 없음. 임시 SSH 규칙 삭제와 기존 관리 PC 규칙만 남은 상태 확인.
- 검증 경계: 일반회원/비활성 관리자 행렬 및 인증된 원문 HTTP 검사는 로컬 인증·DB 대역이고 실운영은 기존 관리자 UI/비로그인 HTTP 검사. 실제 PG/PASS/은행·전체 사업 로직 검증 아님. 기존 의존성 경고는 이전 배포 기록 참고. 다음 API 추가 시 분류·공통 호출 목록도 함께 검사한다.
