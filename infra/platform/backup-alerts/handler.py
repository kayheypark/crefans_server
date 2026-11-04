import json
import os
import re
from notify import send


def message(event):
    if event == {'connectionTest': True}:
        return '[crefans] AWS 백업 알림 연결 테스트 (실제 장애 아님)\n경로: Lambda → 기존 운영 텔레그램'
    detail = event.get('detail', {})
    if (event.get('source') != 'aws.backup'
            or event.get('detail-type') != 'Backup Job State Change'
            or event.get('account') != os.environ['EXPECTED_ACCOUNT']
            or event.get('region') != 'ap-northeast-2'
            or detail.get('backupVaultName') != 'crefans-backup'
            or detail.get('state') not in ('FAILED', 'ABORTED', 'EXPIRED')):
        return None
    # statusMessage, resource identifiers, and arbitrary text are deliberately omitted.
    job = detail.get('backupJobId', '')
    if not re.fullmatch(r'[A-Za-z0-9-]{1,100}', job):
        raise ValueError('Invalid backup job identifier')
    kind = detail.get('resourceType')
    kind = kind if kind in ('EC2', 'S3') else 'OTHER'
    return ('[crefans] AWS 백업 실패\n환경: 운영\n'
            f'상태: {detail["state"]}\n대상 유형: {kind}\n작업 ID: {job}\n'
            '확인: AWS Backup 서울 리전 → 작업 → 백업 작업')


def handler(event, context):
    text = message(event)
    if text is None:
        return {'ignored': True}
    import boto3
    try:
        credentials = json.loads(boto3.client('secretsmanager').get_secret_value(
            SecretId=os.environ['OPERATIONS_SECRET_ARN'])['SecretString'])
    except Exception:
        raise RuntimeError('Operations credentials unavailable') from None
    message_id = send(credentials, text)
    # Failed delivery raises, allowing Lambda asynchronous retries.
    return {'delivered': True, 'messageId': message_id}
