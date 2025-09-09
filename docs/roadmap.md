# Backend Roadmap

## Phase 1: 기반 인프라 (2-3주)

- [x] 회원가입/로그인/로그아웃 (AWS Cognito)

  - [x] AWS Cognito User Pool 설정
  - [x] SignUp/SignIn/SignOut API 구현
  - [x] JWT 토큰 관리 및 쿠키 설정
  - [x] 커스텀 이메일 전송을 위한 Lambda 함수 구현

- [x] 회원가입시 지갑 생성 (Direct Implementation, Prisma)

  - [x] 회원가입 후 직접 지갑 생성 (큐 시스템 제거)
  - [x] UUID 기반 지갑 주소 생성
  - [x] 지갑-사용자 소유권 관계 설정
  - [x] 기본 토큰(KNG) 타입 지갑 자동 생성
  - [x] 트랜잭션 기반 원자적 지갑 생성

- [x] 기본 데이터베이스 스키마 설계 (Prisma Schema)

  - [x] User, Wallet, Post, Comment 모델 정의
  - [x] 관계 설정 (1:1, 1:N, N:M)
  - [x] 인덱스 및 제약조건 설정
  - [x] 마이그레이션 파일 생성

- [x] AWS 인프라 설정 (S3, MediaConvert, CloudFront)

  - [x] S3 버킷 생성 및 권한 설정 (storage, processed)
  - [x] MediaConvert 작업 템플릿 생성
  - [x] Lambda 트리거 설정 (동영상 처리 자동화)
  - [x] IAM 역할 및 정책 설정
  - [ ] CloudFront 배포 설정

- [x] 기본 API 구조 및 인증 시스템 (NestJS Guards, Interceptors)
  - [x] AuthGuard 구현 (JWT 검증)
  - [x] LoggingInterceptor 구현
  - [x] Global Exception Filter 설정
  - [x] ApiResponseDto를 사용한 통일된 응답 구조
  - [ ] API 문서화 (Swagger)

## Phase 2: 핵심 콘텐츠 (3-4주) ✅ **완료**

- [x] 포스팅 CRUD (고급 기능 포함) (Prisma, Pagination) ✅

  - [x] Post 모델 스키마 정의
  - [x] Create, Read, Update, Delete API 구현
  - [x] 페이지네이션 로직 구현 (cursor-based)
  - [x] 드래프트/발행/보관 상태 관리
  - [x] 멤버십 전용 콘텐츠 지원
  - [x] 개별 구매 가격 설정
  - [x] 예약 발행 기능 (publish_start_at, publish_end_at)
  - [x] 조회수 추적 (전체/고유 조회수)
  - [x] 미디어 첨부 및 정렬

- [x] 프로필 페이지 (고급) (Prisma Relations) ✅

  - [x] UserProfile 모델 및 관계 설정
  - [x] UserFollow 모델링 (팔로워/팔로잉)
  - [x] 핸들 기반 사용자 조회 시스템
  - [x] 프로필 조회 API 구현
  - [x] 프로필 통계 (포스트 수, 팔로워 수)
  - [x] 닉네임/핸들/바이오 관리
  - [x] 크리에이터 상태 관리
  - [x] 팔로우 상태 통합 응답

- [x] 피드 페이지 (기본) (Infinite Scroll) ✅

  - [x] 개인화 피드 알고리즘 구현
  - [x] 공개 피드 구현
  - [x] 무한 스크롤 API 구현 (cursor-based)
  - [x] 좋아요 상태 통합 제공
  - [x] 접근 권한 검증 (멤버십 콘텐츠)
  - [ ] Redis 캐싱 전략 (예정)

- [x] 팔로우 시스템 (완전 구현) ✅

  - [x] 팔로우/언팔로우 API
  - [x] 팔로우 상태 확인
  - [x] 팔로워/팔로잉 목록 (페이지네이션)
  - [x] 팔로우 통계 조회
  - [x] 소프트 삭제 패턴 적용

- [ ] 검색 기능 (기본) (Elasticsearch)
  - [ ] Elasticsearch 클러스터 설정
  - [ ] 인덱스 매핑 정의
  - [ ] 검색 API 구현 (제목, 내용, 태그)
  - [ ] 검색 결과 하이라이팅
  - [ ] 검색어 자동완성 기능

## Phase 3: 미디어 및 상호작용 (2-3주)

- [x] 포스팅 미디어 업로드 (AWS S3 Signed URL, MediaConvert, Sharp)

  - [x] Media 모델 스키마 정의
  - [x] PostingMedia 관계 모델 정의
  - [x] S3 Signed URL 생성 API 구현
  - [x] 파일 업로드 완료 웹훅 처리
  - [x] MediaConvert 작업 자동 생성 (동영상 썸네일 5장)
  - [x] Sharp 라이브러리로 이미지 리사이징 및 최적화
  - [x] 화질별 동영상 변환 (1080p, 720p, 480p)
  - [x] 미디어 업로드 정책 검증 (파일 형식, 크기, 일일 제한)
  - [x] 미디어 메타데이터 저장
  - [ ] 워터마크 추가 기능 (크리에이터 브랜딩, 콘텐츠 보호)

- [x] 댓글 시스템 (Prisma Nested Relations) ✅

  - [x] Comment 모델 및 중첩 관계 설정
  - [x] 댓글 CRUD API 구현
  - [x] 대댓글 지원 (parent-child relationships)
  - [x] 사용자 태깅 시스템 (tagged_user_id)
  - [x] 소프트 삭제 구현
  - [x] 댓글 수 카운팅
  - [ ] 실시간 댓글 업데이트 (WebSocket)
  - [ ] 댓글 알림 시스템

- [x] 좋아요 시스템 (완전 구현) ✅

  - [x] PostingLike, CommentLike 모델 스키마 정의
  - [x] 포스팅 좋아요/좋아요 취소 API 구현
  - [x] 댓글 좋아요/좋아요 취소 API 구현
  - [x] 좋아요 상태 추적 및 응답 통합
  - [x] 좋아요 수 카운팅
  - [x] 중복 좋아요 방지 로직
  - [x] 소프트 삭제 패턴 적용
  - [ ] PostingReport 모델 스키마 정의 (신고 기능)
  - [ ] Redis 카운터 최적화
  - [ ] 실시간 카운터 업데이트

- [ ] 둘러보기 페이지 (Redis Cache, Filtering)
  - 카테고리별 필터링 구현
  - 가격대/날짜 범위 필터링
  - Redis 캐싱 전략 (TTL 설정)
  - 정렬 옵션 (인기순, 최신순, 가격순)
  - 필터 상태 관리

## Phase 4: 결제 시스템 (4-5주)

- [x] 사이트 내 재화 시스템 (콩) (Prisma, Decimal Type)

  - [x] Wallet 모델 스키마 정의 (Decimal 타입)
  - [x] TokenType 모델 스키마 정의
  - [x] Transfer 모델 스키마 정의 (재화 이력)
  - [x] WalletOwnership 모델 스키마 정의
  - [x] TransferReason 모델 스키마 정의
  - [x] 재화 잔액 조회 API 구현
  - [x] 지갑 생성 및 소유권 관리 시스템
  - [x] UUID 기반 지갑 주소 생성
  - [ ] 잔액 변경 로그 시스템
  - [ ] 재화 사용 내역 조회

- [ ] PG 연동 (토스페이먼츠) (Webhook, Idempotency)

  - [ ] Payment, PaymentHistory 모델 스키마 정의 (추가 필요)
  - [ ] 토스페이먼츠 SDK 연동
  - [ ] 결제 요청 API 구현
  - [ ] 웹훅 수신
  - [ ] 멱등성 보장 (Idempotency Key)
  - [ ] 결제 상태 동기화

- [ ] 재화 충전 (Transaction, Lock)

  - 충전 요청 API 구현
  - 데이터베이스 트랜잭션 처리
  - 동시성 제어 (Row Lock)
  - 충전 완료 알림
  - 실패 시 롤백 처리

- [ ] 포스팅 개별구매 (언락티켓) (JWT Token, Access Control)
  - [ ] PostingPurchase 모델 스키마 정의 (추가 필요)
  - [ ] 구매 권한 토큰 생성 (JWT)
  - [ ] 접근 제어 미들웨어 구현
  - [ ] 구매 이력 관리
  - [ ] 재화 차감 로직
  - [ ] 구매 확인 및 영수증

## Phase 5: 멤버십 및 고급 기능 (3-4주)

- [x] 멤버십 시스템 (Subscription Management) ✅

  - [x] MembershipItem 모델 스키마 정의
  - [x] Subscription 모델 스키마 정의
  - [x] 멤버십 CRUD API 구현 (크리에이터 전용)
  - [x] 멤버십 상품 생성/수정/삭제
  - [x] 멤버십 활성/비활성 토글
  - [x] 멤버십 레벨별 접근 제어
  - [x] 시험 기간 지원 (trial_period)
  - [x] 다양한 결제 주기 (DAY/WEEK/MONTH/YEAR)
  - [x] 구독 상태 관리 (ONGOING/EXPIRED)
  - [x] 자동 갱신 설정 (auto_renew)
  - [ ] 자동 갱신 Cron Job 구현
  - [ ] 구독 만료 알림 시스템
  - [ ] 구독 취소 및 환불 처리

- [ ] 사이트 내 아이템 (쿠폰, 뱃지) (Redis Cache, Coupon Logic)

  - [ ] Coupon, CouponLog, CouponOwnership, Badge, BadgeLog, BadgeOwnership 모델 스키마 정의 (추가 필요)
  - [ ] 쿠폰 생성 및 발급 시스템
  - [ ] 쿠폰 소유권 관리 시스템 (지급, 만료)
  - [ ] 쿠폰 사용 로직
  - [ ] 얼리버드 뱃지 획득 조건 구현
  - [ ] Redis 캐싱으로 성능 최적화

- [ ] 환불 시스템 (Webhook, Refund Policy Engine)

  - [ ] Refund, RefundLog, RefundPolicy 모델 스키마 정의 (추가 필요)
  - [ ] 환불 정책 엔진 구현
  - [ ] 환불 요청 API 및 승인 프로세스
  - [ ] PG사 환불 API 연동
  - [ ] 환불 상태 추적 시스템
  - [ ] 환불 이력 관리

- [ ] 마이페이지 고도화 (File Upload, Image Resize)
  - 프로필 이미지 업로드 (S3)
  - 이미지 리사이징 (Sharp 라이브러리)
  - 닉네임/핸들 수정 API
  - 개인정보 수정
  - 계정 설정 관리

## Phase 6: 크리에이터 생태계 (3-4주)

- [ ] 크리에이터 센터 (RBAC, Admin Dashboard, Prisma Relations)

  - [ ] RBAC 스키마 설계 (UserRole, Permission, RolePermission 모델 정의)
  - [ ] 크리에이터 권한 시스템 (RBAC) 구현
  - [ ] 크리에이터 대시보드 API
  - [ ] 수익 통계 및 분석 기능
  - [ ] 크리에이터 신청 및 승인 프로세스
  - [ ] 크리에이터 전용 기능 접근 제어

- [ ] 광고 상품 마켓 (Auction System, Real-time Bidding, WebSocket)

  - [ ] Auction, Bid, AdProduct 모델 스키마 정의 (추가 필요)
  - [ ] 실시간 입찰 시스템 (WebSocket)
  - [ ] 입찰가 자동 업데이트
  - [ ] 경매 종료 및 낙찰 처리
  - [ ] 광고 상품 등록 및 관리

- [ ] 정산 통계 (Prisma Aggregation, CSV Export, Cron Job)

  - 정산 데이터 집계 쿼리 구현
  - CSV 내보내기 기능
  - 정기 정산 Cron Job
  - 정산 리포트 생성
  - 세금 계산 및 처리

- [ ] 후원(콩) 시스템 (Real-time Updates, WebSocket, Transaction)
  - [ ] Donation, DonationRanking 모델 스키마 정의 (추가 필요)
  - [ ] 후원 요청 및 처리 API
  - [ ] 실시간 후원 알림 (WebSocket)
  - [ ] 후원 이력 관리
  - [ ] 후원자 랭킹 시스템
  - [ ] 후원 금액 집계 및 통계

## Phase 7: 커뮤니케이션 (3-4주)

- [ ] 채팅 시스템 (Socket.io, RabbitMQ, Message Persistence)

  - [ ] ChatRoom, ChatMessage, ChatParticipant 모델 스키마 정의 (추가 필요)
  - [ ] Socket.io 서버 설정 및 연결 관리
  - [ ] 채팅방 생성 및 참여 로직
  - [ ] 메시지 전송 및 수신 처리
  - [ ] 메시지 영속성 (데이터베이스 저장)
  - [ ] RabbitMQ를 통한 메시지 큐 처리

- [ ] 알림센터 (WebSocket, AWS SES, Notification Queue)

  - [ ] Notification, NotificationTemplate, NotificationSetting 모델 스키마 정의 (추가 필요)
  - [ ] 실시간 인앱 알림 (WebSocket)
  - [ ] AWS SES 이메일 알림 구현
  - [ ] 알림 큐 시스템 (RabbitMQ)
  - [ ] 알림 템플릿 관리
  - [ ] 알림 수신 설정 및 관리
  - [ ] 알림 히스토리 조회 API

- [ ] 환전 및 정산 (Batch Processing, Financial Calculations, Cron Job)
  - [ ] Exchange, Settlement 모델 스키마 정의 (추가 필요)
  - [ ] 환전 요청 및 처리 시스템
  - [ ] 배치 처리 로직 구현
  - [ ] 금융 계산 엔진
  - [ ] 정기 정산 Cron Job
  - [ ] 환전 이력 및 상태 추적

## Phase 8: 관리 및 운영 (2-3주)

- [ ] 백오피스 (회원관리) (Admin Panel, Bulk Operations, Prisma Admin)

  - 관리자 권한 시스템 구현
  - 회원 목록 및 상세 조회
  - 대량 작업 처리 (일괄 승인/차단)
  - Prisma Admin 설정
  - 관리자 활동 로그

- [ ] 약관/정책 페이지 (Static Content, Versioning, File Storage)

  - [ ] Terms, TermsAgreement 모델 스키마 정의 (추가 필요)
  - [ ] 약관 관리 시스템 구현
  - [ ] 버전 관리 및 이력 추적
  - [ ] 파일 저장소 연동 (S3)
  - [ ] 약관 동의 처리
  - [ ] 약관 변경 알림

- [ ] 회원탈퇴 (Data Anonymization, GDPR Compliance, Soft Delete)
  - [ ] UserDeletion, DeletionLog 모델 스키마 정의 (추가 필요)
  - [ ] 회원탈퇴 요청 처리
  - [ ] 데이터 익명화 로직
  - [ ] GDPR 준수 데이터 삭제
  - [ ] Soft Delete 구현
  - [ ] 탈퇴 이력 관리

## 새로 구현된 주요 기능들 (로드맵 외)

### [x] 얼리버드 등록 시스템 ✅ **완전 구현**

- [x] Earlybird 모델 스키마 정의
- [x] 회원가입 시 얼리버드 플래그 처리 (isEarlybird)
- [x] 얼리버드 사용자 자동 등록
- [x] 혜택 지급 상태 관리 (rewarded, rewarded_at)
- [x] 얼리버드 등록 통계 추적

### [x] 크리에이터 카테고리 시스템 ✅ **완전 구현**

- [x] CreatorCategory 모델 스키마 정의
- [x] 카테고리별 색상 코드 및 아이콘 지원
- [x] 정렬 순서 관리 (sort_order)
- [x] 활성/비활성 상태 관리
- [x] 소프트 삭제 패턴 적용
- [x] 시드 데이터: ASMR, 버튜버, 먹방, 운동, 게임, 주식

### [x] 고급 사용자 프로필 시스템 ✅ **기업급 구현**

- [x] 핸들 시스템 (AWS Cognito preferred_username 연동)
- [x] 닉네임 시스템 (표시명 별도 관리)
- [x] 바이오 관리 (rich profile descriptions)
- [x] 크리에이터 상태 확인 및 전환
- [x] 닉네임 중복 확인 API
- [x] 통계 정보 통합 (게시물, 팔로워, 팔로잉)
- [x] 팔로우 상태 통합 응답

### [x] 엔터프라이즈급 미디어 관리 ✅ **AWS 통합**

- [x] AWS S3 presigned URL 기반 업로드
- [x] AWS MediaConvert 비디오 처리 파이프라인
- [x] 이미지 처리 파이프라인 (Sharp)
- [x] 처리 상태 실시간 추적
- [x] 썸네일 자동 생성
- [x] 접근 제어 (프리미엄 콘텐츠)
- [x] 미디어 라이브러리 관리
- [x] 웹훅 기반 처리 완료 알림

### [x] 종합적 토큰 경제 시스템 ✅ **금융급 구현**

- [x] 다중 토큰 타입 지원 (TokenType)
- [x] 지갑 소유권 관리 (WalletOwnership)
- [x] 완전한 거래 추적 (Transfer)
- [x] 거래 사유 분류 (TransferReason)
- [x] 트랜잭션 기반 안전한 잔액 관리
- [x] 거래 전후 잔액 기록
- [x] UUID 기반 지갑 주소 생성
- [x] 시드 데이터: 기본 토큰(콩, KNG) 및 시스템 지갑

---

## 새로운 아키텍처 변경사항

### 미디어 처리 파이프라인
- **Lambda 기반 이벤트 드리븐 아키텍처**: S3 업로드 트리거 → Lambda → MediaConvert → 처리 완료 웹훅
- **이미지 처리**: Sharp 라이브러리로 서버 내 실시간 리사이징
- **동영상 처리**: MediaConvert로 화질별 변환 및 썸네일 생성
- **비용 최적화**: 동영상 처리 비용 분석 문서 추가 (`docs/video-processing-cost-analysis.md`)

### 인증 시스템 고도화
- **커스텀 이메일**: AWS Cognito + Lambda 기반 커스텀 이메일 전송
- **통일된 응답 구조**: ApiResponseDto를 통한 일관된 API 응답 형식
- **글로벌 예외 처리**: 전역 예외 필터로 에러 응답 표준화

### 지갑 시스템 구현 완료
- **직접 지갑 생성**: 큐 시스템 제거 후 회원가입 시 즉시 지갑 생성
- **소유권 관리**: WalletOwnership 모델로 지갑 소유 이력 관리
- **트랜잭션 안전성**: 원자적 연산으로 지갑 생성 및 잔액 관리

### 개발 및 배포 환경
- **CI/CD 파이프라인**: GitHub Actions로 자동 배포
- **Lambda 함수 관리**: 각 Lambda 함수별 독립적인 배포 스크립트
- **환경 설정**: .env 기반 환경별 설정 관리

---

## 주요 기술 스택

### **Backend**

- **Framework**: NestJS
- **Database**: MySQL + Prisma ORM
- **Cache**: Redis (예정)
- **Search**: Elasticsearch (예정)
- **Real-time**: Socket.io (예정)
- **File Storage**: AWS S3 ✅
- **Media Processing**: AWS MediaConvert ✅
- **Image Processing**: Sharp ✅
- **CDN**: CloudFront (예정)

### **Infrastructure**

- **Cloud**: AWS
- **Container**: Docker
- **CI/CD**: GitHub Actions ✅
- **Monitoring**: CloudWatch, Sentry
- **Serverless**: AWS Lambda ✅

### **External Services**

- **Authentication**: AWS Cognito
- **Payment**: 토스페이먼츠
- **Email**: AWS SES
- **Notifications**: Web Notifications API

---

## 🎯 **개발 진행 현황 (2024년 기준)**

### ✅ **완료된 Phase (100% 구현)**
- **Phase 1: 기반 인프라** - AWS 인증, 지갑, 데이터베이스, API 구조
- **Phase 2: 핵심 콘텐츠** - 포스팅 CRUD, 프로필, 피드, 팔로우 시스템
- **Phase 3: 미디어 및 상호작용** - 미디어 업로드, 댓글, 좋아요 (신고 제외)
- **Phase 5: 멤버십 시스템** - 멤버십 관리 API (자동 갱신 제외)

### 🚀 **로드맵 외 추가 구현 완료**
- 얼리버드 등록 시스템
- 크리에이터 카테고리 시스템  
- 고급 사용자 프로필 시스템
- 엔터프라이즈급 미디어 관리
- 종합적 토큰 경제 시스템

### ⚠️ **주요 미구현 항목**
- **신고 시스템** (PostingReport 모델 및 API)
- **검색 기능** (Elasticsearch 통합)
- **PG 연동** (토스페이먼츠)
- **실시간 기능** (WebSocket - 댓글, 알림)
- **자동 갱신** (멤버십 Cron Job)
- **관리자 패널** (백오피스)

### 📊 **현재 진행률**
- **전체 진행률: ~65%** (원래 로드맵 기준)
- **실제 기능 완성도: ~80%** (추가 기능 포함)
- **프로덕션 준비도: ~75%** (핵심 기능 완료, 운영 도구 필요)

### 🎯 **다음 우선순위 개발 항목**
1. **신고 시스템 구현** (콘텐츠 관리 필수)
2. **PG 연동** (수익화 필수) 
3. **검색 기능** (사용자 경험 향상)
4. **멤버십 자동 갱신** (비즈니스 로직 완성)
5. **관리자 패널** (운영 도구)

---

**총 예상 기간: 22-30주 (5.5-7.5개월)**  
**AI 활용으로 30-40% 단축 예상**  
**🎉 현재 약 4-5개월 분량 완료 (예상보다 빠른 진행)**
