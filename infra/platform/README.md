# 단일 서버 플랫폼 배포

2026-10-25 베타 정책 적용 전 확인: [API 정책 절](../../docs/platform-api.md#확정-베타-정책-구현-2026-10-25). 추가 migration2개 → DB 금융정책2000bps/7일(version/감사) → `BETA_MODE=true`·초대 명단·Toss 개별 테스트 키·실출금 off → API/worker/프론트 검수 순서다. 빈 초대 명단은 거부한다. 광고 메일은 `MARKETING_MAIL_ENABLED=false`로 준비하고 별도32자 이상 수신거부 서명키·문서 시행/처리사실·실SMTP 검증·발송 승인 후 활성화한다. 서명키를 바꾸면 기존 링크가 무효가 되므로 기존 철회 경로를 먼저 확보한다. 현재 새 migration은 전용 테스트 DB에만 적용했으며 운영 개방/배포는 수행하지 않았다.

프론트/백엔드 두 저장소를 같은 부모 경로에 둔다. `/preview/*`는 목업으로 유지하고 `/service/*`는 실제 데이터 페이지다. Caddy가 HTTPS와 동일 출처 `/api/v1` 프록시를 제공한다. DB/API는 외부 포트를 열지 않는다. DB와 미디어는 영속 volume으로 분리한다.

1. `runtime.env.example` → `runtime.env`, `.env`에 APP_DOMAIN / DB_PASSWORD / DB_ROOT_PASSWORD 설정. 인증 비밀은 최소 64문자 무작위, DATA_ENCRYPTION_KEY는 32바이트 hex. URL 내 DB 비밀번호는 percent encode한다.
2. 두 저장소 검사·이미지 빌드 후 DB만 먼저 실행한다.
3. DB 백업/복구 검증 후 해당 이미지에서 `prisma migrate deploy`를 명시적으로 실행한다. API 시작 시 자동 migration/seed하지 않는다. 기존 구독의 가입 당시 snapshot은 마이그레이션 시 대조해야 한다. 과거 혜택을 현재 혜택으로 임의 복원하지 않는다.
4. API/frontend/worker/proxy 실행, `/api/v1/health` DB 준비 상태 확인.
5. DNS/TLS, HTTPOnly/Secure 쿠키, SMTP 테스트발송, PASS 어댑터 서명, Toss 테스트 키 결제/재시도/환불, 은행 테스트 환경, 볼륨 권한을 검증한다.
6. 수수료·정산·환불 정책 확정 후 설정한다. 은행 송금·미디어 삭제는 기본 off. 미디어 정리는 한국 시간 매일 19시, 보존기간 미설정이면 삭제하지 않는다.

## 운영 데이터 / 복구

MySQL 백업과 미디어 volume 백업은 같은 배포 버전으로 보관한다. `mysqldump --single-transaction` 또는 운영 DB의 일관성 스냅샷을 사용하고 별도 저장소·접근제어·보존 정책을 운영자가 설정한다. 회원 인증 토큰/암호/계좌/CI/메일코드는 로그 수집하지 않는다. 배포 롤백은 이전 앱 이미지와 호환되는 추가형 migration을 사용하고, DB 역 migration은 백업 복구 계획 없이 실행하지 않는다.

2026-10-07 검증 당시 Docker daemon이 로컬에서 꺼져 있어 이미지 실행 검증은 아직 수행하지 않았다. 로컬 MySQL(3307)과 API(3001)로 HTTP/DB 통합 검증을 수행한다. PASS/은행 공급자별 bridge 구현은 docs/provider-contracts.md의 경계에 연결해야 한다.

## 첫 설정과 이관

- 새 기본 계정이나 공용 관리자 비밀번호를 만들지 않는다. 확인된 운영 회원을 `platform:admin -- --member-id=<UUID> --apply`로 지정하고 관리자 v1 API로 활동 분야와 공개 약관·FAQ·공지를 등록한다. 약관 미게시 상태의 signup은 차단한다.
- `platform:audit`는 snapshot 누락·이전 평문 billing key·갱신 결제수단 누락 등을 숫자로만 보고한다. 운영 데이터에 실행하기 전 DATABASE_URL/runtime 파일을 명시한다. 과거 가입 조건은 확인한 원문을 이관하고 현재 멤버십으로 임의 대체하지 않는다.
- 기존 AWS 회원 import 도구는 유지하되 신규 API 런타임에 Cognito를 등록하지 않는다. 기존 S3 버킷은 비공개로 전환하고 실제 IAM/변환본 경로/Range 재생을 검증한다. 개발 기본은 local, 운영 신규 업로드는 `MEDIA_STORAGE=s3`의 비공개 S3 저장이며 CDN은 viewer-request의 현재 세션/구독 검사 후 전송한다. bearer 서명 URL은 금지하고 직접 API 스트리밍은 동일 권한의 롤백/호환 경로로 유지한다. 임시 업로드 및 기존 파일을 위해 media volume은 유지한다. [비공개 미디어 운영](../../docs/private-media.md)을 따른다.
- PASS 콜백은 검증된 실명/안정적 CI/성인 확인을 포함한다. 성인 표시된 기존 게시물은 서버의 성인 본인인증 증명 없는 사용자에게 본문·미디어를 반환하지 않는다.
- DB 수수료율/정산 보류 정책과 `RENEWAL_MAX_RETRIES`, `RENEWAL_RETRY_HOURS`, 미디어 보존기간을 실제 사업 정책으로 확정한다. 값이 없는 결제·갱신·삭제를 임의 정책으로 실행하지 않는다.
- 인증/암호화 비밀값은 DB 백업과 별도로 안전하게 보관한다. CI HMAC과 기존 AES-GCM 데이터를 사용하므로 키 변경에는 재암호화/식별값 이관 계획이 필요하다.

## 작업 상태 확인

`platform_jobs`의 worker-health는 마지막 완료 시각과 작업별 실패 개수만 저장한다. 미디어 정리는 19시 이후 그날 한 번 claim하여, 19시에 서버가 꺼져 있었어도 같은 날 다시 시도한다. deletion=false 또는 보존기간 미설정이면 파일을 삭제하지 않는다. 멤버십 과거 버전·게시물·프로필 참조 파일은 유지한다.

정기 갱신/승인 불확실성/환불/은행 pending 작업은 DB 상태를 유지하며 같은 키로 재확인한다. 처리 중 결제·장기 pending 출금은 운영자가 점검한다. 로그에는 공급자 응답 전문·세션·계좌·이메일 코드·CI를 쓰지 않는다. 배포 설정 문법 검증은 수행했고 당시 Docker daemon이 꺼져 있어 이미지 실행·TLS/볼륨 검증은 미수행 기록이다. 이번 문서 감사에서 이를 운영 성공으로 갱신하지 않는다.

## 로컬 실제 토스 테스트 빌링
백엔드 저장소에서 `npm run dev:billing`로 API3001과 worker를 함께 시작한다. 기존 API를 먼저 종료하고 프론트3010은 중복 실행하지 않는다. `.local/platform.env`의 개별 test_ck/test_sk 키 및 로컬3307/crefans_platform_dev DB만 허용한다. 운영 키/다른 DB는 시작 거부한다. 첫 승인 후 구독 권한·내역을 저장하고 worker가 60초 간격으로 만기 갱신/불확실 승인/빌링키를 처리한다.
이 모드의 수수료10%/정산보류0일/재시도2회·1시간은 검증용이며 사업 정책 확정이 아니다. 미이용 전액 환불은 서버 이용 기록으로 판정하고 기간 제한용 구형 REFUND_WINDOW_DAYS는 쓰지 않는다. 송금과 파일 삭제는 비활성이다. 운영 배포는 확정된 정책과 라이브 빌링 계약/키를 기존 API·worker 컨테이너에 설정한다. 로컬 테스트 모드가 운영 실청구를 활성화하지 않는다.


### DB 수수료·정산 정책 (2026-10-21)

`financial_policies`의 `id=platform` 행에서 `platform_fee_bps`(0~10000, 1000=10%)와 `settlement_hold_days`(0~365)를 관리한다. migration은 값이 비어 있는 version0 행만 생성한다. 운영에서 초기값을 임의로 채우지 않으며 미설정이면 신규 결제는 FINANCIAL_POLICY_REQUIRED로 중단한다. 이전 PLATFORM_FEE_BPS/SETTLEMENT_HOLD_DAYS 환경 키는 더 이상 읽지 않는다.

기존 SUPER_ADMIN 계정의 쿠키 세션으로 GET `/api/v1/admin/financial-policy` 후 PUT으로 변경한다. JSON 예시(정책 확정값이 아닌 단위 예시): `{"expectedVersion":0,"platformFeeBps":1000,"settlementHoldDays":7,"reason":"승인된 운영 정책 최초 등록"}`. 최신 version을 반드시 전달한다. 이력은 GET `/api/v1/admin/financial-policy/history`(최근100개). 2026-10-22 사용자 지정 수수료20%는 운영 DB에 2000bps 초기값으로 저장했고 감사 원장에 남겼다. 보류기간 null·version0으로 완성 정책은 아직 미발행이며 결제 차단을 유지한다. 보류기간 합의 후 2000bps와 함께 기존 API로 version1을 발행한다. 재시작 없이 신규 구독 최초 결제 시 반영하며, 기존 구독·거래·복구 중인 승인에는 snapshot을 유지한다. 출금 수수료/최소 출금액/재시도는 이 DB 정책의 관리 범위가 아니다.

API 변경은 새 버전과 변경자/이유/시각을 같은 DB transaction으로 저장한다. DB 도구로 직접 수정하면 실행 중인 서버도 다음 신규 결제에 값을 읽지만 API 감사 이력은 남지 않으므로 운영 변경은 위 API를 사용한다. 관리자 UI는 이번 범위에 포함하지 않았다.

로컬 `dev:billing`은 기존 테스트값10%/0일을 비어 있는 version0 행에만 한 번 저장하며, 이후 바뀐 값을 재시작 시 덮어쓰지 않는다. 이는 운영 정책 확정이 아니다. `npm run test:policy`는 기존 loopback3307 개발 연결을 검증하고 E2E 전용 DB를 사용한다. E2E 서버와 MySQL named lock을 공유하며 사용 중이면 실패한다. 테스트 전 정책/이력을 보존하고 종료 시 복원한다. 새로운 DB 권한 부여는 필요하지 않다.


## 최초 EC2 베타 배포 기록 (2026-10-21)

아래는 최초 배포 당시 구성이다. 2026-10-22부터 신규 미디어는 비공개 S3·세션 검증 CloudFront로 분리되었으며 EC2 전용 S3 역할/IMDSv2 hop2를 적용했다. 현재 구성은 하단 CDN 절과 [비공개 미디어 운영](../../docs/private-media.md)을 따른다.

당시 사용자 승인 구성은 서울 ap-northeast-2, t3a.medium 1대(standard CPU credits), Ubuntu 24.04, 암호화 gp3 50GiB와 공인 IPv4 1개다. DB·미디어는 같은 서버의 named volume이며 이번 베타에서는 사용자 요청으로 백업을 구성하지 않는다. RDS/ALB/NAT/CDN은 만들지 않는다. 비용 추정은 월730시간 기준 세전 USD42.374에 사용량·세금 별도이며 실제 과금 상한이 아니다.

배포 대상은 beta.crefans.com으로 분리한다. 새 전용 보안 그룹의 80/443만 인터넷에 공개하고 SSH22는 승인한 관리 PC의 /32로 제한한다. 기존 EC2 키를 재사용하며 IAM 역할·정책·새 자격증명은 만들지 않는다. DB3306/API3001/frontend3010은 호스트에 게시하지 않는다. IMDSv2 required/hop1과 EBS 암호화를 적용한다. 런타임에는 AWS 관리자 키를 복사하지 않는다.

`bootstrap-ubuntu.sh`는 새 Ubuntu 호스트용 user-data다. Docker 공식 apt 저장소에서 설치하고 컨테이너 로그 회전, 키 기반 SSH, 암호화 루트 디스크 내 2GiB swap을 구성한다. 기존 호스트에 무단 실행하는 스크립트가 아니다. `compose.beta.yml`은 기존 compose.yml에 메모리 한도와 검증된 이미지 태그를 덧씌운다. `.env`의 API_IMAGE/FRONTEND_IMAGE를 설정하고 `docker compose -p crefans-beta -f compose.yml -f compose.beta.yml up -d --no-build`로 실행한다. 이미지/설정은 비공개 전송하고 registry 공개 업로드나 GitHub push는 하지 않는다.

빈 DB에서 database만 먼저 시작하고 준비 상태를 기다린 뒤 같은 compose 명령의 `run --rm -T --interactive=false api npx prisma migrate deploy`로 migration을 명시 적용한다. 로컬 DB·회원·결제 데이터를 복제하거나 기본 관리자 계정을 만들지 않는다. 이후 전체 서비스를 시작한다. 수수료 정책은 미설정 상태를 유지한다. PASS 미연동·약관 미게시·금융 정책 미설정에 따른 차단을 가짜 성공으로 바꾸지 않는다. 토스는 test 키만 전달하고 출금·파일 삭제는 false다. 새 DB에서는 실가입/실거래까지 완료된 베타라고 주장하지 않는다.

2026-10-21 최초 새 보안 그룹 생성은 자동 승인 심사가 구체적 공개 포트와 관리 IP의 별도 승인 부족으로 거절했고 당시 AWS 변경은 실행되지 않았다. 이후 사용자가 해당 범위를 명시 승인해 같은 날 EC2/DNS/HTTPS 배포를 완료했다. private `.local/aws-beta/plan.json`에 승인 명세, `.local/aws-beta/resources.json`에 신규 리소스 ID를 기록했다. 재시도 전 기존 리소스를 조회해 중복 생성하지 않는다. 롤백은 기록된 베타 DNS/신규 인스턴스/EIP/전용 SG만 대상으로 하며 기존 계정 자원·IAM 정책은 건드리지 않는다. 인스턴스 삭제는 데이터 손실을 유발하므로 삭제 전 사용자 확인을 받는다.

근거 확인일2026-10-21: [Docker Ubuntu 설치](https://docs.docker.com/engine/install/ubuntu/), [AWS 웹/SSH 보안 그룹 기준](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html), [AWS IMDS 옵션](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html), [Canonical 공식 AMI 조회](https://ubuntu.com/aws/docs/aws-how-to/instances/find-ubuntu-images/). SSH 제한/공식 설치/IMDSv2를 적용하는 기술적 판단이며 공급사 운영 검증 완료를 뜻하지 않는다.


### 베타 실제 접속 및 검증 결과 (2026-10-21)

- 실제 서비스: https://beta.crefans.com/service/feed, 목업: https://beta.crefans.com/preview/landing. `/`는 신규 피드로302, HTTP는HTTPS로308 이동한다. 기존 crefans.com apex와 메일 DNS는 변경하지 않았다. EC2 i-0c24409aae93555f2, 고정IPv4 15.164.140.26. 베타 비용은 생성 시점부터 발생한다.
- 앱 이미지2개는 사전검증 linux/amd64 archive를 SSH로 비공개 전달하고 SHA256 대조 후 로드했다. 새 DB에12 migrations, 앱/worker/MySQL/Caddy5개 컨테이너 정상 실행. DB/API/frontend 호스트 포트 비공개, proxy80/443만 게시. 런타임600/디렉터리700, AWS 관리자 키 미전달. 업로드 임시 archive는 원격에서 정리하고 로컬 비공개 사본은 보존한다.
- 공개 HTTPS14검사 PASS: 루트 이동·실제 화면4·목업3·설정파일 경로2·health v1·익명 관리자401·업로드401·잘못된 Origin403. TLS 인증서 검증을 끄지 않았다. Chrome에서 피드/알림/내 프로필 hydration 및 랜딩 목업 표시, 관측 console error0 확인. SMTP STARTTLS 연결/인증은 원격에서 통과했고 실제 메일은 발송하지 않았다. worker-health 완료/실패0은 빈 DB에서 작업 tick이 정상 수행됐다는 증거이며 실제 갱신/송금 성공 증거가 아니다.
- 구형 포괄 페이지 라우트 때문에 /.env와 /runtime.env 요청에 HTML200이 나왔고 파일 노출은 없었다. Caddy의 별도 handle matcher로404 처리했다. 첫 respond 단독 규칙은 fallback handle 뒤로 정렬돼 검사에 실패했고, 공식 [handle 상호 배타 라우팅](https://caddyserver.com/docs/caddyfile/directives/handle)과 [directive order](https://caddyserver.com/docs/caddyfile/directives#directive-order)를 확인해 수정했다(확인2026-10-21). 구문 검증만으로 완료하지 않고 공개 HTTP 재검사로404를 확인했다.
- 신규 DB는 회원/구독/주문0, 금융 정책 version0/null 상태다. PASS 실연동·공개 약관·사업자 금융 정책·갱신 재시도 정책 설정 없이 실제 회원가입/금융 출시가 완료된 것으로 보지 않는다. 토스는 test 키만 적용, 출금/미디어 삭제 false. 백업·운영 부하·실메일 수신·실금융·은행/PASS 검증은 이번 배포 범위에서 완료하지 않았다.
- 상세 증거는 프론트 docs/audit/aws-beta-deployment-20261021.json, 준비 증거는 aws-beta-preparation-20261021.json. 기존 local3010/3001/3307은 유지했다. 이후 배포는 새 검증 이미지 태그를 전송하고 migrate deploy를 명시 적용하며, SSH heredoc에서는 compose run에 -T --interactive=false를 주어 다음 셸 명령의 stdin을 소비하지 않게 한다. 이미지 rollback과 DB 호환성을 별도 확인하며 DB를 자동 역 migration하지 않는다.

## Operations 알림과 API 자동 차단

`TELEGRAM_OPERATIONS_BOT_TOKEN`/`TELEGRAM_OPERATIONS_CHAT_ID`를 private runtime.env에 입력한다. 봇은 `[crefans] operations` 채널 게시 권한이 필요하다. NC·UBA 봇을 재사용하지 않는다. 값이 없으면 이벤트는 큐에 남고 전송완료로 처리하지 않는다. wrong-channel 대조 검증을 포함하며 상세 설계는 docs/platform-implementation.md.

Compose private network는172.30.90.0/24, 동적주소범위172.30.90.128/25(고정주소 충돌 방지), Caddy172.30.90.2이고 TRUSTED_PROXY_IPS=172.30.90.2를 같이 설정한다. 기존 네트워크가 다른 subnet이면 컨테이너·네트워크 교체를 계획하고 **기존 DB/media named volume은 보존**한다. `down -v` 금지. 새 IP 대역이 기존 VPN/Docker와 충돌하면 모두 함께 바꿔 검증한다. 로컬 직접 API는 TRUSTED_PROXY_IPS를 비운다. Docker json-file 로그는 서비스별10MiB×3 순환. worker-run/전송완료 큐는30일 정리, 전송실패 큐는 유지한다.

배포 전 새 migration2개를 명시 `migrate deploy` 적용하고 새 이미지/API·worker/Caddy·신뢰 IP를 함께 반영한다. 기존 이미지로 보안 기능이 활성화됐다고 주장하지 않는다. `npm run test:operations`는 전용 E2E 및 로컬3307 DB 조건을 확인해야 한다. `SECURITY_TEST_DATABASE_URL`에는 loopback3307의 crefans_*test DB만 허용한다. `python3 tests/platform-proxy.py`는 캐시된 caddy:2-alpine·crefans-api:beta-20261021 이미지로 테스트 전용 네트워크/컨테이너를 만들고 finally 제거한다. 상용 DB/금융/Telegram 실발송은 하지 않는다.

적용 후 정상조회→탐지403→2회 API차단→만료/관리 해제, 5xx 원본IP, 실제 Telegram 수신, 실제 worker 무작업1시간 요약을 검증한다. 2026-10-22 베타에 operations-20261022 이미지와14 migrations 적용, 실제 IP/탐지/차단/해제/오류큐/worker를 검증했다. 전용 봇 값은미설정이므로 실수신은미완료. 배포용 임시SSH규칙은제거했다. 상세 증거는 프론트 docs/audit/operations-deployment-20261022.json 및 PROGRESS 최신 로그다.

실제 Telegram 연결 확인은 빌드 후 `node scripts/platform-operations-test.cjs`. 명시적 실행 시 그 명령이 만든 합성 연결확인 이벤트 한 건만 대상으로 전송한다. 전용 채널 ID까지 private env에 설정해야 하며 API 접수와 채널 UI 실수신을 별도로 확인한다. 자동화 테스트는 CREFANS_E2E=true로 전송 타이머를 끄고, 실봇 연결된 일반 개발 API/worker를 동시에 돌리는 상태에서 fixture 테스트를 실행하지 않는다.

실제 운영 IP 할당 충돌을 피하려고 고정 Caddy .2를 동적 ip_range(172.30.90.128/25) 밖에 둔다. 정의 근거는 [Docker Compose IPAM](https://docs.docker.com/reference/compose-file/networks/#ipam), 확인2026-10-22. 배포용 schema/app 준비 명령은 일반 Docker --env-file로 dotenv 파일을 읽지 말고 Compose run의 env_file 파싱을 사용한다. 값·DB URL을 에러로 출력하지 않는다.

### 독립 운영 콘솔·전용 Telegram (2026-10-22)

관리자는별도crefans_admin소스/이미지이며 https://admin.crefans.com/console. 실제운영은 compose.yml + compose.beta.yml + compose.admin.yml 세파일을함께사용한다. ADMIN_IMAGE/ADMIN_DOMAIN설정,관리자384MiB/readonly/비루트·호스트3002포트비공개·비밀값전달없음. Caddy의관리자admin/auth허용API만직접API로전달하여trustedproxy IP규약을유지하고다른API404, 정확한Origin/host-onlySecure쿠키. 사용자요청신규운영자만수동bootstrap후실로그인검증,기본계정/기존회원덮어쓰기없음. 전용crefans_operations_bot의게시만권한과local/beta실수신확인,토큰공개문서복제금지. 기존14migration상태확인만수행,DB/미디어/Caddy볼륨과이전이미지보존. 롤백설정 /opt/crefans-backup-admin-20261022(700). 근거·미검증범위는crefans_admin/docs/deployment-20261022.json.

```sh
sudo docker compose -p crefans-beta -f compose.yml -f compose.beta.yml -f compose.admin.yml ps
```


## 사고 추적 로그 확장 (2026-10-22, 운영 미적용)

[운영 로그 문서](../../docs/operational-logging.md)에 수집/권한/보관/검증/외부 보관·감시 절차를 정리했다. 배포 시 새 audit_logs migration을 `migrate deploy`로 적용한 후 검증된 API/worker/프론트/콘솔과 Caddy 설정을 함께 갱신한다. APP_RELEASE는 검증한 이미지 식별자로 지정하고, worker가 정상 실행된 뒤 API `OPERATIONS_WATCHDOG_ENABLED=true`를 활성화한다. 감사/접근 로그 보관기간은 runtime.env.example 설명을 따른다. 현재 로컬3307 dev/E2E만 migration 적용했으며 운영 DB는 변경하지 않았다.

선택 파일 compose.cloudwatch.yml은 기본+beta+admin 뒤에 마지막으로 합친다. Compose2.24.4 이상, 별도 로그 그룹·기간·비용·EC2 역할·LOGS_AWS_REGION/LOGS_GROUP가 필요하다. 쓰기 권한 예시는 cloudwatch-role-policy.json.example. 기본 배포에는 자동 활성화하지 않는다. 별도 호스트용 external-monitor.env.example, crefans-monitor.service/timer, scripts/platform-external-monitor.cjs도 아직 미설치다. API/프록시 구조화 stdout 전송은 DB 감사 원장의 전체 백업이 아니다.

## 세션 인증 CDN 배포 (2026-10-22)

- `provision-media-edge.py`의 기본 동작은 상태 조회. 명시한 --apply/phase로 prepare(원본 DNS·ACM), functions(검증된 컴파일 코드와 비공개 secret), configure(캐시 정책·Lambda 버전), allow(특정 배포 OAC만), cutover(실전 검증 증거 확인 후 beta DNS)를 순서대로 실행한다. 기존 전용 리소스 journal/배포 전 상태를 보존한다.
- 원본 전용 `MEDIA_AUTH_ORIGIN=beta-origin.crefans.com`을 Compose .env에, `MEDIA_EDGE_SECRET`을 API/worker runtime.env에 둔다. 32 랜덤 바이트의 64자리 hex이며 엣지 배포 패키지에도 동일 값을 비공개로 넣는다. Lambda@Edge 환경변수는 지원되지 않는다. 코드/로그/공개 증거에 비밀값을 저장하지 않는다.
- 앱 기본 경로는 CachingDisabled, 미디어 UUID 경로만 관리형 캐시 정책 + viewer-request 현재 권한 검사 + viewer-response no-store. Lambda가 서명한 IP만 Caddy 신뢰 경계에서 인정한다. 직접 원본 요청은 기존 socket 기반 규칙과 권한을 유지한다.
- `origin-only`는 CDN의 미디어 동작을 제거해 같은 권한 API 스트리밍으로 돌리고 이전 DNS를 복구한다. 전파 완료 후 필요하면 API 이미지를 직전 릴리스로 복구한다. DNS 전파 중에 먼저 인증 함수를 제거하거나 S3 공개 권한을 부여하지 않는다. 구형 `provision-media.py --apply`는 session-edge journal을 거부해 새 CDN을 뜻하지 않게 폐쇄하지 않는다.
- 배포 단계·검증 결과·현재 한계는 [미디어 운영 문서](../../docs/private-media.md)의 최신 항목과 PROGRESS를 따른다.


## 콩 상품 운영 테스트 배포 (2026-10-25)

1. 원장 `20261025120000_bean_ledger`와 상품 `20261025130000_bean_product`는 추가 migration이다. 기존 실제 DB 백업·적용 내역을 확인한 후 배포 작업에서만 `prisma migrate deploy`한다. 운영 seed/db push/migrate dev는 사용하지 않는다. genesis는 고유 초기 이동1건으로만 회사1억/발행대조-1억을 만든다.
2. API/worker는 BEAN_LEDGER_ENABLED=false, BEAN_LIVE_PAYMENTS_APPROVED=false로 먼저 배포한다. 프론트/콘솔은 서버 feature 값으로 실제 진입을 제어하며 목업 링크는 그대로 유지한다. 이번 작업은 로컬 격리 DB와 공급사 대역만 적용했다.
3. 테스트 개별 결제키·BETA_MODE=true·은행 off에서 원주문/승인/지갑/프로모션 우선 후원·중복/취소/권한을 확인한다. PG webhook URL은 HTTPS의 `/api/v1/beans/webhook`, 본문은 재조회 신호이고 승인 근거가 아니다. API와 worker에 같은 flag/환경을 적용한다.
4. 실제 PG의 충전·후원·환금성 판매 승인과 법정 환급/동의 문서가 확인되기 전 live gate를 켜지 않는다. 실제 본인계좌/은행 bridge·입금 증빙과 수요일 지급 검수 전 BANK_PAYOUTS_ENABLED를 켜지 않는다. 테스트콩은 live 출금 재원으로 승격되지 않는다.
5. 미확정 PG/은행 작업이 있으면 기능을 끄고 잊어버리지 않는다. 새 요청 진입을 중지하고 같은 주문·지급ID로 결과를 확인한 뒤 종료한다. 코드 롤백은 추가 테이블·원장/lot/예약 기록을 보존하며 역 migration으로 금융 이력을 삭제하지 않는다.

신규 검수: 서버 `npm run build`, `CREFANS_E2E=true node --test --test-concurrency=1 tests/platform-beans.test.cjs tests/platform-bean-ledger.test.cjs tests/platform-openapi.test.cjs`; 프론트 `npm run check`, `npm run test:e2e -- e2e/beans.spec.ts --project=chromium`; 콘솔 `npm run check`, `npm run build:verify`, `npm run test:e2e -- e2e/beans.spec.ts`. 같은 전용 E2E DB를 쓰는 서버/프론트/콘솔 검사는 순차 실행한다. 근거는 프론트 docs/audit/bean-product-20261025.json이다.

현재 운영은 beans-20261025, BEAN_LEDGER_ENABLED=true/BETA_MODE=true이며 live 판매·실출금·광고메일은 false다. 이전 준비 단계의 기본 off와 구분한다.17→21migration과 회사초기1억, DB 수수료20%/보류7일 version2,HTTP16/브라우저6·배치정상/원장균형/실행소스747파일을 확인했다. 실제 판매승인·법정환급/약관·은행 검증은 남아 있다. 배포 증거: 프론트 docs/audit/bean-deployment-20261025.json.

배포시 주의: `API_IMAGE=new compose ...`처럼 sudo 앞의 쉘 환경만 바꾸면 sudo가 제거하여 구버전으로 실행될 수 있다. `sudo -n env API_IMAGE=검증태그 docker compose ... run --rm --no-deps -T --interactive=false api npx prisma migrate deploy`처럼 명시한다. bash stdin으로 스크립트를 전달할 때 compose run이 나머지 명령을 읽지 않도록 비대화형을 사용한다(의도적인 node heredoc 전달은 예외). 새 이미지의 migration 파일 수와 실제 DB 완료 수/회사원장/worker-health를 함께 대조하며 HTTP200만으로 완료로 판단하지 않는다. 롤백은 앱/설정만 복구하고 추가원장·정책감사는 보존한다.
