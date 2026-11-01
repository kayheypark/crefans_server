# 세션으로 보호하는 비공개 S3·CDN 미디어

현재 계약(2026-10-22): **주소만 공유받은 비구독자는 유료 파일을 볼 수 없다.** 브라우저의 `/api/v1/media/:id/file` 주소와 자체 로그인은 유지한다. CloudFront가 캐시를 조회하기 전에 현재 계정·구독 권한을 서버에 확인하고, 허용된 파일 바이트는 비공개 S3에서 CDN을 통해 전달한다. API는 파일 전체를 중계하지 않는다.

최신 전환의 배포·검증 결과는 [실행 증거](./media-edge-20261022.json)를 따른다. 이전 [이관](./media-migration-20261022.json), [API 스트리밍](./media-session-20261022.json), [레벨 공개](./membership-level-20261022.json), [CDN 조사](./media-cdn-research-20261022.json)는 당시 기록이다. 60초 서명 URL 방식은 폐기했으며 되돌리지 않는다.

## 저장과 전송

1. 신규 운영 업로드는 `MEDIA_STORAGE=s3`: 임시 디스크의 이미지 WebP 정규화/영상 헤더 검사 → 비공개 `platform/<UUID>` S3 저장 → DB COMPLETED. 실패하면 FAILED/삭제 표시 및 고아 정리 대상으로 남긴다. 영구 EC2 복제본은 만들지 않는다. 개발 local 및 과거 저장소 파일 읽기는 유지한다.
2. `beta.crefans.com`의 CloudFront 기본 동작은 API/프론트 원본으로 보내며 캐시하지 않는다. 보호 미디어 경로만 S3 원본을 사용한다. 같은 호스트의 세션 쿠키 범위를 넓히지 않는다.
3. Lambda@Edge **viewer-request**가 고정 HTTPS 원본 `beta-origin.crefans.com`의 `GET /api/v1/media/:id/edge-authorize`를 호출한다. 캐시 적중도 매번 검사하며 허용 결과는 캐시하지 않는다. HMAC은 요청의 목적·IP·시각·ID·미디어 메서드·경로·Range·인증 쿠키를 검증한다. 15초를 넘긴 서명이나 변조는 거부한다. 일반 원본 요청의 IP 서명은 IP·시각·요청 ID에 한정되고 미디어 허가에 재사용할 수 없다.
4. API는 기존 계정/세션·소유권·게시물 상태·상품/레벨·공개기간·성인 권한·파일 재사용 제한을 검사하고 `consumeContent`의 열람 기록/환불 경합을 유지한다. 파일 바이트를 읽지 않고 승인된 UUID 객체 키만 응답한다.
5. 엣지는 승인된 키만 `/platform/<UUID>`로 내부 변경한다. 쿠키/토큰은 S3에 전달하지 않고 캐시 키에도 포함하지 않는다. 관리형 캐시 정책과 S3 `max-age=0, s-maxage=86400` 메타데이터로 불변 파일을 공유 캐시한다.
6. viewer-response는 브라우저에 `private, no-store`, `Vary: Cookie`, `Cross-Origin-Resource-Policy: same-origin`, `nosniff`, `no-referrer`를 적용한다. 브라우저 저장과 CDN 내부 캐시는 별개다. 권한 API 실패/시간 초과는 503으로 파일을 거부한다.
7. legacy 파일은 승인 후 같은 호스트의 `/api/v1/media/:id/origin-file`로 307 전환한다. 이 API도 동일한 권한을 다시 검사한 뒤 스트리밍한다. 원본에 직접 도달한 `/file`도 보호된 API 스트리밍으로 작동해 롤백 경로를 제공한다.

GET/HEAD/Range 모두 검사한다. HEAD는 본문 없이 응답하고 Range는 206, 잘못된/복수/범위 밖 Range는 416이다. `MediaVideo`의 `media_retry=양의정수`만 재생 복구용 쿼리로 허용하고 매번 재인증 후 제거한다. 다른 쿼리·예전 서명 URL은 허용하지 않는다. Next 로컬 프록시도 HEAD·Range·연결 취소와 보호 헤더를 전달한다.

## 구독·공개 범위

- 상품 전용은 정확한 상품, 최소 레벨 공개는 동일 크리에이터의 **가입 당시 레벨**이 기준 이상인 정상 구독 및 해지예약 잔여 유료기간에 허용한다. 다른 상품이어도 최소 레벨 조건을 충족하면 허용하지만, 기존 상품 전용 글의 범위는 넓히지 않는다.
- 미구독·조건 미달·다른 크리에이터·미래 구독·만료·로그아웃/회수 세션·비활성 계정·환불 처리 중 접근은 거부한다. 소유자는 자신의 미게시 파일도 볼 수 있다. 공개 글/멤버십 표지로 같은 파일을 재사용해 유료 권한을 약화하지 않는다.
- 스튜디오 설정과 본문·댓글·미디어는 같은 정책이다. 계약은 [플랫폼 API](./platform-api.md), 구현은 `media.controller.ts`, `service.ts`, `media-edge-handler.ts`, `media-edge-protocol.ts`를 따른다.

## 인프라·운영·롤백

버킷은 BucketOwnerEnforced, 네 PublicAccessBlock, SSE-S3 AES256, HTTPS 강제. 해당 CloudFront 배포의 OAC에만 `platform/*` 읽기를 허용하며 다른 배포는 명시 거부한다. EC2 IAM 역할은 해당 접두어의 Get/Put/Delete만 허용하고 IMDSv2를 쓴다. S3 직접 URL은 비공개이며 CloudFront `/platform/*` 직접 경로도 파일을 제공하지 않는다.

코드 설정은 `MEDIA_STORAGE`, `S3_MEDIA_BUCKET`, `AWS_REGION`, `MEDIA_ROOT`, `MEDIA_EDGE_SECRET`이다. `MEDIA_AUTH_ORIGIN`은 Caddy/Compose의 원본 DNS/TLS 설정이다. 엣지 비밀은 비공개 패키지에만 넣고 로그/공개 증거에 남기지 않는다. Lambda@Edge의 환경변수 미지원 제약으로 us-east-1 번호 버전을 게시한다. 런타임과 함수의 비밀 회전은 함께 수행한다.

`infra/platform/provision-media-edge.py`는 기본 읽기 계획, `--apply`에서 단계별 변경한다. 순서는 prepare → functions → configure → allow → 실제 CDN 사전 검증 → cutover. 기존 beta DNS/배포 설정/버킷 정책을 비공개 상태 파일에 보존한다. cutover는 현재 함수 버전의 사전검증 통과와 배포 완료를 요구한다. 이전 `provision-media.py`는 `session-edge` 전환 후 실행을 거부해 실수로 배포를 닫지 않는다. 자세한 명령은 [운영 README](../infra/platform/README.md)를 따른다.

롤백은 먼저 `origin-only`로 CDN 미디어 동작을 제거해 전체를 보호된 API로 보내고 기존 beta DNS를 복원한다. 전파가 끝날 때까지 새 API의 엣지 서명 검증을 유지한다. 기존 S3 읽기를 실제로 확인한 이전 API 이미지와 백업 설정을 사용하며, DB 역 migration은 없다. **보호 없는 S3/CDN이나 폐기한 서명 URL로 롤백하지 않는다.**

실제 접속 IP는 Caddy 신뢰 경계에서 유효한 엣지 서명일 때만 사용한다. 임의 `X-Forwarded-For`나 엣지 헤더는 신뢰하지 않는다. 권한 조회는 기존 감사 원장에 남으며 원문 쿠키/서명은 기록하지 않는다. 원본 직접 접속도 기존 세션·IP 방어 규칙을 거친다.

## 검증과 한계

검증 증거에는 단위/HMAC 변조·만료·장애 대조, 격리 MySQL/실제 S3, 실제 CDN/운영 합성 계정, Chromium/WebKit PC·모바일, 캐시 적중·권한 철회·Range·재생/seek를 구분해 기록한다. 권한 있는 계정이 채운 캐시를 다른 세션이 볼 수 없어야 한다. 인증 원본이 실제로 응답하지 않는 단계에서도 캐시 파일이 503으로 거부되는지 베타 DNS 전환 전에 대조한다. 22개 동시 Range 검사는 한 구독에 대한 짧은 동시 요청 검사이며 22명 실사용 장시간 부하 검증은 아니다.

권한은 각 HTTP 요청 시점에 확인한다. 이미 허용된 연결이나 내려받은 바이트, 저장 사본·화면 녹화까지 회수하지 않는다. 로그인 쿠키 탈취/공유는 단순 URL 공유와 다른 계정 보안 문제다. WebKit 모바일 뷰포트 검사는 실제 iPhone Safari 검사가 아니다. HLS/ABR/DRM/트랜스코딩을 도입한 작업도 아니다.

S3 저장은 DB 백업을 대체하지 않는다. 정리(`MEDIA_DELETE_ENABLED`, 유예 최소7일)는 참조를 보존하고 삭제 실패 tombstone을 재시도한다. 실금융·실기기·장시간 부하·단일 호스트 장애/백업 복원은 별도 검증 범위다. EC2/DB 장애 시 CDN 캐시가 있어도 인증에 실패하여 접근을 차단한다.

재현 단위 검사는 `npm run build && node --test tests/platform-media-edge.test.cjs tests/platform-media-storage.test.cjs tests/platform-security.test.cjs`. 실제 AWS+격리 DB/브라우저는 아래처럼 명시 opt-in한다. 로컬 127.0.0.1:3307/crefans_platform_dev, 3011/3012, `.next-e2e`를 사용하며 공유 DB 검사는 순차 실행한다.

```sh
CREFANS_S3_E2E=true CREFANS_S3_BROWSER=true \
CREFANS_S3_E2E_STATE=.local/aws-beta/media-release/resources.json \
node --test tests/platform-media-cloud.integration.test.cjs
```

별도 운영 검증은 합성 회원·상품·구독·파일만 생성 후 삭제한다. 실제 PASS/PG 청구나 고객 데이터 변경을 통과한 것으로 해석하지 않는다.

## 비용과 공식 근거

현재 배포는 CloudFront Free 플랜을 유지한다. 파일 바이트가 EC2를 통과하지 않는 것을 실제 감사/캐시 응답으로 검증하지만 총 청구액 절감은 사용량을 측정해야 한다. S3 저장·요청, Lambda@Edge, 인증 API/DB 부하·지연은 남는다. 아래는 2026-10-22 조사 당시 산술이며 실제 월 청구액이 아니다. 일반 페이지/API 요청에도 실제 IP 서명을 위한 viewer-request 함수가 한 번 실행되므로 아래 **미디어만의 예시 외에 추가 호출 비용**이 있다.


2026-10-22 공개 정액 요금표: Free는 배포당 월 $0, 기준 사용량 100GB/100만 요청; Pro는 월 $15, 50TB/1,000만 요청. 초과 과금이 없다는 표현을 무제한 성능 보장으로 해석하지 않는다. 지속적·큰 초과 시 전달 성능 조정 가능성이 있으며 기존 사용량/계정/설정에 따른 가입 제약도 확인해야 한다. Lambda@Edge는 모든 등급에서 사용 가능하나 별도 종량 과금이다. [가격](https://aws.amazon.com/cloudfront/pricing/), [사용량·추가 과금 조건](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

AWS 원본 → CloudFront 전송은 $0/GB. Lambda@Edge는 100만 호출당 $0.60 + GB·초당 $0.00005001이며 128MB 실행 시간 단가는 초당 $0.00000625125다. [종량 가격](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/).

다음은 **실측이 아닌 비용 산술 예시**다. 성공 미디어 요청 100만 회, 매 요청 인증 함수 128MB·100ms와 응답 함수 128MB·1ms, 총 200만 함수 호출로 가정한다. 네트워크/DB 대기 시간도 인증 실행 시간에 포함된다.

- 인증 함수: $0.60 + 1,000,000 × 0.1 × $0.00000625125 = $1.225125.
- 응답 함수: $0.60 + 1,000,000 × 0.001 × $0.00000625125 = $0.60625125.
- 함수 합계 약 $1.83. Pro와 합쳐 약 **$16.83/월**은 CDN과 이 함수 예시만의 비용이다. 실제 인증 시간이 500ms라면 두 함수 합계 약 $4.33으로 증가한다.
- EC2/DB, S3 저장·요청(플랜 저장 크레딧 적용 여부), 로그, 인증 API의 소량 전송, 세금 등은 별도다. 영상 수가 아니라 Range 재요청까지 포함한 HTTP 요청 수로 산정한다. 실제 전송량·캐시 적중률·지연을 측정하기 전 절감액/총 운영비를 확정하지 않는다. 작은 사용량에서는 새 유료 플랜이 지금보다 비쌀 수도 있다.


2026-10-22 확인한 직접 근거: [OWASP 요청별 권한 검증](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [AWS 외부 인증 구조](https://aws.amazon.com/blogs/networking-and-content-delivery/external-server-authorization-with-lambdaedge/), [트리거 실행 순서](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-cloudfront-trigger-events.html), [S3 OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [Lambda@Edge 제약](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html), [함수 조합 제약](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html), [S3 Range](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html). 공식 지원 패턴을 크레팬스의 현재 권한 정책에 적용한 것이며 모든 업계의 의무 표준이라고 주장하지 않는다.

## 새 크리에이터 게시물 워터마크 (2026-11-01)

사용자 확정 범위: 배포 후 활성 크리에이터가 새로 업로드한 **게시물** 사진·동영상만 오른쪽 아래 `https://crefans.com/{업로드 시점 핸들}`을 파일에 합성한다. 프로필·배경·멤버십 대표 사진과 배포 전 업로드는 제외한다. 기존 게시물을 다시 저장해도 예전 파일을 변환하지 않으며, 기존 콘텐츠 일괄 변환 작업은 없다. 핸들이 바뀌어도 이미 저장된 워터마크는 갱신하지 않는다.

- `media.controller.ts`가 신규 업로드의 metadata에 적용 버전·서버 회원 핸들을 저장한다. 업로드만으로는 변환하지 않는다.
- `studio.service.ts`에서 게시물에 연결할 때만 `media-watermark.ts`가 원본 소유권·적용 대상 여부를 확인하고 새 UUID의 파생 Media와 `media_watermark_jobs`를 같은 트랜잭션으로 만든다. source_id/target_id 고유 제약과 원본 행 잠금으로 재저장·중복 실행을 제어한다.
- 게시물은 파생 파일을 참조하고, 원본은 덮어쓰지 않는다. 사진은 WebP(긴 변 최대2560px, 작은 이미지는 확대하지 않음), 영상은 H.264/AAC MP4(긴 변 최대1280px)로 변환한다. MOV는 기존 MP4 정규화 다음 워터마크를 합성한다. 이미지 방향·영상 비율을 유지하고 위치 등 메타데이터는 제거한다.
- `worker.ts`의 미디어 루프는 금융 배치와 독립이고 한 번에 한 건만 처리한다. 작업 임대25분, FFmpeg 상한20분, 실패 시2분 뒤 최대3회 시도한다. 완료 전에는 기존 미디어 권한 검사가 파일을 제공하지 않는다. 최종 실패는 스튜디오에서 삭제 후 다시 업로드하며, 운영 감시에 실패·임대 만료 건수를 기록한다.
- 키는 기존 `platform/{새 UUID}` 규격이므로 CDN 캐시와 서명·구독 검사 계약을 바꾸지 않는다. GET/HEAD/Range 접근 제어는 기존 공통 경로를 그대로 사용한다. 처리 대기·진행·실패 작업의 원본과 파생 파일은 고아 정리 대상에서 보호한다. 완료된 뒤 참조 없는 원본은 기존 정리 유예 정책을 따른다.
- DB 변경은 `20261101150000_media_watermark`의 작업 테이블 추가뿐이다. 배포 전 백업 후 `migrate deploy`하며, 앱 롤백 시 추가 테이블과 원본은 유지한다. 롤백 중 새 작업은 진행되지 않으므로 재배포 후 재개한다.

확인일2026-11-01 공식 근거: [FFmpeg drawtext](https://ffmpeg.org/ffmpeg-filters.html#drawtext)의 textfile·expansion=none을 사용하고 사용자 문자열을 필터 문법에 삽입하지 않는다. [Sharp composite](https://sharp.pixelplumbing.com/api-composite/)에 따라 방향 정규화 뒤 작은 SVG 스트립을 합성한다. [OWASP 파일 업로드 지침](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)의 형식·크기·소유권 검사 및 비공개 저장 원칙을 유지한다. 이 근거는 워터마크의 제거 불가능성이나 저작권 보호를 보장하지 않는다.

검증: `tests/platform-watermark.test.cjs`는 격리 MySQL·실제 이미지 처리·S3 대역으로 신규/기존/비크리에이터·소유권·재시도·중복·정리 보호를 검사한다. `tests/platform-watermark-render.integration.cjs`는 배포 Linux 이미지의 실제 FFmpeg·Sharp로 가로/세로 MP4/WebM·오디오·회전·고해상도 사진을 검사한다. 운영 반영 및 실행 결과는 PROGRESS와 해당 릴리스 증거에 별도로 기록한다.

운영 반영·최초 실패/보완·실행 명령·해시·경계는 [2026-11-01 워터마크 검증 증거](./watermark-20261101.json)를 참고한다.
