# 회원 인증을 단일 인스턴스로 이전하기

이 브랜치는 **기능을 추가한 상태**이다. 운영 DB 변경, 회원 내보내기, 이메일 발송, 배포, 설정 전환은 수행하지 않았다. 기존 환경변수를 그대로 사용하면 Cognito 코드가 실행되고 새 회원 테이블을 조회하지 않는다.

## 모드와 호환성

| AUTH_PROVIDER | 신규 가입 / 로그인 | 기존 토큰 | 회원 조회·관리자 | 인증 메일 |
| --- | --- | --- | --- | --- |
| 미설정 또는 cognito | 기존 Cognito | 기존 AWS 검증 | 기존 AWS 조회 / 기존 DB 관리자 권한 | 기존 Cognito 발송 |
| migration | 신규는 로컬, 가져온 기존 회원은 최초 로그인 시 Cognito에서 비밀번호 검증 후 로컬 저장 | 아직 전환하지 않은 회원의 AWS 토큰 허용. 전환된 회원은 다시 로그인 | 로컬 회원 DB / 기존 DB 관리자 권한 | 신규는 SMTP, 기존 미확인 회원 인증은 Cognito |
| local | 로컬만 사용 | 로컬 세션만 허용 | 로컬 회원 DB / 기존 DB 관리자 권한 | SMTP |

`MEMBER_MAIL_PROVIDER=smtp`는 로컬 인증 경로에 적용한다. 기존 서비스에는 독립된 SES 발송 구현이 없고 Cognito가 인증 메일을 관리한다. Cognito의 인증 코드만 자체 SMTP로 바꾸는 설정은 추가하지 않았다. 기존 AWS 구현은 `src/auth/aws-cognito.service.ts`에 보존하고, 기존 이름의 `CognitoService`가 선택 분기를 담당한다.

회원 가입, 로그인, 인증, 갱신, 로그아웃, `/auth/me`의 URL·응답 형태와 쿠키 이름은 유지한다. 프론트·관리자는 읽기용 `id_token` JWT로 만료를 확인할 수 있다. 실제 인증에는 DB 세션의 무작위 `access_token`을 사용한다. ID 토큰으로 API를 인증할 수 없다. 회원 목록·핸들 조회·팔로우 관련 조회 및 필수/선택/관리자 가드 모두 분기된다.

## 추가 스키마

- `members`: 기본키는 **기존 Cognito sub 그대로**. 이메일, 원본 Cognito username, 이름·닉네임·핸들·연락처, 이메일 확인/활성 상태, 비밀번호 해시, 전환 시각.
- `member_sessions`: 원문 대신 접근/갱신 토큰 SHA-256 해시, 접근 1시간 / 세션 최대 30일. 갱신 시 토큰 회전, 동시에 한 요청만 성공한다. 로그아웃·비밀번호 재설정으로 폐기한다.
- `member_challenges`: 용도별 코드 HMAC, 10분 만료, 최대 5회 시도, 사용 후 삭제. 발송은 회원/용도별 3분당 1회(재전송 쿨다운, 2026-09-13 결정).
- `auth_rate_buckets`: DB 기반 인증 요청 제한. 이메일과 IP는 키에 원문 저장하지 않는다.

비밀번호는 salt를 가진 scrypt(N=65536, r=8, p=2)로 저장한다. 동시 비밀번호 연산은 프로세스당 2개로 제한한다. `LOCAL_AUTH_SECRET`은 암호학적 난수 32바이트 이상을 64자리 hex 등으로 인코딩하여 별도 보관한다. 비밀번호·인증 코드가 있는 인증 요청 본문/쿼리 및 AWS 키를 로그에 출력하지 않는다.

기존 프로필·지갑·게시물·구독·관리자 테이블은 변경하지 않고 새로운 회원 외래키도 강제로 추가하지 않는다. 삭제된 Cognito 회원을 가리키는 과거 기록은 별도로 분류해야 한다.

## 이전 순서

1. **전환 전 점검**: DB 전체 백업과 실제 복원 확인, Cognito 사용자 수/사용자 풀 확인, 현재 스키마와 Prisma 마이그레이션 이력 비교. 이 저장소의 기존 `0_init`이 운영에 어떻게 적용되었는지 반드시 확인한다. 운영에서 `migrate dev`, `db push`, `seed`를 실행하지 않는다.
2. **DB 이동을 별도 단계로 수행**: 모든 업무 데이터·마이그레이션 이력을 같은 MySQL 버전의 단일 인스턴스 DB로 복사한다. 마지막 동기화 중 쓰기 중지 또는 검증된 복제 절차를 사용한다. 테이블별 행 수/금액 합계/회원 ID 참조를 비교한다. 먼저 Cognito 모드로 새 DB의 기존 서비스가 동작하는지 확인한다.
3. **추가 DDL 적용**: `prisma/migrations/20260910000000_local_members/migration.sql`은 새 테이블 4개와 이들 사이의 FK만 추가한다. 마이그레이션 이력이 일치할 때만 검토된 `prisma migrate deploy`를 사용한다. MySQL DDL은 전체 트랜잭션 롤백이 되지 않으므로 실패 시 실제 테이블과 이력을 조사한 뒤 처리한다. 앱 시작 시 자동 적용하지 않는다.
4. **완전한 회원 스냅샷**: 읽기 전용 Cognito 권한으로 아래 export 명령을 실행한다. `ListUsers`의 모든 페이지와 `AdminGetUser`의 MFA/상태를 확인한다. 파일은 0600으로 새로 생성되며 기존 파일을 덮어쓰지 않는다. 개인정보 파일은 저장소 밖에 보관한다.
5. **dry-run → 이관**: 대상 DB 주소와 사용자 풀을 명시한다. 기본은 dry-run으로 쓰지 않는다. ID·이메일·핸들·username 중복 및 충돌을 조사한다. 실제 이관은 트랜잭션으로 수행하며 DB collation에 따른 추가 충돌도 실패시 전체 롤백한다. 재실행해도 기존 비밀번호와 로컬 프로필은 덮어쓰지 않는다. dry-run은 DB collation의 모든 배치 내 충돌을 보증하지 않는다.
6. **최종 스냅샷과 참조 대조**: export는 시점 일관성 트랜잭션이 아니므로 전환 직전에 Cognito 가입/프로필 변경을 잠시 중지하고 마지막 스냅샷을 받는다. 기존 행의 속성 변경은 import 재실행으로 덮어쓰지 않으므로 변경분을 별도 대조한다. 회원 수 및 `members:audit` 참조 누락을 확인한다. 미이관 회원이 있는 상태에서 migration 모드를 열면 해당 회원은 로그인할 수 없다.
7. **병행 전환**: SMTP 설정을 확인하고 `AUTH_PROVIDER=migration`으로 변경한다. 기존 회원은 최초 비밀번호 로그인에서 Cognito 본인 확인 및 원래 sub 일치 여부를 검증한 뒤 같은 ID에 로컬 비밀번호를 저장한다. 기존 AWS 세션은 해당 회원이 전환되는 시점부터 재로그인이 필요하다. 비밀번호 원문을 저장하거나 이메일만으로 기존 계정에 연결하지 않는다.
8. **로컬 전용 전환**: 활성 Cognito 회원 중 `password_hash IS NULL`인 회원이 0명인지 확인한다. 남아 있으면 local 모드 기동이 실패한다. 장기 미접속자·비활성자·MFA·외부 IdP·임시 비밀번호/비밀번호 재설정 상태는 개별 전환 절차가 필요하다. 이런 계정을 임의로 활성화하거나 이메일 코드로 우회하지 않는다. 운영자가 이 조건을 해결하기 전에는 migration 모드를 유지한다.

```sh
# 비밀 값은 셸 히스토리에 직접 적지 말고 안전한 환경변수 주입 방식 사용.
# AWS_REGION / AWS 자격증명은 export 프로세스에만 필요한 읽기 전용 권한.
# MEMBER_MIGRATION_POOL_ID: 확인한 원본 풀 ID
npm run members:export -- /secure/path/member-export.json

# MEMBER_MIGRATION_DATABASE_URL: 검토한 대상 DB URL
npm run members:import -- /secure/path/member-export.json
npm run members:import -- /secure/path/member-export.json --apply
npm run members:audit
```

audit 종료코드 2는 미전환 비밀번호 또는 업무 참조 누락이 있다는 뜻이다. migration 초기의 미전환 비밀번호는 정상일 수 있지만 참조 누락은 전환 전에 설명되어야 한다. export는 비밀번호를 가져오지 않는다. [AWS 사용자 프로필 내보내기 지침](https://docs.aws.amazon.com/solutions/latest/cognito-user-profiles-export-reference-architecture/cognito-user-profiles-export-reference-architecture.pdf)을 참고한다.

## 복구와 운영 원칙

로컬 회원이 생성되거나 로컬 비밀번호/프로필을 변경한 뒤에는 **단순히 cognito로 바꾸는 것이 완전한 롤백이 아니다**. 새 회원이 Cognito에 없고 변경 비밀번호도 동기화되지 않기 때문이다. 이전 Cognito 계정은 삭제하지 않되, 병행 기간 이후 수정은 로컬 DB를 기준으로 한다. 장애 시에는 로컬 DB 백업 복원과 수정 코드 적용을 우선한다. Cognito 복귀가 필요한 경우 가입 중지, 신규/변경 계정 차이 목록, 별도 비밀번호 재설정 및 세션 종료 계획이 필요하다.

추가 API `POST /auth/forgot-password`는 `{ email }`, `POST /auth/reset-password`는 `{ email, code, password }`를 받는다. 로컬 모드에서만 제공한다. 이관 전 Cognito 계정의 비밀번호를 이메일만으로 로컬에 설정하지 않는다. 프론트의 비밀번호 찾기 화면은 이 작업에서 추가하지 않았다.

만료 데이터는 정기적으로 소량씩 정리한다. 예: `DELETE FROM auth_rate_buckets WHERE expires_at < NOW() LIMIT 1000`, `member_challenges.expires_at`, `member_sessions.expires_at`도 같은 방식. 자동 스케줄을 설치하지 않았다.

현재 IP 제한은 신뢰되지 않은 X-Forwarded-For를 사용하지 않고 소켓 IP를 사용한다. 역방향 프록시 뒤에서는 모든 요청이 한 IP로 묶일 수 있으므로, 전환 전에 외부 진입 프록시에 실제 클라이언트 IP별 인증 제한을 설정하고 서버 측 제한 값/프록시 신뢰 범위를 운영 환경에 맞게 검토한다.

## 한 인스턴스 구성

`infra/single-instance/compose.yml`은 Linux 한 대에서 API와 MySQL을 실행하는 준비용 구성이다. DB는 named volume에 보관하고 DB/API 포트는 loopback에만 연다. 서버 컨테이너는 host network로 호스트의 Postfix 등 SMTP 서버에 연결한다. 기존 프론트·관리자·HTTPS 프록시도 같은 호스트에서 서비스할 수 있다. 이 파일이 프론트·관리자 배포까지 자동 구성하지는 않는다.

- `.env.runtime.example`을 `.env.runtime`으로 복사하고 실제 설정을 주입한다. compose 변수 `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `LOCAL_DATABASE_URL`은 별도로 주입한다. DB URL 비밀번호는 URL 인코딩한다.
- Postfix 등 메일 서버는 호스트 loopback 송신 전용으로 설정한다. 외부 오픈 릴레이를 만들지 않는다. 실제 발송 전 송신 포트, 도메인의 SPF/DKIM/DMARC, 역방향 DNS, 수신함 도착을 확인해야 한다. 이번 테스트는 외부 이메일을 보내지 않은 로컬 SMTP 테스트다.
- 인스턴스 장애는 API·DB·메일 모두에 영향을 준다. 운영 프로세스를 한 대에 두더라도 백업 복사본은 그 인스턴스 외부에 보관하고 복원을 검증해야 한다.
- 기존 `Dockerfile.dev`/entrypoint는 개발용 자동 마이그레이션 동작이 있으므로 운영 구성에서 사용하지 않는다. 새 Dockerfile은 스키마 변경 없이 기동한다.
- **S3 파일 저장·MediaConvert·결제 연동은 그대로다.** 회원/메일/DB 경로 전환 준비가 전체 AWS 인프라 제거를 의미하지 않는다. 미디어를 디스크로 이전하려면 파일 복사·기존 URL·백업·영상 처리에 대한 후속 작업이 필요하다.

## 검증

`AUTH_TEST_DATABASE_URL`을 명시한 loopback의 이름이 `_test`로 끝나는 폐기 가능한 DB에서 `npm run test:auth`를 실행한다. 테스트는 이 DB의 회원 관련 테이블을 비운다. 운영 URL을 전달하지 않는다.

이번 검증: 별도 Docker MySQL 8.0에 이전 Prisma 스키마 생성 → 추가 DDL 실행 → 타입/빌드 → 실제 DB 테스트. AWS 기본 경로는 SDK 네트워크 호출을 대체하여 분기와 계약을 확인했다. 실제 운영 Cognito 계정 로그인, 운영 DB 이관, 외부 메일 도달률, 부하 시험, 단일 인스턴스 운영 배포는 수행하지 않았다.

검증 결과: 실제 DB 인증 테스트 12개 통과(요청 제한 동시성은 5회 반복), TypeScript/Nest 빌드 및 Prisma validate 통과, 추가 DDL 적용 후 Prisma 스키마와 차이 없음. cognito/migration/local 세 모드 전체 Nest 모듈 초기화와 compose 구문 검사도 통과했다. Docker Hub 기본 이미지 메타데이터 조회가 진행되지 않아 이미지 빌드는 중단했으며, 컨테이너 이미지 실행 검증은 남아 있다.
