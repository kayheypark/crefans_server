# Database Schema Documentation

이 문서는 crefans_server의 데이터베이스 스키마를 설명합니다.

## 개요

- **데이터베이스**: MySQL
- **ORM**: Prisma
- **Schema 파일**: `prisma/schema.prisma`

## 핵심 엔티티

### 1. 사용자 관리 (User Management)

#### UserProfile
사용자의 추가 프로필 정보를 관리합니다.
```prisma
model UserProfile {
  user_id    String   @id          // Cognito userSub
  bio        String?  @db.Text     // 소개글
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
```

#### Creator
크리에이터로 전환한 사용자의 정보를 관리합니다.
```prisma
model Creator {
  id          String           @id @default(uuid())
  user_id     String           @unique  // Cognito userSub
  is_active   Boolean          @default(true)
  category_id String?                   // 크리에이터 카테고리
  created_at  DateTime         @default(now())
  updated_at  DateTime         @updatedAt
}
```

#### CreatorCategory
크리에이터의 분류를 위한 카테고리입니다.
```prisma
model CreatorCategory {
  id          String    @id @default(uuid())
  name        String    @unique
  description String?   @db.Text
  color_code  String?   @db.VarChar(7)  // 색상 코드
  icon        String?                    // 이모지/아이콘
  sort_order  Int       @default(0)
  is_active   Boolean   @default(true)
  is_deleted  Boolean   @default(false)
  deleted_at  DateTime?
}
```

### 2. 콘텐츠 관리 (Content Management)

#### Posting
크리에이터가 작성하는 게시글입니다.
```prisma
model Posting {
  id                        String         @id @default(uuid())
  title                     String
  content                   String         @db.Text
  status                    PostingStatus  @default(DRAFT)
  is_membership             Boolean        @default(false)
  membership_level          Int?
  publish_start_at          DateTime?
  publish_end_at            DateTime?
  total_view_count          Int            @default(0)
  unique_view_count         Int            @default(0)
  like_count                Int            @default(0)
  comment_count             Int            @default(0)
  allow_individual_purchase Boolean        @default(false)
  individual_purchase_price Decimal?       @db.Decimal(10, 0)
  is_public                 Boolean        @default(true)
  is_sensitive              Boolean        @default(false)
  user_sub                  String         // 크리에이터 ID
  allow_comments            Boolean        @default(true)
}
```

#### Media
포스팅에 첨부되는 미디어 파일 정보입니다.
```prisma
model Media {
  id                String           @id @default(uuid())
  type              MediaType        // IMAGE, VIDEO, AUDIO
  original_name     String
  file_name         String
  file_size         Int
  mime_type         String
  original_url      String
  processing_status ProcessingStatus @default(UPLOADING)
  s3_upload_key     String
  user_sub          String          // 소유자 ID
}
```

#### Comment
포스팅에 달리는 댓글입니다.
```prisma
model Comment {
  id             String        @id @default(uuid())
  posting_id     String
  author_id      String       // Cognito userSub
  tagged_user_id String?      // 태그된 사용자
  content        String       @db.Text
  parent_id      String?      // 대댓글인 경우
  is_deleted     Boolean      @default(false)
  deleted_at     DateTime?
}
```

### 3. 소셜 기능 (Social Features)

#### UserFollow
사용자 간의 팔로우/팔로잉 관계를 관리합니다.
```prisma
model UserFollow {
  id           String    @id @default(uuid())
  follower_id  String    // 팔로우를 하는 사용자
  following_id String    // 팔로우를 받는 사용자
  followed_at  DateTime  @default(now())
  deleted_at   DateTime? // 언팔로우 시점
}
```

#### PostingLike
포스팅에 대한 좋아요 정보입니다.
```prisma
model PostingLike {
  id         String    @id @default(uuid())
  posting_id String
  user_id    String    // Cognito userSub
  is_deleted Boolean   @default(false)
  deleted_at DateTime?
}
```

#### CommentLike
댓글에 대한 좋아요 정보입니다.
```prisma
model CommentLike {
  id         String    @id @default(uuid())
  comment_id String
  user_id    String    // Cognito userSub
  is_deleted Boolean   @default(false)
  deleted_at DateTime?
}
```

### 4. 결제 및 구독 (Payment & Subscription)

#### TokenType
시스템에서 사용되는 토큰의 타입을 관리합니다.
```prisma
model TokenType {
  id          String     @id @default(uuid())
  symbol      String     @unique  // 예: "KNG"
  name        String                // 예: "콩"
  description String?
  price       Decimal    @db.Decimal(18, 4)  // KRW 기준
}
```

#### Wallet
실제 토큰이 보관되는 지갑입니다.
```prisma
model Wallet {
  id            String            @id @default(uuid())
  address       String            @unique
  token_type_id String
  amount        Decimal           @default(0.0000) @db.Decimal(18, 4)
  ownerships    WalletOwnership[] // 소유권 정보
}
```

#### MembershipItem
크리에이터가 판매하는 멤버십 상품입니다.
```prisma
model MembershipItem {
  id             String         @id @default(uuid())
  name           String
  level          Int            @default(1)
  creator_id     String         // Cognito userSub
  price          Decimal        @db.Decimal(18, 4)
  billing_unit   PeriodUnit     // DAY, WEEK, MONTH, YEAR
  billing_period Int            @default(1)
  trial_unit     PeriodUnit     @default(DAY)
  trial_period   Int?           @default(0)
  benefits       String         @db.Text
  is_active      Boolean        @default(true)
}
```

#### Subscription
크리에이터와 구독자 간의 구독 관계입니다.
```prisma
model Subscription {
  id                    String             @id @default(uuid())
  subscriber_id         String             // 구독자 ID
  membership_item_id    String
  started_at            DateTime           @default(now())
  ended_at              DateTime?
  status                SubscriptionStatus @default(ONGOING)
  amount                Decimal            @db.Decimal(18, 4)
  auto_renew            Boolean            @default(true)
  billing_key           String?            // TossPayments 빌링키
  next_billing_date     DateTime?
  payment_failure_count Int                @default(0)
}
```

#### PaymentTransaction
TossPayments를 통한 실제 결제 거래 기록입니다.
```prisma
model PaymentTransaction {
  id              String        @id @default(uuid())
  order_id        String        @unique
  payment_key     String?       @unique  // TossPayments 결제키
  user_id         String        // Cognito userSub
  amount          Decimal       @db.Decimal(10, 0)
  token_amount    Decimal       @db.Decimal(18, 4)
  token_type_id   String
  status          PaymentStatus @default(PENDING)
  subscription_id String?       // 정기결제용
  is_recurring    Boolean       @default(false)
}
```

### 5. 게시판 (Board)

#### BoardCategory
게시판 카테고리를 동적으로 관리합니다.
```prisma
model BoardCategory {
  id          String  @id @default(uuid())
  code        String  @unique  // NOTICE, EVENT 등
  name        String
  description String?
  sort_order  Int     @default(0)
  is_public   Boolean @default(true)
  is_active   Boolean @default(true)
}
```

#### Board
공지사항 및 이벤트 게시글입니다.
```prisma
model Board {
  id           String        @id @default(uuid())
  title        String
  content      String        @db.Text
  category_id  String
  is_important Boolean       @default(false)
  excerpt      String?       @db.Text
  author       String        @default("크리팬스 관리자")
  views        Int           @default(0)
  is_published Boolean       @default(true)
  published_at DateTime?
}
```

### 6. 관리자 (Admin)

#### Admin
시스템 관리를 위한 관리자 계정 정보입니다.
```prisma
model Admin {
  id         String    @id @default(uuid())
  user_sub   String    @unique  // Cognito userSub
  name       String
  email      String    @unique
  role       AdminRole @default(MODERATOR)
  is_active  Boolean   @default(true)
  last_login DateTime?
  created_by String?   // 상위 관리자
}
```

#### UserReport
사용자 신고 기능입니다.
```prisma
model UserReport {
  id          String       @id @default(uuid())
  reporter_id String       // 신고자 ID
  target_type ReportTarget // USER, POSTING, COMMENT
  target_id   String       // 신고 대상 ID
  reason      ReportReason // SPAM, HARASSMENT 등
  description String?      @db.Text
  status      ReportStatus @default(PENDING)
  admin_id    String?      // 처리 관리자
  admin_note  String?      @db.Text
  resolved_at DateTime?
}
```

#### UserSuspension
사용자의 정지/활성화 이력을 관리합니다.
```prisma
model UserSuspension {
  id         String           @id @default(uuid())
  user_id    String           // 대상 사용자 ID
  type       SuspensionType   // WARNING, TEMPORARY, PERMANENT
  reason     String           @db.Text
  start_date DateTime         @default(now())
  end_date   DateTime?        // null인 경우 무기한
  status     SuspensionStatus @default(ACTIVE)
  admin_id   String           // 처리 관리자
}
```

## Enums

### PostingStatus
```prisma
enum PostingStatus {
  DRAFT      // 초안
  PUBLISHED  // 발행됨
  ARCHIVED   // 보관됨
}
```

### MediaType
```prisma
enum MediaType {
  IMAGE
  VIDEO
  AUDIO
}
```

### SubscriptionStatus
```prisma
enum SubscriptionStatus {
  ONGOING   // 진행중
  EXPIRED   // 만료됨
  CANCELLED // 취소됨
}
```

### PaymentStatus
```prisma
enum PaymentStatus {
  PENDING   // 결제 대기중
  APPROVED  // 결제 승인됨
  CANCELLED // 결제 취소됨
  FAILED    // 결제 실패
  REFUNDED  // 환불됨
}
```

### AdminRole
```prisma
enum AdminRole {
  SUPER_ADMIN // 최고 관리자
  ADMIN       // 일반 관리자
  MODERATOR   // 모더레이터(포스팅 관리자)
}
```

## 주요 관계 (Relationships)

1. **User ↔ Creator**: 1:1 관계 (사용자는 크리에이터가 될 수 있음)
2. **Creator ↔ Posting**: 1:N 관계 (크리에이터는 여러 포스팅 작성)
3. **Posting ↔ Media**: N:M 관계 (PostingMedia를 통한 연결)
4. **User ↔ Subscription**: N:M 관계 (사용자는 여러 구독 가능)
5. **Creator ↔ MembershipItem**: 1:N 관계 (크리에이터는 여러 멤버십 상품 판매)

## 인덱스 전략

- 자주 검색되는 필드에 인덱스 적용
- 복합 인덱스 활용 (예: user_id + created_at)
- 외래키에 자동 인덱스 생성

## 데이터 마이그레이션

마이그레이션은 Prisma를 통해 관리됩니다:
```bash
npx prisma migrate dev      # 개발 환경
npx prisma migrate deploy   # 프로덕션 환경
```

## 시드 데이터

초기 데이터는 `prisma/seed.ts`에서 관리됩니다:
- 기본 토큰 타입 (콩)
- 시스템 지갑
- 크리에이터 카테고리
- 게시판 카테고리 (공지, 이벤트)
- 관리자 계정