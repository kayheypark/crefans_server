"""Dedicated operations-channel sender. Never log credentials or provider errors."""
import json
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def send(credentials, text):
    token = credentials.get('TELEGRAM_OPERATIONS_BOT_TOKEN')
    chat_id = credentials.get('TELEGRAM_OPERATIONS_CHAT_ID')
    if not token or not chat_id:
        raise RuntimeError('Operations destination missing')
    opener = urllib.request.build_opener(NoRedirect())

    def call(method, body):
        try:
            request = urllib.request.Request(
                'https://api.telegram.org/bot' + token + '/' + method,
                data=json.dumps(body).encode(),
                headers={'Content-Type': 'application/json'}, method='POST')
            with opener.open(request, timeout=8) as response:
                result = json.load(response)
            if result.get('ok') is not True:
                raise ValueError('Rejected')
            return result['result']
        except Exception:
            raise RuntimeError('Operations delivery failed') from None

    chat = call('getChat', {'chat_id': chat_id})
    if chat.get('type') != 'channel' or chat.get('title') != '[crefans] operations':
        raise RuntimeError('Operations destination mismatch')
    result = call('sendMessage', {'chat_id': chat_id, 'text': text,
                                'link_preview_options': {'is_disabled': True}})
    return result['message_id']
