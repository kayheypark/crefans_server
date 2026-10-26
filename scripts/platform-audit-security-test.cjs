// Dedicated loopback E2E schema; never operates on production or sends alerts.
const optedIn=process.env.CREFANS_E2E==='true';
require('dotenv').config({path:'.local/platform.env',override:true});
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
async function main(){
 assert.equal(optedIn,true);const source=new URL(process.env.DATABASE_URL);assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,'3307');assert.equal(source.pathname,'/crefans_platform_dev');
 const release=await require('../tests/e2e-db-lock.cjs').lockE2EDatabase(source.href),dir=await fs.mkdtemp(path.join(os.tmpdir(),'crefans-audit-db-'));
 try{source.pathname='/crefans_platform_e2e';const env={...process.env,CREFANS_E2E:'true',DATABASE_URL:source.href,SECURITY_TEST_DATABASE_URL:source.href,TELEGRAM_OPERATIONS_BOT_TOKEN:'',TELEGRAM_OPERATIONS_CHAT_ID:''};await fs.copyFile('prisma/schema.prisma',path.join(dir,'schema.prisma'));await fs.cp('prisma/migrations',path.join(dir,'migrations'),{recursive:true});const migration=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(dir,'schema.prisma')],{cwd:dir,env,encoding:'utf8'});assert.equal(migration.status,0,'Isolated audit test migration failed');const test=spawnSync(process.execPath,['--test','tests/platform-security.test.cjs'],{env,stdio:'inherit'});process.exitCode=test.status??1;}
 finally{await fs.rm(dir,{recursive:true,force:true});await release();}
}
main().catch(()=>{console.error('Isolated audit security verification failed');process.exitCode=1;});
