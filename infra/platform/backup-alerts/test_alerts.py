import io
import json
import os
import unittest
from unittest.mock import patch, MagicMock
import handler
import notify


class Alerts(unittest.TestCase):
    def setUp(self):
        os.environ['EXPECTED_ACCOUNT'] = '123456789012'
        self.event = {'source': 'aws.backup', 'detail-type': 'Backup Job State Change',
                      'account': '123456789012', 'region': 'ap-northeast-2',
                      'detail': {'backupVaultName': 'crefans-backup', 'state': 'FAILED',
                                 'backupJobId': 'test-job-1', 'resourceType': 'S3',
                                 'statusMessage': 'secret raw data'}}

    def test_connection_test_label(self):
        self.assertIn("실제 장애 아님", handler.message({"connectionTest": True}))

    def test_failures_only(self):
        for state in ('FAILED', 'ABORTED', 'EXPIRED'):
            self.event['detail']['state'] = state
            self.assertIn(state, handler.message(self.event))
        for state in ('COMPLETED', 'RUNNING', 'CREATED'):
            self.event['detail']['state'] = state
            self.assertIsNone(handler.message(self.event))

    def test_scope(self):
        for key, value in [('account', 'wrong'), ('region', 'us-east-1'),
                           ('source', 'wrong'), ('detail-type', 'wrong')]:
            self.assertIsNone(handler.message({**self.event, key: value}))
        self.event['detail']['backupVaultName'] = 'other'
        self.assertIsNone(handler.message(self.event))

    def test_no_raw_error(self):
        self.assertNotIn('secret raw data', handler.message(self.event))
        self.event['detail']['backupJobId'] = 'injected\nsecret'
        with self.assertRaises(ValueError):
            handler.message(self.event)

    def deliver(self, chat, error=False):
        opener = MagicMock()
        responses = [{'ok': True, 'result': chat},
                     {'ok': not error, 'result': {'message_id': 42}}]
        opener.open.side_effect = [io.BytesIO(json.dumps(r).encode()) for r in responses]
        with patch('notify.urllib.request.build_opener', return_value=opener):
            result = notify.send({'TELEGRAM_OPERATIONS_BOT_TOKEN': 'fake',
                                  'TELEGRAM_OPERATIONS_CHAT_ID': 'fake'}, 'test')
        return result

    def test_delivery(self):
        self.assertEqual(self.deliver({'type': 'channel', 'title': '[crefans] operations'}), 42)

    def test_wrong_channel(self):
        with self.assertRaisesRegex(RuntimeError, 'destination mismatch'):
            self.deliver({'type': 'channel', 'title': 'other'})

    def test_rejected_delivery(self):
        with self.assertRaisesRegex(RuntimeError, 'delivery failed'):
            self.deliver({'type': 'channel', 'title': '[crefans] operations'}, error=True)

    def test_exception_sanitized(self):
        opener = MagicMock()
        opener.open.side_effect = Exception('URL CONTAINS TOKEN')
        with patch('notify.urllib.request.build_opener', return_value=opener):
            with self.assertRaises(RuntimeError) as raised:
                notify.send({'TELEGRAM_OPERATIONS_BOT_TOKEN': 'fake',
                             'TELEGRAM_OPERATIONS_CHAT_ID': 'fake'}, 'test')
        self.assertNotIn('TOKEN', str(raised.exception))


if __name__ == '__main__':
    unittest.main()
