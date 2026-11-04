import datetime
import json
import pathlib
import sys
import time
from notify import send


def main():
    # A separate root-only file contains only the existing bot's two settings.
    credentials = json.loads(pathlib.Path('/etc/crefans-backup-alert.json').read_text())
    test = sys.argv[1:] == ['--test']
    title = '백업 알림 연결 테스트 (실제 장애 아님)' if test else '서버 백업 실패'
    text = (f'[crefans] {title}\n환경: 운영\n대상: crefans-backup.service\n'
            f'시각: {datetime.datetime.now(datetime.timezone.utc).isoformat()}\n'
            '확인: systemctl status crefans-backup.service')
    for attempt in range(3):
        try:
            message_id = send(credentials, text)
            print(json.dumps({'delivered': True, 'messageId': message_id}))
            return
        except Exception:
            if attempt < 2:
                time.sleep(5)
    raise RuntimeError('Backup alert delivery failed')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Backup alert failed', file=sys.stderr)
        sys.exit(1)
