# 백업 실패 운영 알림

2026-11-04 작성. **사용자 승인 후 운영 설치·연결 테스트 발송 완료**다.
기존 `[crefans] operations` 전용 채널과 `TELEGRAM_OPERATIONS_*`만 재사용한다.

## 구성

- AWS Backup 서울 리전의 `crefans-backup` 볼트에서 FAILED/ABORTED/EXPIRED 이벤트 → EventBridge → Python 3.12 Lambda → Telegram.
- Lambda는 특정 Secrets Manager 비밀 1개 읽기와 자신의 로그 스트림 쓰기만 허용한다. 백업 조회·삭제·DB 권한 없음. 비밀에는 기존 봇 토큰/채널 ID 두 값만 저장한다.
- 서버 `crefans-backup.service`에 추가 drop-in `OnFailure=crefans-backup-alert.service`. 기존 백업 실행문/타이머 불변. 알림 전용 root:root 0600 JSON과 Python 모듈을 설치한다.
- Telegram getChat으로 채널 종류·정확한 제목을 검사한 후 전송한다. 원문 오류·로그·회원정보·토큰은 메시지에 넣지 않는다. HTTP 리디렉션 거절, 호출당 8초 제한.
- 서버 전송은 최대 3회, Lambda 비동기 실패는 2회 재시도한다. 네트워크 응답 유실 시 중복 알림 가능. AWS 이벤트는 best effort이며 서버 정지 자체는 OnFailure로 탐지할 수 없다.
- 아직 없는 백업 정리 함수의 오류 감시는 포함하지 않는다. 보관정리·S3 알림 수정·백업 삭제도 별도 작업이다.

## 검증 및 설치 상태

기준 커밋 `d01ffc6`, 작업 브랜치 `feat/backup-telegram-alerts`.
로컬 명령 `python3 -B -m unittest discover -s infra/platform/backup-alerts -p test_alerts.py -v`: 8개 통과, 종료 0.
잘못된 채널/범위/전송거절/비밀 포함 예외를 넣는 실패 대조를 포함한다. HTTP 응답은 대역이며 실수신 증거가 아니다.

최초 설치는 자동 승인 검토에서 차단되었으나, 2026-11-04 사용자가 비밀값 AWS 보관·알림 인프라·서버 설정·테스트 발송 전체 범위를 승인했다. 설치 후 IAM/EventBridge 범위와 서버 설정을 확인했고 Telegram API가 테스트 2건을 수락했다(메시지 ID 1509, 1510). 실제 장애 이벤트 발생·사용자 기기에서의 읽음은 검증하지 않았다.

설치·검증 절차(현재 완료):

1. 기존 리소스 충돌과 최신 소스 검사. 비공개 `.local/backup-alerts/deploy.py`는 최초 설치용이며 부분 성공 후 전체 재실행 금지.
2. IAM 특정 비밀/로그 범위, EventBridge 계정·리전·볼트·실패 상태와 Lambda 호출 SourceArn 제한 확인.
3. AWS test-event-pattern으로 실패 매칭/성공 제외 확인. Lambda에 `{"connectionTest":true}` 직접 호출하여 **실제 장애 아님** 표시와 Telegram API 승인 확인.
4. 서버 Python `server_notify.py --test`로 별도 시험. OnFailure drop-in·타이머 활성·파일 모드/소스 SHA 검증. 운영 백업 자체를 고의 실패시키지 않는다.
5. 결과를 증거로 남기고 dev→prod 통합. 변경 전 파일이 있다면 운영 밖 비공개 복구 저장소로 보관·검증한다. 운영에 복구 사본을 남기지 않는다.

토큰 변경 시 기존 앱 설정 외에 이 별도 비밀과 서버 알림 JSON도 함께 갱신해야 한다.

## 공식 근거 (2026-11-04 확인)

- [AWS Backup EventBridge](https://docs.aws.amazon.com/aws-backup/latest/devguide/eventbridge.html): 상태 이벤트 형식과 best-effort 전달. 실패 이벤트의 detail.state/backupVaultName 사용.
- [Secrets Manager 최소 권한](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_iam-policies.html): 특정 비밀 ARN의 GetSecretValue만 허용.
- [Lambda 비동기 오류 처리](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html): 오류를 삼키지 않고 재시도에 전달.
- [systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html): OnFailure 의존 유닛.
- [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage): 기존 운영 봇의 메시지 전송.
