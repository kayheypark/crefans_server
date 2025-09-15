# Crefans Server Documentation

이 폴더는 crefans_server 프로젝트의 모든 문서를 포함합니다.

## 📚 문서 목록

### 🔧 개발 및 설정
- **[deployment-setup.md](./deployment-setup.md)** - 배포 및 환경 설정 가이드
- **[api-endpoints.md](./api-endpoints.md)** - API 엔드포인트 문서
- **[database-schema.md](./database-schema.md)** - 데이터베이스 스키마 문서

### 📋 기획 및 요구사항
- **[prd.md](./prd.md)** - 제품 요구사항 문서 (PRD)
- **[feature.md](./feature.md)** - 기능 명세서
- **[roadmap.md](./roadmap.md)** - 개발 로드맵

### 🏗️ 아키텍처
- **[file-architecture2.md](./file-architecture2.md)** - 파일 아키텍처 v2
- **[file-access-architecture.md](./file-access-architecture.md)** - 파일 접근 아키텍처

### 🔐 인증 및 보안
- **[ADMIN_AUTH_IMPLEMENTATION.md](./ADMIN_AUTH_IMPLEMENTATION.md)** - 관리자 인증 구현 가이드

### 💰 비용 분석
- **[video-processing-cost-analysis.md](./video-processing-cost-analysis.md)** - 비디오 처리 비용 분석

## 🚀 빠른 시작

### 1. 개발 환경 설정
```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 데이터베이스 설정
npx prisma migrate dev
npx prisma db seed

# 개발 서버 실행
npm run dev
```

### 2. 주요 명령어
```bash
# 빌드
npm run build

# 프로덕션 실행
npm start

# 데이터베이스 관리
npx prisma studio

# 타입스크립트 개발 모드
npm run dev
```

## 📖 문서 작성 가이드

새로운 문서를 작성할 때는 다음 규칙을 따라주세요:

1. **파일명**: kebab-case 사용 (예: `api-endpoints.md`)
2. **제목**: 명확하고 간결한 제목 사용
3. **구조**: 목차, 개요, 상세 내용 순으로 구성
4. **코드 블록**: 언어 지정 및 주석 포함
5. **링크**: 상대 경로 사용

## 🔗 관련 링크

- **Frontend Repository**: [crefans_front](../../../crefans_front)
- **Admin Panel**: [crefans_admin](../../../crefans_admin)
- **Lambda Functions**: [../lambda](../lambda)

## 📝 문서 업데이트

문서는 코드 변경 시 함께 업데이트되어야 합니다:

- API 변경 시 → `api-endpoints.md` 업데이트
- 스키마 변경 시 → `database-schema.md` 업데이트
- 배포 방식 변경 시 → `deployment-setup.md` 업데이트

## 🤝 기여하기

문서 개선 사항이 있다면:

1. 이슈 생성 또는 기존 이슈 확인
2. 브랜치 생성 (`docs/feature-name`)
3. 문서 수정 및 커밋
4. Pull Request 생성

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0