"""Local Docker/Caddy trust-boundary check. No real app, credentials, DB or external send."""
import http.client,json,pathlib,subprocess,time,uuid
root=pathlib.Path(__file__).resolve().parent.parent
suffix=uuid.uuid4().hex[:8];network='crefans-proxy-test-'+suffix;api=network+'-api';proxy=network+'-proxy'
def run(*args):return subprocess.check_output(['docker',*args],text=True,stderr=subprocess.STDOUT).strip()
try:
 run('network','create','--subnet','172.30.90.0/24','--ip-range','172.30.90.128/25',network)
 code="const http=require('http');const handler=(q,s)=>{s.setHeader('content-type','application/json');s.setHeader('X-Request-ID','11111111-1111-4111-8111-111111111111');s.end(JSON.stringify({ip:q.socket.remoteAddress,client:q.headers['x-crefans-client-ip'],cf:q.headers['cf-connecting-ip']}));};http.createServer(handler).listen(3001,'0.0.0.0');http.createServer(handler).listen(3010,'0.0.0.0');"
 run('run','-d','--name',api,'--network',network,'--network-alias','api','--network-alias','frontend','--entrypoint','node','crefans-api:beta-20261021','-e',code)
 run('run','--rm','-e','APP_DOMAIN=http://localhost','-v',str(root/'infra/platform/Caddyfile')+':/etc/caddy/Caddyfile:ro','caddy:2-alpine','caddy','validate','--config','/etc/caddy/Caddyfile')
 run('run','-d','--name',proxy,'--network',network,'--ip','172.30.90.2','-p','127.0.0.1::80','-e','APP_DOMAIN=http://localhost','-v',str(root/'infra/platform/Caddyfile')+':/etc/caddy/Caddyfile:ro','caddy:2-alpine')
 assigned=json.loads(run('inspect',api))[0]['NetworkSettings']['Networks'][network]['IPAddress']
 import ipaddress
 assert ipaddress.ip_address(assigned) in ipaddress.ip_network('172.30.90.128/25'),assigned
 port=int(run('port',proxy,'80/tcp').rsplit(':',1)[1])
 def get(path):
  conn=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
  conn.request('GET',path,headers={'host':'localhost','x-crefans-client-ip':'203.0.113.250','x-forwarded-for':'203.0.113.251','cf-connecting-ip':'203.0.113.252','authorization':'Bearer SECRET_ACCESS_TOKEN','cookie':'session=SECRET_COOKIE','x-private':'SECRET_CUSTOM_HEADER'})
  response=conn.getresponse();body=response.read();conn.close();return response.status,body
 for _ in range(40):
  try:
   status,body=get('/api/v1/probe')
   if status==200:break
  except OSError:pass
  time.sleep(.1)
 assert status==200,(status,body)
 result=json.loads(body)
 assert result['ip']=='::ffff:172.30.90.2' or result['ip']=='172.30.90.2',result
 assert result['client']!='203.0.113.250' and result['client']!='203.0.113.251',result
 assert 'cf' not in result,result
 assert get('/.env')[0]==404
 assert get('/runtime.env')[0]==404
 assert get('/')[0]==302
 assert get('/api/v1/probe?token=SECRET_QUERY')[0]==200
 run('stop',api)
 assert get('/api/v1/probe?token=SECRET_FAILURE_QUERY')[0]==502
 time.sleep(.3)
 logs=run('logs',proxy)
 assert 'SECRET_' not in logs, 'secret leaked into proxy logs'
 records=[]
 for line in logs.splitlines():
  try:records.append(json.loads(line))
  except json.JSONDecodeError:pass
 access=[r for r in records if r.get('logger','').startswith('http.log.access')]
 assert any(r.get('request_id')=='11111111-1111-4111-8111-111111111111' for r in access), 'missing correlation ID'
 assert any(r.get('status')==502 for r in access), 'missing upstream failure'
 assert all('uri' not in r.get('request',{}) and 'headers' not in r.get('request',{}) for r in records)
 print('Caddy log PASS: normal + upstream502 redact query/headers/cookies and retain request ID/status')
 print('Caddy PASS: exact static proxy peer, forged client header overwritten, CF removed, secret paths404/root302')
finally:
 for name in [proxy,api]:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
