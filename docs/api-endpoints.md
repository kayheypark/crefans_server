# API Endpoints Documentation

이 문서는 crefans_server의 모든 API 엔드포인트를 정리한 것입니다.

## 인증 (Authentication)

### User Authentication
- `POST /auth/register` - 사용자 회원가입
- `POST /auth/login` - 사용자 로그인
- `POST /auth/refresh` - 토큰 갱신
- `POST /auth/logout` - 로그아웃
- `GET /auth/me` - 현재 사용자 정보 조회

### Admin Authentication
- `POST /admin/auth/login` - 관리자 로그인
- `POST /admin/auth/refresh` - 관리자 토큰 갱신
- `GET /admin/auth/me` - 현재 관리자 정보 조회

## 사용자 관리 (User Management)

### User Profile
- `GET /user/profile/:handle` - 사용자 프로필 조회
- `PUT /user/profile` - 사용자 프로필 업데이트
- `POST /user/creator/apply` - 크리에이터 신청

### Follow System
- `POST /follow` - 팔로우
- `DELETE /follow` - 언팔로우
- `GET /follow/followers/:userId` - 팔로워 목록
- `GET /follow/following/:userId` - 팔로잉 목록

## 콘텐츠 관리 (Content Management)

### Posting
- `GET /posting` - 포스팅 목록 조회
- `GET /posting/:id` - 특정 포스팅 조회
- `POST /posting` - 포스팅 생성
- `PUT /posting/:id` - 포스팅 수정
- `DELETE /posting/:id` - 포스팅 삭제
- `POST /posting/:id/view` - 조회수 증가

### Posting Likes
- `POST /posting/:id/like` - 포스팅 좋아요
- `DELETE /posting/:id/like` - 포스팅 좋아요 취소

### Comments
- `GET /comment/posting/:postingId` - 포스팅 댓글 목록
- `POST /comment` - 댓글 작성
- `PUT /comment/:id` - 댓글 수정
- `DELETE /comment/:id` - 댓글 삭제

### Comment Likes
- `POST /comment/:id/like` - 댓글 좋아요
- `DELETE /comment/:id/like` - 댓글 좋아요 취소

### Media
- `POST /media/upload-url` - 업로드 URL 생성
- `POST /media/complete-upload` - 업로드 완료 처리
- `GET /media/:id` - 미디어 정보 조회
- `DELETE /media/:id` - 미디어 삭제

## 탐색 및 피드 (Explore & Feed)

### Explore
- `GET /explore/creators` - 크리에이터 탐색
- `GET /explore/posts` - 포스팅 탐색

### Feed
- `GET /feed` - 사용자 피드 조회

## 결제 및 구독 (Payment & Subscription)

### Payment
- `POST /payment/confirm` - 결제 승인
- `POST /payment/fail` - 결제 실패 처리

### Wallet
- `GET /wallet` - 지갑 정보 조회
- `GET /wallet/history` - 거래 내역 조회

### Membership
- `GET /membership/:creatorId` - 크리에이터 멤버십 목록
- `POST /membership` - 멤버십 아이템 생성
- `PUT /membership/:id` - 멤버십 아이템 수정
- `DELETE /membership/:id` - 멤버십 아이템 삭제

### Subscription
- `POST /subscription/subscribe` - 구독 시작
- `POST /subscription/cancel` - 구독 취소
- `GET /subscription/my` - 내 구독 목록

## 게시판 (Board)

### Board Categories
- `GET /board-categories` - 게시판 카테고리 목록

### Board Posts
- `GET /board` - 게시판 글 목록
- `GET /board/:id` - 특정 게시판 글 조회

## 관리자 API (Admin APIs)

### Admin Management
- `GET /admin/users` - 사용자 관리
- `GET /admin/users/:id` - 특정 사용자 조회
- `PUT /admin/users/:id/suspend` - 사용자 정지
- `PUT /admin/users/:id/activate` - 사용자 활성화

### Admin Board Management
- `GET /admin/board` - 관리자 게시판 글 관리
- `POST /admin/board` - 게시판 글 생성
- `PUT /admin/board/:id` - 게시판 글 수정
- `DELETE /admin/board/:id` - 게시판 글 삭제

### Admin Board Categories
- `GET /admin/board-categories` - 게시판 카테고리 관리
- `GET /admin/board-categories/:id` - 특정 카테고리 조회
- `PUT /admin/board-categories/:id` - 카테고리 수정
- `DELETE /admin/board-categories/:id` - 카테고리 비활성화
- `PUT /admin/board-categories/:id/restore` - 카테고리 복원

## 응답 형식

모든 API는 다음과 같은 공통 응답 형식을 사용합니다:

```json
{
  "success": true|false,
  "message": "응답 메시지",
  "data": {}, // 실제 데이터 (성공시)
  "error": {} // 에러 정보 (실패시)
}
```

## 인증 헤더

인증이 필요한 엔드포인트는 다음 헤더를 포함해야 합니다:

```
Authorization: Bearer <access_token>
```

관리자 엔드포인트는 관리자 토큰이 필요합니다.

## 페이지네이션

목록 조회 API는 다음 쿼리 파라미터를 지원합니다:

- `page`: 페이지 번호 (기본값: 1)
- `limit`: 페이지당 항목 수 (기본값: 20)
- `sort`: 정렬 방식
- `order`: 정렬 순서 (asc, desc)

응답은 다음과 같은 메타데이터를 포함합니다:

```json
{
  "data": [],
  "meta": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "itemsPerPage": 20
  }
}
```