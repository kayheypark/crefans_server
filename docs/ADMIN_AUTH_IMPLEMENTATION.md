# 관리자 인증 시스템 구현

이 문서는 크리팬스 관리자 시스템의 Cognito 기반 인증 구현에 대해 설명합니다.

## 개요

관리자 인증 시스템이 모의 인증에서 실제 Cognito 인증 및 관리자 역할 확인으로 업그레이드되었습니다. 이 구현은 메인 crefans_front 애플리케이션에서 사용된 패턴을 따르며, 관리자 특화 역할 검증을 추가합니다.

## 백엔드 변경사항 (crefans_server)

### 1. 관리자 인증 컨트롤러
**파일:** `src/admin/admin-auth.controller.ts`
- 관리자 인증 엔드포인트 전용 새 컨트롤러
- 기존 Cognito 인증 플로우 사용
- Cognito 인증 후 관리자 역할 확인 추가
- 메인 앱과 동일한 쿠키 기반 인증 패턴 구현

**엔드포인트:**
- `POST /admin/auth/signin` - Cognito 로그인 + 역할 확인
- `POST /admin/auth/signout` - 쿠키 정리와 함께 로그아웃
- `GET /admin/auth/me` - 현재 관리자 정보 조회

### 2. 관리자 인증 가드
**파일:** `src/admin/guards/admin-auth.guard.ts`
- Cognito 토큰 검증을 확장하는 커스텀 가드
- Cognito를 통해 사용자의 JWT 토큰 검증
- 사용자가 Admin 테이블에 존재하고 활성 상태인지 확인
- 요청 객체에 사용자 및 관리자 정보 추가

### 3. 업데이트된 관리자 서비스
**파일:** `src/admin/admin.service.ts`
- `getAdminByUserSub(userSub: string)` 메소드 추가
- `updateLastLogin(adminId: string)` 메소드 추가
- 이 메소드들은 관리자 역할 확인 및 추적 지원

### 4. 업데이트된 관리자 컨트롤러
**파일:** `src/admin/admin.controller.ts`
- 모의 JWT 인증을 새로운 AdminAuthGuard로 교체
- 모든 관리자 관리 엔드포인트는 이제 실제 관리자 인증 필요

### 5. 업데이트된 관리자 모듈
**파일:** `src/admin/admin.module.ts`
- AdminAuthController 및 AdminAuthGuard 추가
- Cognito 서비스 의존성을 위해 AuthModule 가져오기

### 6. 데이터베이스 시딩
**파일:** `prisma/seed.ts`
- 다양한 역할을 가진 샘플 관리자 사용자 추가:
  - 슈퍼 관리자 (superadmin@crefans.com)
  - 일반 관리자 (admin@crefans.com)
  - 중재자 (moderator@crefans.com)

## 프론트엔드 변경사항 (crefans_admin)

### 1. 관리자 인증 API
**파일:** `src/lib/api/admin-auth.ts`
- 관리자 인증 엔드포인트용 새 API 모듈
- crefans_front auth API 패턴 따름
- `withCredentials: true`로 쿠키 기반 인증 사용

### 2. 업데이트된 인증 컨텍스트
**파일:** `src/contexts/AuthContext.tsx`
- 모의 인증을 실제 Cognito 플로우로 완전 교체
- 관리자 특화 API 엔드포인트 사용
- 역할 정보가 포함된 적절한 관리자 사용자 데이터 구조 지원
- 적절한 로딩 상태 및 에러 처리 구현

### 3. 업데이트된 로그인 페이지
**파일:** `src/app/login/page.tsx`
- 사용자명/비밀번호에서 이메일/비밀번호로 변경 (Cognito 표준)
- 하드코딩된 데모 자격증명 제거
- 적절한 이메일 검증 추가
- 실제 인증 플로우를 반영하도록 UI 업데이트

### 4. 업데이트된 관리자 레이아웃
**파일:** `src/components/AdminLayout.tsx`
- 사용자명 대신 관리자 이름 및 역할 표시로 업데이트
- 백엔드 로그아웃을 적절히 호출하도록 비동기 로그아웃 구현
- 역할 정보가 포함된 향상된 사용자 표시

## 인증 플로우

1. **로그인 프로세스:**
   - 관리자가 프론트엔드에서 이메일과 비밀번호 입력
   - 프론트엔드가 자격증명으로 `/admin/auth/signin` 호출
   - 백엔드가 Cognito를 통해 인증
   - 백엔드가 사용자가 Admin 테이블에 존재하고 활성 상태인지 확인
   - 유효하면 백엔드가 인증 쿠키 설정 (access_token, id_token, refresh_token)
   - 프론트엔드가 관리자 정보를 받고 컨텍스트 업데이트

2. **보호된 라우트 접근:**
   - AdminAuthGuard가 쿠키 또는 Authorization 헤더에서 액세스 토큰 확인
   - Cognito로 토큰 검증
   - 사용자가 활성 관리자인지 확인
   - 요청 객체에 사용자 및 관리자 정보 추가
   - 관리자 엔드포인트 접근 허용

3. **로그아웃 프로세스:**
   - 프론트엔드가 `/admin/auth/signout` 호출
   - 백엔드가 Cognito 로그아웃 호출
   - 백엔드가 인증 쿠키 삭제
   - 프론트엔드가 사용자 상태 삭제하고 로그인으로 리다이렉트

## 보안 기능

- **Cognito JWT 검증:** 모든 토큰이 AWS Cognito로 검증됨
- **관리자 역할 확인:** 사용자가 Admin 테이블에 존재하는지 추가 확인
- **활성 상태 확인:** 활성 관리자 계정만 시스템에 접근 가능
- **보안 쿠키:** 액세스 토큰용 HTTP-only 쿠키
- **마지막 로그인 추적:** 관리자 사용자가 마지막으로 시스템에 접근한 시간 추적

## 데이터베이스 스키마

Admin 테이블 포함 항목:
- `user_sub`: Cognito 사용자 식별자
- `name`: 표시 이름
- `email`: 이메일 주소
- `role`: 관리자 역할 (SUPER_ADMIN, ADMIN, MODERATOR)
- `is_active`: 활성 상태 플래그
- `last_login`: 마지막 로그인 타임스탬프

## 테스트

구현을 테스트하려면:

1. 데이터베이스에 관리자 사용자가 있는지 확인 (`npx prisma db seed` 실행)
2. 동일한 이메일 주소로 해당하는 Cognito 사용자 생성
3. 관리자 로그인 페이지를 사용하여 실제 Cognito 자격증명으로 인증
4. 시스템이 Cognito 인증과 관리자 역할을 모두 확인

## 환경 변수

환경에 다음이 구성되어 있는지 확인하세요:
- AWS Cognito 구성 (리전, 사용자 풀 ID, 클라이언트 ID, 자격증명)
- 데이터베이스 연결 문자열
- 프로덕션용 쿠키 도메인 설정

## 참고사항

- Admin 테이블의 `user_sub`는 Cognito JWT 토큰의 `sub` 클레임과 일치해야 함
- 관리자 사용자는 Cognito와 Admin 데이터베이스 테이블 모두에 생성되어야 함
- 시스템은 메인 애플리케이션과 동일한 쿠키 기반 인증 패턴 유지
- 기존의 모든 관리자 관리 엔드포인트가 이제 실제 인증으로 적절히 보호됨