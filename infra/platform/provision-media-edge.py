#!/usr/bin/env python3
"""Explicit phase rollout of session-authorized CDN. No changes without --apply.
Uses the existing dedicated media resource journal and a private rollout journal.
The secret file is read locally into the Lambda deployment package, never printed.
"""
import argparse,copy,hashlib,io,json,time,zipfile
from pathlib import Path
import boto3

p=argparse.ArgumentParser()
p.add_argument('--resources',required=True);p.add_argument('--state',required=True)
p.add_argument('--secret-file',required=True);p.add_argument('--apply',action='store_true')
p.add_argument('--phase',choices=['prepare','functions','configure','allow','cutover','origin-only','status'],default='status')
args=p.parse_args();resources=json.loads(Path(args.resources).read_text());state_path=Path(args.state)
state=json.loads(state_path.read_text()) if state_path.exists() else {}
account=resources['account'];bucket=resources['bucket'];distribution=resources['distributionId']
domain='beta.crefans.com';origin='beta-origin.crefans.com';region='ap-northeast-2'
s=boto3.Session();assert s.client('sts',region_name=region).get_caller_identity()['Account']==account
cf=s.client('cloudfront',region_name='us-east-1');dns=s.client('route53');acm=s.client('acm',region_name='us-east-1');lam=s.client('lambda',region_name='us-east-1');iam=s.client('iam');s3=s.client('s3',region_name=region)
zones=[z for z in dns.list_hosted_zones()['HostedZones'] if z['Name']=='crefans.com.' and not z['Config']['PrivateZone']];assert len(zones)==1;zone=zones[0]['Id']
assert resources['region']==region and bucket.startswith('crefans-beta-media-')
def save():
 state_path.parent.mkdir(parents=True,exist_ok=True);state_path.write_text(json.dumps(state,indent=2,default=str)+'\n');state_path.chmod(0o600)
def change(records):
 result=dns.change_resource_record_sets(HostedZoneId=zone,ChangeBatch={'Comment':'CREFANS session-authorized media rollout','Changes':[{'Action':'UPSERT','ResourceRecordSet':r} for r in records]})
 state['lastDnsChange']=result['ChangeInfo']['Id'];save()
def current_config():
 result=cf.get_distribution_config(Id=distribution);assert result['DistributionConfig']['Comment'].startswith('CREFANS beta private media');return result
if not args.apply or args.phase=='status':
 result=cf.get_distribution(Id=distribution)['Distribution'];print(json.dumps({'phase':args.phase,'apply':False,'distribution':distribution,'status':result['Status'],'enabled':result['DistributionConfig']['Enabled'],'domain':domain,'authOrigin':origin,'functionsReady':bool(state.get('mediaVersion')),'certificateStatus':acm.describe_certificate(CertificateArn=state['certificate'])['Certificate']['Status'] if state.get('certificate') else None}));raise SystemExit()
if not state:
 state={'account':account,'distribution':distribution,'bucket':bucket,'initialConfig':current_config()['DistributionConfig'],'initialBucketPolicy':json.loads(s3.get_bucket_policy(Bucket=bucket)['Policy'])}
 records=dns.list_resource_record_sets(HostedZoneId=zone,StartRecordName=domain,StartRecordType='A',MaxItems='1')['ResourceRecordSets'];assert records[0]['Name']==domain+'.' and records[0]['Type']=='A';state['initialDns']=records[0];assert [r['Value'] for r in records[0].get('ResourceRecords',[])]==['15.164.140.26'];save()
assert (state['account'],state['distribution'],state['bucket'])==(account,distribution,bucket)
if args.phase=='prepare':
 if not state.get('certificate'):
  state['certificate']=acm.request_certificate(DomainName=domain,ValidationMethod='DNS',IdempotencyToken='crefanssessionedge20261022',Tags=[{'Key':'Project','Value':'crefans'}])['CertificateArn'];save()
 detail=acm.describe_certificate(CertificateArn=state['certificate'])['Certificate'];records=[o['ResourceRecord'] for o in detail['DomainValidationOptions'] if 'ResourceRecord' in o]
 if not records:print('Certificate validation record pending; rerun prepare');raise SystemExit()
 change([{'Name':r['Name'],'Type':r['Type'],'TTL':300,'ResourceRecords':[{'Value':r['Value']}]} for r in records]+[{'Name':origin,'Type':'A','TTL':60,'ResourceRecords':[{'Value':'15.164.140.26'}]}]);print('Certificate validation and isolated origin DNS submitted')
elif args.phase=='functions':
 secret=Path(args.secret_file).read_text().strip();assert len(secret)==64 and all(c in '0123456789abcdef' for c in secret)
 name='crefans-beta-session-edge';trust={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':['lambda.amazonaws.com','edgelambda.amazonaws.com']},'Action':'sts:AssumeRole'}]}
 try:role=iam.get_role(RoleName=name)['Role']
 except iam.exceptions.NoSuchEntityException:role=iam.create_role(RoleName=name,AssumeRolePolicyDocument=json.dumps(trust),Tags=[{'Key':'Project','Value':'crefans'}])['Role'];time.sleep(10)
 assert role['AssumeRolePolicyDocument']==trust,'Unexpected edge execution role'
 iam.put_role_policy(RoleName=name,PolicyName='edge-logs',PolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],'Resource':f'arn:aws:logs:*:{account}:*'}]}))
 root=Path(__file__).resolve().parents[2];package=io.BytesIO()
 with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
  for file in ['media-edge-protocol.js','media-edge-handler.js']:z.write(root/'dist/src/platform'/file,file)
  z.writestr('config.json',json.dumps({'secret':secret,'authHost':origin}))
  z.writestr('index.js',"const make=require('./media-edge-handler').createMediaEdgeHandler,c=require('./config.json');exports.media=make({...c,mediaOnly:true});exports.origin=make(c);\n")
 data=package.getvalue();sourcehash=hashlib.sha256(data).hexdigest()
 for kind in ['media','origin']:
  function=name+'-'+kind
  try:old=lam.get_function(FunctionName=function)
  except lam.exceptions.ResourceNotFoundException:old=None
  if old:
   assert old['Configuration']['Role']==role['Arn'];lam.update_function_code(FunctionName=function,ZipFile=data);lam.get_waiter('function_updated_v2').wait(FunctionName=function)
   lam.update_function_configuration(FunctionName=function,Runtime='nodejs22.x',Handler='index.'+kind,Timeout=5,MemorySize=128);lam.get_waiter('function_updated_v2').wait(FunctionName=function)
   published=lam.publish_version(FunctionName=function)
  else:published=lam.create_function(FunctionName=function,Runtime='nodejs22.x',Role=role['Arn'],Handler='index.'+kind,Code={'ZipFile':data},Timeout=5,MemorySize=128,Publish=True,Tags={'Project':'crefans'})
  state[kind+'Version']=published['FunctionArn'].split(':$LATEST')[0] if published['FunctionArn'].endswith(':'+published['Version']) else published['FunctionArn']+':'+published['Version'];save()
 state['lambdaPackageSha256']=sourcehash;save();print('Published edge media and origin versions; no secret output')
elif args.phase=='configure':
 assert acm.describe_certificate(CertificateArn=state['certificate'])['Certificate']['Status']=='ISSUED'
 policies={r['CachePolicy']['CachePolicyConfig']['Name']:r['CachePolicy']['Id'] for r in cf.list_cache_policies(Type='managed')['CachePolicyList']['Items']}
 origins={r['OriginRequestPolicy']['OriginRequestPolicyConfig']['Name']:r['OriginRequestPolicy']['Id'] for r in cf.list_origin_request_policies(Type='managed')['OriginRequestPolicyList']['Items']}
 result=current_config();config=result['DistributionConfig']
 if not state.get('beforeEdgeConfig'):state['beforeEdgeConfig']=copy.deepcopy(config);save()
 config['Origins']={'Quantity':2,'Items':[{'Id':'app','DomainName':origin,'OriginPath':'','CustomHeaders':{'Quantity':0},'CustomOriginConfig':{'HTTPPort':80,'HTTPSPort':443,'OriginProtocolPolicy':'https-only','OriginSslProtocols':{'Quantity':1,'Items':['TLSv1.2']},'OriginReadTimeout':30,'OriginKeepaliveTimeout':5},'ConnectionAttempts':2,'ConnectionTimeout':5},{'Id':'private-media','DomainName':f'{bucket}.s3.{region}.amazonaws.com','OriginPath':'','CustomHeaders':{'Quantity':0},'S3OriginConfig':{'OriginAccessIdentity':''},'OriginAccessControlId':resources['oacId'],'ConnectionAttempts':2,'ConnectionTimeout':5}]}
 base={'ViewerProtocolPolicy':'https-only','TrustedSigners':{'Enabled':False,'Quantity':0},'TrustedKeyGroups':{'Enabled':False,'Quantity':0},'SmoothStreaming':False,'Compress':False,'FieldLevelEncryptionId':'','FunctionAssociations':{'Quantity':0}}
 config['DefaultCacheBehavior']={**base,'TargetOriginId':'app','AllowedMethods':{'Quantity':7,'Items':['GET','HEAD','OPTIONS','PUT','PATCH','POST','DELETE'],'CachedMethods':{'Quantity':2,'Items':['GET','HEAD']}},'CachePolicyId':policies['Managed-CachingDisabled'],'OriginRequestPolicyId':origins['Managed-AllViewerExceptHostHeader'],'LambdaFunctionAssociations':{'Quantity':1,'Items':[{'EventType':'viewer-request','LambdaFunctionARN':state['originVersion'],'IncludeBody':False}]}}
 config['CacheBehaviors']={'Quantity':1,'Items':[{**base,'PathPattern':'/api/v1/media/*/file','TargetOriginId':'private-media','AllowedMethods':{'Quantity':2,'Items':['GET','HEAD'],'CachedMethods':{'Quantity':2,'Items':['GET','HEAD']}},'CachePolicyId':policies['Managed-CachingOptimized'],'LambdaFunctionAssociations':{'Quantity':2,'Items':[{'EventType':event,'LambdaFunctionARN':state['mediaVersion'],'IncludeBody':False} for event in ['viewer-request','viewer-response']]}}]}
 config['Aliases']={'Quantity':1,'Items':[domain]};config['ViewerCertificate']={'ACMCertificateArn':state['certificate'],'SSLSupportMethod':'sni-only','MinimumProtocolVersion':'TLSv1.2_2021'};config['CustomErrorResponses']={'Quantity':0};config['Enabled']=True;config['Comment']='CREFANS beta private media session authorization'
 cf.update_distribution(Id=distribution,IfMatch=result['ETag'],DistributionConfig=config);state['edgeConfiguredAt']=time.time();save();print('Edge configuration submitted; beta DNS still unchanged')
elif args.phase=='allow':
 result=cf.get_distribution(Id=distribution)['Distribution'];assert result['Status']=='Deployed';config=result['DistributionConfig'];assert config['CacheBehaviors']['Items'][0]['LambdaFunctionAssociations']['Items'][0]['LambdaFunctionARN']==state['mediaVersion']
 arn=resources['distributionArn'];policy=json.loads(s3.get_bucket_policy(Bucket=bucket)['Policy']);policy['Statement']=[x for x in policy['Statement'] if x['Sid'] not in ['DenyDirectCloudFront','DenyOtherCloudFront','AllowSessionCloudFront']]
 policy['Statement'] += [{'Sid':'DenyOtherCloudFront','Effect':'Deny','Principal':{'Service':'cloudfront.amazonaws.com'},'Action':'s3:GetObject','Resource':f'arn:aws:s3:::{bucket}/platform/*','Condition':{'StringNotEquals':{'AWS:SourceArn':arn}}},{'Sid':'AllowSessionCloudFront','Effect':'Allow','Principal':{'Service':'cloudfront.amazonaws.com'},'Action':'s3:GetObject','Resource':f'arn:aws:s3:::{bucket}/platform/*','Condition':{'StringEquals':{'AWS:SourceArn':arn}}}]
 s3.put_bucket_policy(Bucket=bucket,Policy=json.dumps(policy));print('Private S3 permits only the verified session-authorized distribution')
elif args.phase=='cutover':
 assert state.get('edgeConfiguredAt');deployed=cf.get_distribution(Id=distribution)['Distribution'];assert deployed['Status']=='Deployed'
 config=deployed['DistributionConfig'];assert config['Enabled'] and config['Aliases']['Items']==[domain]
 assert config['DefaultCacheBehavior']['LambdaFunctionAssociations']['Items'][0]['LambdaFunctionARN']==state['originVersion']
 behavior=config['CacheBehaviors']['Items'];assert len(behavior)==1 and behavior[0]['PathPattern']=='/api/v1/media/*/file'
 assert all(a['LambdaFunctionARN']==state['mediaVersion'] for a in behavior[0]['LambdaFunctionAssociations']['Items']), 'Healthy tested media version must be deployed'
 proof=json.loads((state_path.parent/'preflight-proof.json').read_text());assert proof.get('passed') is True and proof['distribution']==distribution and proof['mediaVersion']==state['mediaVersion'],'Run live preflight before DNS cutover'
 change([{'Name':domain,'Type':'A','AliasTarget':{'HostedZoneId':'Z2FDTNDATAQYW2','DNSName':resources['origin'].split('://')[1],'EvaluateTargetHealth':False}}]);state['cutoverAt']=time.time();save();print('Beta DNS cutover submitted')
 resources['delivery']='session-edge';Path(args.resources).write_text(json.dumps(resources,indent=2,default=str)+'\n');Path(args.resources).chmod(0o600)
elif args.phase=='origin-only':
 # Availability rollback while cached DNS still points to CloudFront: all paths use authenticated API.
 result=current_config();config=result['DistributionConfig'];config['CacheBehaviors']={'Quantity':0};cf.update_distribution(Id=distribution,IfMatch=result['ETag'],DistributionConfig=config);change([state['initialDns']]);print('Origin-only rollback submitted; protected API streaming retained')
