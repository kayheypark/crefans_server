# 크레팬스 백엔드 문서

신규 서비스는 `src/platform/main.ts`의 자체 회원 인증 `/api/v1` 런타임이다. `npm run dev`/`npm run start`는 기존 런타임이므로 신규 서비스 개발에 사용하지 않는다.

## 격리 로컬 실행

```sh
npm ci
npx prisma generate
npm run build
npm run dev:platform
```

먼저 `infra/platform/runtime.env.example`을 참고해 gitignore 대상 `.local/platform.env`를 만든다. `dev:platform`은 `127.0.0.1:3307/crefans_platform_dev`만 허용한다. 예시의 Docker DB URL을 그대로 개발에 쓰지 않는다. 일반 `.env`에는 기존 운영 설정이 있으므로 로드하지 않는다. DB 생성/검토한 migration 적용은 시작과 별도로 수행하며 운영에 `migrate dev`/`db push`/`seed`를 실행하지 않는다.

worker는 빌드 후 `.local/platform.env`를 명시하여 실행한다:

```sh
node -r dotenv/config dist/src/platform/worker.js dotenv_config_path=.local/platform.env
```

미설정 SMTP/Toss/PASS/은행은 해당 API 오류이며 가짜 성공으로 바꾸지 않는다. 외부 은행 지급·파일 삭제는 기본 off다.

## 현재 기준

- [API 의미와 보안 계약](./platform-api.md)
- [코드에서 추출한 전체 API·화면·DB·환경 키](./current-contracts.md)
- [구현 상태와 운영 전 남은 작업](./platform-implementation.md)
- [외부 공급자 설정/대역 검증 경계](./provider-contracts.md)
- [현재 Prisma 스키마 안내](./database-schema.md)
- [단일 서버 배포](../infra/platform/README.md)
- [프론트 바인딩·E2E 준비](../../crefans_front/docs/service-api-binding.md)
- [출시 시나리오](../../crefans_front/docs/release-test-scenarios.md)
- [문서 검증 증거와 범위](../../crefans_front/docs/documentation-verification.md)

## 검사

`npm run build`, `npm run test:platform:domain`은 격리 DB/대역 검사다. 실행 중인 API3001과 개발 DB3307에서 `npm run test:platform`을 수행한다. 브라우저 E2E는 형제 프론트의 `npm run test:e2e`이며 전용 DB·3011/3012를 쓴다. `npm test`는 구형 placeholder이므로 성공 검사로 사용하지 않는다.

## 과거 자료

본문 상단에 “구형/이전 기록” 표시된 PRD·API·로드맵·Cognito 관리자·AWS 배포·Lambda 문서는 과거 설명을 보존한다. 과거 완료율·비용·명령을 현재 서비스 보장으로 해석하지 않는다. 문서 전체의 상태와 근거는 프론트 `docs/audit/manifest.json`에 기록한다.
