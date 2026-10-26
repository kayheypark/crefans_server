const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('optional CloudWatch override replaces incompatible rotation settings and requires destination',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crefans-log-config-'));
 try{for(const file of ['compose.yml','compose.beta.yml','compose.admin.yml','compose.cloudwatch.yml'])fs.copyFileSync('infra/platform/'+file,path.join(dir,file));fs.writeFileSync(path.join(dir,'runtime.env'),'APP_ENV=synthetic\n');
 const env={...process.env,DB_PASSWORD:'synthetic',DB_ROOT_PASSWORD:'synthetic',APP_DOMAIN:'example.invalid',API_IMAGE:'api:test',FRONTEND_IMAGE:'front:test',ADMIN_IMAGE:'admin:test',LOGS_AWS_REGION:'ap-northeast-2',LOGS_GROUP:'synthetic'};
 const args=['compose','-f','compose.yml','-f','compose.beta.yml','-f','compose.admin.yml','-f','compose.cloudwatch.yml','config','--format','json'];const run=spawnSync('docker',args,{cwd:dir,env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const c=JSON.parse(run.stdout);
 for(const name of ['api','worker','proxy']){assert.equal(c.services[name].logging.driver,'awslogs');assert.equal(c.services[name].logging.options['awslogs-create-group'],'false');assert.equal(c.services[name].logging.options['max-size'],undefined);assert.equal(c.services[name].logging.options.mode,'non-blocking');}assert.equal(c.services.database.logging.driver,'json-file');
 const missing=spawnSync('docker',args,{cwd:dir,env:{...env,LOGS_GROUP:''},encoding:'utf8'});assert.notEqual(missing.status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
