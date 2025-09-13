# crefans_server 제품 요구사항 문서 (PRD)

## 목차
1. [개요](#개요)
2. [제품 개요](#제품-개요)  
3. [기술 아키텍처](#기술-아키텍처)
4. [핵심 기능 및 요구사항](#핵심-기능-및-요구사항)
5. [사용자 플로우](#사용자-플로우)
6. [API 명세](#api-명세)
7. [데이터베이스 설계](#데이터베이스-설계)
8. [미디어 처리 파이프라인](#미디어-처리-파이프라인)
9. [보안 및 인증](#보안-및-인증)
10. [향후 고려사항](#향후-고려사항)

## 개요

### 프로젝트 개요
crefans_server는 크리에이터와 팬들을 연결하는 구독 기반 콘텐츠 플랫폼의 백엔드 시스템입니다. 크리에이터들이 멤버십 기반으로 독점 콘텐츠를 제공하고, 팬들은 구독을 통해 프리미엄 콘텐츠에 접근할 수 있는 생태계를 제공합니다.

### 개발 배경 및 목적
- 크리에이터 경제 지원을 위한 수익 창출 플랫폼
- 구독 모델을 통한 지속가능한 수익 구조 제공
- 고품질 미디어 콘텐츠의 안전한 배포 및 접근 제어
- 토큰 기반 경제 시스템을 통한 새로운 창작자 지원 모델

## 제품 개요

### 주요 특징
1. **멤버십 기반 구독 시스템**: 레벨별 차등화된 멤버십 제공
2. **고급 미디어 처리**: AWS MediaConvert를 활용한 비디오 처리 및 다중 해상도 지원
3. **토큰 경제 시스템**: KNG 토큰을 활용한 창작자 지원 및 거래
4. **보안 미디어 접근**: 멤버십 레벨에 따른 콘텐츠 접근 제어
5. **소셜 기능**: 팔로우, 좋아요, 댓글 등 상호작용 기능

### 대상 사용자
- **크리에이터**: 독점 콘텐츠를 제작하고 멤버십을 통해 수익을 창출하는 사용자
- **구독자/팬**: 좋아하는 크리에이터의 콘텐츠를 구독하고 소비하는 사용자
- **일반 사용자**: 무료 콘텐츠를 탐색하고 크리에이터를 팔로우하는 사용자

## 기술 아키텍처

### 전체 시스템 구조
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   NestJS API     │    │   AWS Services  │
│   (External)    │◄──►│   Server         │◄──►│                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌──────────────┐         ┌─────────────────┐
                       │   MySQL      │         │   S3, Cognito,  │
                       │   Database   │         │   MediaConvert  │
                       └──────────────┘         └─────────────────┘
```

### 기술 스택
- **프레임워크**: NestJS (Node.js 기반)
- **데이터베이스**: MySQL (Prisma ORM)
- **인증**: AWS Cognito
- **미디어 저장**: AWS S3
- **미디어 처리**: AWS MediaConvert
- **서버리스**: AWS Lambda
- **언어**: TypeScript
- **패키지 매니저**: npm

### 주요 외부 의존성
- **@nestjs/core**: NestJS 프레임워크 코어
- **@prisma/client**: 데이터베이스 ORM
- **@aws-sdk/client-cognito-identity-provider**: AWS Cognito 인증
- **@aws-sdk/client-s3**: AWS S3 스토리지
- **@aws-sdk/client-mediaconvert**: AWS 미디어 변환
- **sharp**: 이미지 처리 라이브러리

## 핵심 기능 및 요구사항

### 1. 사용자 인증 및 관리

#### 기능 개요
- AWS Cognito 기반 사용자 인증 시스템
- JWT 토큰과 쿠키 기반 세션 관리
- 이메일 인증 및 계정 확인

#### 주요 요구사항
- 회원가입 시 자동 지갑 생성 (KNG 토큰용)
- 닉네임 및 핸들(사용자명) 관리
- 얼리버드 회원 관리 시스템
- 이메일 중복 확인

#### 구현 상태
- ✅ 완전 구현됨

### 2. 크리에이터 및 멤버십 시스템

#### 기능 개요
- 크리에이터 자격 부여 및 관리
- 다단계 멤버십 상품 생성 및 관리
- 멤버십 레벨별 접근 권한 제어

#### 주요 요구사항
- 크리에이터 카테고리 분류 시스템
- 멤버십 레벨 (1-10) 기반 접근 제어
- 구독 자동 갱신 관리
- 무료 체험 기간 지원
- 개별 콘텐츠 구매 옵션

#### 구현 상태
- ✅ 완전 구현됨

### 3. 콘텐츠 관리 (포스팅)

#### 기능 개요
- 텍스트, 이미지, 비디오를 포함한 다양한 형태의 포스팅
- 초안, 발행, 보관 상태 관리
- 예약 발행 기능

#### 주요 요구사항
- 멤버십 전용 콘텐츠 설정
- 민감한 콘텐츠 표시
- 무료 미리보기 미디어 설정
- 댓글 허용/비허용 설정
- 조회수 추적 (전체/고유)

#### 구현 상태
- ✅ 완전 구현됨

### 4. 미디어 처리 시스템

#### 기능 개요
- AWS S3 기반 미디어 업로드
- AWS MediaConvert를 통한 비디오 처리
- 다중 해상도 지원 및 썸네일 자동 생성

#### 주요 요구사항
- 보안 업로드 (Signed URL)
- 비디오 자동 인코딩 (HLS, MP4)
- 이미지 리사이징 및 최적화
- 진행률 추적 및 웹훅 처리
- 미디어 접근 권한 제어

#### 구현 상태
- ✅ 완전 구현됨

### 5. 구독 및 결제 시스템

#### 기능 개요
- 토큰 기반 구독 시스템
- 구독 상태 관리 및 자동 갱신

#### 주요 요구사항
- KNG 토큰을 활용한 구독료 결제
- 구독 히스토리 관리
- 자동 갱신 설정
- 구독 취소 및 환불 처리

#### 구현 상태
- ✅ 기본 구현됨 (실제 결제 게이트웨이 연동 필요)

### 6. 토큰 시스템

#### 기능 개요
- 플랫폼 내 가상 화폐 시스템
- 지갑 생성 및 관리
- 토큰 전송 및 거래 내역 추적

#### 주요 요구사항
- UUID 기반 지갑 주소
- 소유권 변경 이력 관리
- 거래 사유별 분류
- 잔액 추적 시스템

#### 구현 상태
- ✅ 완전 구현됨

### 7. 소셜 기능

#### 기능 개요
- 사용자 간 팔로우/언팔로우
- 포스팅 및 댓글 좋아요
- 댓글 및 대댓글 시스템

#### 주요 요구사항
- 팔로워/팔로잉 관계 관리
- 좋아요 수 카운팅
- 댓글 계층 구조 지원
- 태그 기능

#### 구현 상태
- ✅ 완전 구현됨

### 8. 피드 시스템

#### 기능 개요
- 개인화된 피드 제공
- 무한 스크롤 지원
- 공개/비공개 콘텐츠 필터링

#### 주요 요구사항
- 팔로잉 기반 피드 생성
- 접근 권한별 콘텐츠 필터링
- 커서 기반 페이지네이션
- 좋아요 상태 통합 제공

#### 구현 상태
- ✅ 완전 구현됨

## 사용자 플로우

### 1. 신규 사용자 가입 플로우
```
1. 이메일/비밀번호로 회원가입 요청
2. AWS Cognito에 사용자 생성
3. 이메일 인증 코드 발송
4. 인증 코드 확인
5. 자동 지갑 생성 (KNG 토큰용)
6. 얼리버드 회원인 경우 특별 혜택 등록
7. 회원가입 완료
```

### 2. 크리에이터 멤버십 생성 플로우
```
1. 크리에이터 자격 신청/승인
2. 멤버십 상품 정보 입력
   - 이름, 설명, 레벨, 가격
   - 결제 주기, 무료 체험 기간
3. 멤버십 생성 및 활성화
4. 구독자 모집 시작
```

### 3. 콘텐츠 업로드 및 발행 플로우
```
1. 포스팅 작성 (제목, 내용)
2. 미디어 파일 업로드 (S3 Signed URL 사용)
3. 비디오인 경우 MediaConvert 처리 시작
4. 멤버십 설정 (공개/멤버십 전용/레벨)
5. 예약 발행 설정 (선택사항)
6. 포스팅 발행
```

### 4. 구독 및 콘텐츠 접근 플로우
```
1. 멤버십 상품 선택
2. KNG 토큰으로 구독료 결제
3. 구독 활성화
4. 해당 레벨 콘텐츠 접근 권한 획득
5. 보호된 미디어 접근 시 권한 확인
6. Signed URL을 통한 콘텐츠 스트리밍
```

## API 명세

### 인증 관련 API
```
POST   /auth/signup              # 회원가입
POST   /auth/signin              # 로그인
POST   /auth/signout             # 로그아웃
POST   /auth/confirm-signup      # 이메일 인증
GET    /auth/me                  # 현재 사용자 정보
GET    /auth/check-email         # 이메일 중복 확인
PUT    /auth/nickname             # 닉네임 변경
PUT    /auth/handle               # 핸들 변경
```

### 멤버십 관리 API
```
POST   /membership               # 멤버십 생성
GET    /membership               # 내 멤버십 목록
GET    /membership/:id           # 멤버십 상세
PUT    /membership/:id           # 멤버십 수정
DELETE /membership/:id           # 멤버십 삭제
PATCH  /membership/:id/toggle-active # 활성화 토글
```

### 포스팅 관리 API
```
POST   /postings                 # 포스팅 생성
GET    /postings                 # 포스팅 목록
GET    /postings/:id             # 포스팅 상세
PATCH  /postings/:id             # 포스팅 수정
DELETE /postings/:id             # 포스팅 삭제
GET    /postings/my/list         # 내 포스팅 목록
```

### 미디어 관리 API
```
POST   /media/prepare-upload     # 업로드 준비
POST   /media/complete-upload    # 업로드 완료
GET    /media/my-media           # 내 미디어 목록
GET    /media/:mediaId           # 미디어 상세
GET    /media/:mediaId/status    # 처리 상태
GET    /media/stream/:mediaId    # 미디어 스트리밍
GET    /media/public/:mediaId    # 공개 미디어
```

### 구독 관리 API
```
GET    /subscription/my/list     # 내 구독 목록
POST   /subscription/membership/:id # 멤버십 구독
DELETE /subscription/membership/:id # 구독 취소
```

### 소셜 기능 API
```
POST   /follow/:userId           # 팔로우
DELETE /follow/:userId           # 언팔로우
GET    /follow/followers         # 팔로워 목록
GET    /follow/following         # 팔로잉 목록

POST   /postings/:id/like        # 포스팅 좋아요
DELETE /postings/:id/like        # 좋아요 취소

POST   /comment                  # 댓글 작성
GET    /comment/:postingId       # 댓글 목록
PUT    /comment/:id              # 댓글 수정
DELETE /comment/:id              # 댓글 삭제
POST   /comment/:id/like         # 댓글 좋아요
```

### 피드 API
```
GET    /feed/personal            # 개인 피드
GET    /feed/public              # 공개 피드
```

### 사용자 관리 API
```
GET    /user/profile/:handle     # 프로필 조회
PUT    /user/profile             # 프로필 수정
POST   /user/creator             # 크리에이터 신청
```

### 지갑 API
```
GET    /wallet                   # 내 지갑 정보
```

## 데이터베이스 설계

### 핵심 엔티티 관계도
```
User (Cognito) ──┬── UserProfile
                 ├── Creator
                 ├── WalletOwnership ── Wallet
                 ├── Posting
                 ├── Subscription
                 ├── UserFollow
                 └── Comments/Likes

Creator ── MembershipItem ── Subscription
Posting ──┬── PostingMedia ── Media
          ├── Comment
          ├── PostingLike
          └── PostingView
```

### 주요 테이블 설계

#### 사용자 및 프로필
- `user_profiles`: 사용자 추가 프로필 정보
- `creators`: 크리에이터 정보 및 카테고리
- `creator_categories`: 크리에이터 분류

#### 토큰 및 지갑 시스템
- `token_types`: 토큰 타입 정의 (KNG 등)
- `wallets`: 사용자 지갑
- `wallet_ownerships`: 지갑 소유권 이력
- `transfers`: 토큰 전송 기록
- `transfer_reasons`: 전송 사유 분류

#### 멤버십 시스템
- `membership_items`: 멤버십 상품
- `subscriptions`: 구독 정보
- 지원 기능: 자동 갱신, 무료 체험, 구독 이력

#### 콘텐츠 시스템
- `postings`: 포스팅 정보
- `medias`: 미디어 파일 정보
- `posting_medias`: 포스팅-미디어 관계
- 상태 관리: 초안/발행/보관, 처리 상태

#### 소셜 기능
- `user_follows`: 팔로우 관계
- `posting_likes`: 포스팅 좋아요
- `comments`: 댓글 시스템
- `comment_likes`: 댓글 좋아요
- `posting_views`: 조회 이력

#### 기타
- `earlybirds`: 얼리버드 회원 관리

### 데이터 타입 및 제약조건
- UUID를 기본 ID로 사용
- Decimal 타입으로 정확한 금액 계산
- 소프트 삭제 패턴 적용 (is_deleted, deleted_at)
- 적절한 인덱스 설정으로 성능 최적화

## 미디어 처리 파이프라인

### 전체 아키텍처
```
Upload Request → S3 Signed URL → Client Upload → S3 Trigger → Lambda
                                                                  ↓
Database Update ← Webhook ← MediaConvert Job ← Lambda Processing
```

### 단계별 처리 과정

#### 1. 업로드 준비 단계
```typescript
POST /media/prepare-upload
{
  "originalName": "video.mp4",
  "mimeType": "video/mp4",
  "fileSize": 50000000,
  "type": "VIDEO"
}

Response:
{
  "mediaId": "uuid",
  "uploadUrl": "s3-signed-url",
  "uploadFields": {...}
}
```

#### 2. 업로드 완료 및 처리 시작
- S3에 파일 업로드 완료
- S3 Event → Lambda 트리거
- Lambda에서 MediaConvert 작업 생성
- 비디오 duration 추출 (ffprobe 사용)

#### 3. MediaConvert 처리
- 다중 해상도 인코딩 (720p, 1080p)
- HLS 스트리밍용 변환
- 썸네일 이미지 생성 (5장)
- 처리 진행률 추적

#### 4. 완료 및 웹훅
- MediaConvert EventBridge → Lambda
- 처리 결과를 백엔드 웹훅으로 전송
- 데이터베이스 업데이트 (처리 상태, URL 등)

### 지원 미디어 형식
- **비디오**: MP4, MOV, AVI, MKV, WebM
- **이미지**: JPEG, PNG, WebP
- **오디오**: MP3, WAV, M4A

### 처리 결과물
- **비디오**: 다중 해상도, HLS 매니페스트, 썸네일
- **이미지**: 리사이징된 버전들 (썸네일, 중간, 원본)

## 보안 및 인증

### 인증 시스템
- **AWS Cognito**: 사용자 인증 및 관리
- **JWT 토큰**: API 인증에 사용
- **HTTP-Only 쿠키**: 토큰 저장으로 XSS 방지
- **Refresh Token**: 자동 토큰 갱신

### 권한 제어 시스템

#### 가드(Guard) 시스템
```typescript
@UseGuards(AuthGuard)           // 로그인 필수
@UseGuards(CreatorGuard)        // 크리에이터만
@UseGuards(OptionalAuthGuard)   // 선택적 인증
```

#### 멤버십 기반 접근 제어
```typescript
// 포스팅 접근 권한 확인
if (posting.is_membership) {
  // 멤버십 레벨 확인
  const hasAccess = await checkMembershipAccess(
    userId, 
    creatorId, 
    requiredLevel
  );
  
  // 개별 구매 확인 (대안)
  const hasPurchased = await checkIndividualPurchase(
    userId, 
    postingId
  );
  
  return hasAccess || hasPurchased;
}
```

### 미디어 보안
- **Private S3 Bucket**: 직접 접근 불가
- **Signed URL**: 임시 접근 권한 (1시간)
- **권한 기반 접근**: 멤버십 레벨 확인 후 URL 제공
- **무료 미리보기**: 일부 미디어는 공개 접근 허용

### 데이터 보안
- **입력 검증**: class-validator로 모든 입력 검증
- **SQL Injection 방지**: Prisma ORM 사용
- **XSS 방지**: 출력 시 적절한 이스케이핑
- **CORS 설정**: 허용된 도메인만 접근

### 에러 처리 및 로깅
- **글로벌 예외 필터**: 통일된 에러 응답
- **상세 로깅**: 사용자 행동 및 시스템 상태 추적
- **프로덕션 보안**: 상세 에러 메시지 숨김

## 향후 고려사항

### 성능 최적화
1. **Redis 캐싱**
   - 피드 데이터 캐싱
   - 세션 정보 캐싱
   - 빈번한 조회 데이터 캐싱

2. **CDN 도입**
   - CloudFront 설정
   - 전역 콘텐츠 배포
   - 미디어 로딩 속도 개선

3. **데이터베이스 최적화**
   - 읽기 전용 복제본 활용
   - 쿼리 성능 튜닝
   - 인덱스 최적화

### 기능 확장
1. **검색 시스템**
   - Elasticsearch 도입
   - 전문 검색 기능
   - 자동완성 기능

2. **알림 시스템**
   - 실시간 알림 (WebSocket)
   - 푸시 알림
   - 이메일 알림

3. **결제 시스템**
   - 실제 결제 게이트웨이 연동
   - 다양한 결제 수단 지원
   - 환불 시스템

4. **관리자 시스템**
   - 관리자 대시보드
   - 콘텐츠 모더레이션
   - 사용자 관리

### 확장성 고려사항
1. **마이크로서비스 분리**
   - 인증 서비스 분리
   - 미디어 처리 서비스 분리
   - 알림 서비스 분리

2. **데이터베이스 샤딩**
   - 사용자별 데이터 분산
   - 지역별 데이터 분산

3. **컨테이너화**
   - Docker 컨테이너화
   - Kubernetes 오케스트레이션
   - 자동 스케일링

### 보안 강화
1. **DDoS 방지**
   - Rate Limiting 강화
   - AWS WAF 활용

2. **데이터 암호화**
   - 민감 데이터 암호화
   - 통신 구간 암호화

3. **감사 로그**
   - 사용자 행동 추적
   - 시스템 접근 로그
   - 보안 이벤트 모니터링

---

*이 문서는 crefans_server 프로젝트의 현재 구현 상태를 바탕으로 작성되었으며, 지속적으로 업데이트될 예정입니다.*