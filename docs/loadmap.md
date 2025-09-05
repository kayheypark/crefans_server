# Backend Roadmap

## Phase 1: 기반 인프라 (2-3주)

- [x] 회원가입/로그인/로그아웃 (AWS Cognito)

  - AWS Cognito User Pool 설정
  - SignUp/SignIn/SignOut API 구현
  - JWT 토큰 관리 및 쿠키 설정

- [ ] 회원가입시 지갑 생성 (RabbitMQ Queue, Prisma)

  - RabbitMQ 설치 및 설정
  - 지갑 생성 큐 정의
  - 회원가입 후 큐에 메시지 발행
  - 큐 컨슈머 구현 (지갑 생성 로직)
  - 실패 시 재시도 메커니즘

- [x] 기본 데이터베이스 스키마 설계 (Prisma Schema)

  - [x] User, Wallet, Post, Comment 모델 정의
  - [x] 관계 설정 (1:1, 1:N, N:M)
  - [x] 인덱스 및 제약조건 설정
  - [x] 마이그레이션 파일 생성

- [ ] AWS 인프라 설정 (S3, MediaConvert, CloudFront)

  - S3 버킷 생성 및 권한 설정
  - MediaConvert 작업 템플릿 생성
  - CloudFront 배포 설정
  - IAM 역할 및 정책 설정

- [ ] 기본 API 구조 및 인증 시스템 (NestJS Guards, Interceptors)
  - AuthGuard 구현 (JWT 검증)
  - LoggingInterceptor 구현
  - Global Exception Filter 설정
  - API 문서화 (Swagger)

## Phase 2: 핵심 콘텐츠 (3-4주)

- [ ] 포스팅 CRUD (텍스트만) (Prisma, Pagination)

  - [x] Post 모델 스키마 정의
  - [ ] Create, Read, Update, Delete API 구현
  - [ ] 페이지네이션 로직 구현 (cursor-based)

- [ ] 프로필 페이지 (기본) (Prisma Relations)

  - [ ] User-Profile 관계 설정 (User, Profile 모델 추가 필요)
  - [ ] 팔로워/팔로잉 관계 모델링 (Follow 모델 추가 필요)
  - [ ] 프로필 조회 API 구현
  - [ ] 프로필 통계 (포스트 수, 팔로워 수)
  - [ ] 프로필 이미지 업로드 (S3)

- [ ] 피드 페이지 (기본) (Redis Cache, Infinite Scroll)

  - 피드 알고리즘 구현 (최신순, 인기순)
  - Redis 캐싱 전략 설계
  - 무한 스크롤 API 구현
  - 캐시 무효화 전략
  - 성능 최적화 (N+1 쿼리 방지)

- [ ] 검색 기능 (기본) (Elasticsearch)
  - Elasticsearch 클러스터 설정
  - 인덱스 매핑 정의
  - 검색 API 구현 (제목, 내용, 태그)
  - 검색 결과 하이라이팅
  - 검색어 자동완성 기능

## Phase 3: 미디어 및 상호작용 (2-3주)

- [ ] 포스팅 미디어 업로드 (AWS S3 Signed URL, MediaConvert, Sharp)

  - [x] Media 모델 스키마 정의
  - [x] PostingMedia 관계 모델 정의
  - [ ] S3 Signed URL 생성 API 구현
  - [ ] 파일 업로드 완료 웹훅 처리
  - [ ] 포스트 발행 시 MediaConvert 작업 생성 (동영상 썸네일)
  - [ ] Sharp 라이브러리로 이미지 리사이징 및 최적화
  - [ ] 워터마크 추가 기능 (크리에이터 브랜딩, 콘텐츠 보호)
  - [ ] 미디어 메타데이터 저장

- [ ] 댓글 시스템 (Prisma Nested Relations, WebSocket)

  - [x] Comment 모델 및 중첩 관계 설정
  - [ ] 댓글 CRUD API 구현
  - [ ] 실시간 댓글 업데이트 (WebSocket)
  - [ ] 댓글 알림 시스템
  - [ ] 댓글 신고 및 차단 기능

- [ ] 좋아요/신고 (Redis Counter, Event Sourcing)

  - [x] PostingLike 모델 스키마 정의
  - [ ] PostingReport 모델 스키마 정의 (추가 필요)
  - [ ] Redis 카운터 구현 (좋아요 수)
  - [ ] 이벤트 소싱 패턴 적용
  - [ ] 좋아요/신고 API 구현
  - [ ] 중복 방지 로직 (Redis Set)
  - [ ] 실시간 카운터 업데이트

- [ ] 둘러보기 페이지 (Redis Cache, Filtering)
  - 카테고리별 필터링 구현
  - 가격대/날짜 범위 필터링
  - Redis 캐싱 전략 (TTL 설정)
  - 정렬 옵션 (인기순, 최신순, 가격순)
  - 필터 상태 관리

## Phase 4: 결제 시스템 (4-5주)

- [ ] 사이트 내 재화 시스템 (콩) (Prisma, Decimal Type)

  - [x] Wallet 모델 스키마 정의 (Decimal 타입)
  - [x] TokenType 모델 스키마 정의
  - [x] Transfer 모델 스키마 정의 (재화 이력)
  - [ ] 재화 잔액 조회 API
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

- [ ] 멤버십 시스템 (Cron Job, Subscription Management)

  - [x] MembershipItem 모델 스키마 정의
  - [x] Subscription 모델 스키마 정의
  - [ ] 자동 갱신 Cron Job 구현 (서버 중지 시 누락된 갱신 처리 로직 포함)
  - [ ] 구독 만료 알림 시스템
  - [ ] 멤버십 혜택 적용 로직
  - [ ] 구독 취소 및 환불 처리
  - [ ] 과거 갱신 처리건 검증 및 보정 로직

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

---

## 주요 기술 스택

### **Backend**

- **Framework**: NestJS
- **Database**: PostgreSQL + Prisma ORM
- **Cache**: Redis
- **Queue**: RabbitMQ
- **Search**: Elasticsearch
- **Real-time**: Socket.io
- **File Storage**: AWS S3
- **Media Processing**: AWS MediaConvert
- **CDN**: CloudFront

### **Infrastructure**

- **Cloud**: AWS
- **Container**: Docker
- **CI/CD**: GitHub Actions
- **Monitoring**: CloudWatch, Sentry

### **External Services**

- **Authentication**: AWS Cognito
- **Payment**: 토스페이먼츠
- **Email**: AWS SES
- **Notifications**: Web Notifications API

---

**총 예상 기간: 22-30주 (5.5-7.5개월)**
**AI 활용으로 30-40% 단축 예상**
