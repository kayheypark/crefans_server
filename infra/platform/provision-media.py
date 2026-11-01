#!/usr/bin/env python3
"""Provision private S3 for authenticated API delivery; default is a read-only plan.
--apply also retires the old dedicated CDN if recorded in this resource journal.
Never enable anonymous or signed-URL browser access to paid media.
"""
import argparse,json,time
from pathlib import Path
import boto3

p=argparse.ArgumentParser()
for name in ['account','instance','bucket','state-file']:p.add_argument('--'+name,required=True)
p.add_argument('--apply',action='store_true');args=p.parse_args()
session=boto3.Session();region='ap-northeast-2';name='crefans-beta-private-media-v1'
sts=session.client('sts',region_name=region);assert sts.get_caller_identity()['Account']==args.account,'Unexpected AWS account'
ec2=session.client('ec2',region_name=region);instance=ec2.describe_instances(InstanceIds=[args.instance])['Reservations'][0]['Instances'][0]
state_path=Path(args.state_file);state=json.loads(state_path.read_text()) if state_path.exists() else {}
if args.apply and state.get('delivery')=='session-edge':
 raise SystemExit('Session-authorized CDN is active; use provision-media-edge.py and its origin-only rollback, not legacy retirement')
assert not state or (state['account']==args.account and state['bucket']==args.bucket and state['instance']==args.instance),'State target mismatch'
assert args.bucket.startswith('crefans-beta-media-'),'Use a dedicated beta media bucket'
profile_name='crefans-beta-media'
existing=instance.get('IamInstanceProfile',{}).get('Arn')
assert not existing or existing.endswith('/'+profile_name),'Do not replace an unrelated EC2 role'
if not args.apply:
 print(json.dumps({'account':args.account,'instance':args.instance,'bucket':args.bucket,'region':region,'delivery':'authenticated-api','retireDistribution':state.get('distributionId'),'roleScope':'s3:GetObject/PutObject/DeleteObject on dedicated bucket platform/*','publicBucket':False,'imds':'required, hopLimit=2','changesApplied':False}));raise SystemExit()
state.update(account=args.account,instance=args.instance,bucket=args.bucket,region=region)
def save():
 state_path.parent.mkdir(parents=True,exist_ok=True);state_path.write_text(json.dumps(state,indent=2,default=str)+'\n');state_path.chmod(0o600)
def done(key,value):state[key]=value;save();print(key+' ready',flush=True)
s3=session.client('s3',region_name=region);cf=session.client('cloudfront',region_name='us-east-1');iam=session.client('iam')
if not state.get('bucketCreated'):
 # Reject a pre-existing bucket rather than changing an unrelated storage policy.
 assert args.bucket not in [b['Name'] for b in s3.list_buckets()['Buckets']],'Bucket exists without this provisioning journal'
 s3.create_bucket(Bucket=args.bucket,CreateBucketConfiguration={'LocationConstraint':region},ObjectOwnership='BucketOwnerEnforced');done('bucketCreated',True)
s3.put_public_access_block(Bucket=args.bucket,PublicAccessBlockConfiguration={k:True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']})
s3.put_bucket_encryption(Bucket=args.bucket,ServerSideEncryptionConfiguration={'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'},'BucketKeyEnabled':False}]})
s3.put_bucket_lifecycle_configuration(Bucket=args.bucket,LifecycleConfiguration={'Rules':[{'ID':'abort-incomplete-uploads','Status':'Enabled','Filter':{'Prefix':'platform/'},'AbortIncompleteMultipartUpload':{'DaysAfterInitiation':1}}]})
s3.put_bucket_tagging(Bucket=args.bucket,Tagging={'TagSet':[{'Key':'Project','Value':'crefans'},{'Key':'Environment','Value':'beta'},{'Key':'Purpose','Value':'private-media'}]})
bucket_arn='arn:aws:s3:::'+args.bucket
# Remove the old OAC grant and explicitly deny CDN reads, including future accidental grants.
s3.put_bucket_policy(Bucket=args.bucket,Policy=json.dumps({'Version':'2012-10-17','Statement':[
 {'Sid':'DenyNonTLS','Effect':'Deny','Principal':'*','Action':'s3:*','Resource':[bucket_arn,bucket_arn+'/*'],'Condition':{'Bool':{'aws:SecureTransport':'false'}}},
 {'Sid':'DenyDirectCloudFront','Effect':'Deny','Principal':{'Service':'cloudfront.amazonaws.com'},'Action':'s3:GetObject','Resource':bucket_arn+'/platform/*'}]}))
if state.get('distributionId'):
 result=cf.get_distribution_config(Id=state['distributionId']);config=result['DistributionConfig']
 assert config['Comment'].startswith('CREFANS beta private media'),'Do not modify an unrelated distribution'
 assert all(o['DomainName'].startswith(args.bucket+'.s3.') for o in config['Origins']['Items']),'Unexpected CDN origin'
 if config['Enabled']:
  config['Enabled']=False;cf.update_distribution(Id=state['distributionId'],IfMatch=result['ETag'],DistributionConfig=config)
 if not state.get('retirementInvalidationId'):
  result=cf.create_invalidation(DistributionId=state['distributionId'],InvalidationBatch={'Paths':{'Quantity':1,'Items':['/*']},'CallerReference':'crefans-session-only-20261022'})
  done('retirementInvalidationId',result['Invalidation']['Id'])
 done('delivery','authenticated-api')
if not state.get('roleArn'):
 role=iam.create_role(RoleName=profile_name,Description='CREFANS beta private media bucket only',AssumeRolePolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'ec2.amazonaws.com'},'Action':'sts:AssumeRole'}]}),Tags=[{'Key':'Project','Value':'crefans'}]);done('roleArn',role['Role']['Arn'])
iam.put_role_policy(RoleName=profile_name,PolicyName='private-media-objects',PolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['s3:GetObject','s3:PutObject','s3:DeleteObject'],'Resource':bucket_arn+'/platform/*'}]}))
if not state.get('profileArn'):
 profile=iam.create_instance_profile(InstanceProfileName=profile_name);done('profileArn',profile['InstanceProfile']['Arn'])
profile=iam.get_instance_profile(InstanceProfileName=profile_name)['InstanceProfile']
if not profile['Roles']:iam.add_role_to_instance_profile(InstanceProfileName=profile_name,RoleName=profile_name)
if not state.get('associationId') and not existing:
 for attempt in range(12):
  try:done('associationId',ec2.associate_iam_instance_profile(InstanceId=args.instance,IamInstanceProfile={'Name':profile_name})['IamInstanceProfileAssociation']['AssociationId']);break
  except Exception as error:
   if attempt==11:raise
   time.sleep(5)
ec2.modify_instance_metadata_options(InstanceId=args.instance,HttpTokens='required',HttpEndpoint='enabled',HttpPutResponseHopLimit=2)
done('provisioned',True)
print(json.dumps({k:state.get(k) for k in ['bucket','distributionId','delivery','retirementInvalidationId','profileArn','provisioned']},default=str))
