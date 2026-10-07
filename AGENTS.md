# AGENTS.md — crefans_server

- 크레팬스(팬·크리에이터 멤버십 플랫폼) 백엔드. NestJS + Prisma + MySQL. AWS Cognito 제거·자체 회원 인증·단일 원서버(docker compose, host Postfix SMTP) 배포를 준비 중. `dev`는 승인된 개발 기준, `prod`는 기존 운영 기준이다. 새 작업은 `dev`에서 `feat/<작업명>` 브랜치로 진행한다.
- 작업 전에 `PROGRESS.md`를 먼저 읽고, 작업 후 갱신한다. 설계 기준 문서는 `docs/local-member-migration.md`와 `infra/single-instance/`. `docs/prd.md`·`docs/deployment-setup.md`의 Cognito 전제 내용은 구식.
- 운영 DB에 `migrate dev`/`db push`/`seed`를 실행하지 않는다. 비밀번호·인증 코드·AWS 키를 로그에 남기지 않는다.
- 프론트(crefans_front)의 인증 화면 계약: 회원가입 화면 안에서 이메일 코드 인증 + PASS 본인인증을 끝낸 뒤 가입. 코드 유효 10분, 재전송 쿨다운 3분.

- 신규 실제 서비스는 `src/platform/`의 독립 런타임(`/api/v1`)이다. API/구조/검증은 `docs/platform-implementation.md`, `docs/platform-api.md`, 외부 경계는 `docs/provider-contracts.md`. `/preview` 목업은 유지한다. 기존 비버전/Cognito 런타임에 신규 API를 섞지 않는다.
- 현재 개발 DB는 `.local/platform.env`의 127.0.0.1:3307 격리 DB다. 일반 `.env`를 실제 서비스 개발·테스트에 로드하지 않는다. 외부 계정 미설정 오류를 가짜 성공으로 바꾸지 않는다.

- 기존 `main`은 예전 배포 workflow 때문에 보존한다. 신규 플랫폼의 운영 배포 전환은 별도 작업이며 `dev`/복구 태그를 운영 출시 완료로 해석하지 않는다.
