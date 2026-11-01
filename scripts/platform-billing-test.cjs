// Local integration mode. Live keys and production databases are never accepted.
const fs=require('node:fs');
const {spawn}=require('node:child_process');
function billingTestEnvironment(env){
 const database=new URL(env.DATABASE_URL||'invalid:');
 if(database.hostname!=='127.0.0.1'||database.port!=='3307'||database.pathname!=='/crefans_platform_dev')throw Error('Billing integration requires the isolated local development database.');
 if(!env.TOSS_CLIENT_KEY?.startsWith('test_ck_')||!env.TOSS_SECRET_KEY?.startsWith('test_sk_'))throw Error('Billing integration accepts only individual Toss test keys.');
 return{...env,RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1',BANK_PAYOUTS_ENABLED:'false',MEDIA_DELETE_ENABLED:'false'};
}
async function initializeLocalPolicy(db){
 await db.$transaction(async tx=>{
  const updated=await tx.financialPolicy.updateMany({where:{id:'platform',version:0,platform_fee_bps:null,settlement_hold_days:null},data:{version:1,platform_fee_bps:1000,settlement_hold_days:0}});
  if(updated.count)await tx.financialPolicyChange.create({data:{version:1,platform_fee_bps:1000,settlement_hold_days:0,reason:'Isolated local test initialization; not an approved operating policy'}});
 });
}
module.exports={billingTestEnvironment,initializeLocalPolicy};
async function run(){
 const env=billingTestEnvironment({...process.env,...require('dotenv').parse(fs.readFileSync('.local/platform.env'))});
 const db=new (require('@prisma/client').PrismaClient)({datasources:{db:{url:env.DATABASE_URL}}});try{await initializeLocalPolicy(db);}finally{await db.$disconnect();}
 console.log('Local Toss TEST billing: API + automatic renewal worker. No real charges. Financial policies from DB (first local initialization only: fee 10%, hold 0d); renewal retries 2 / 1h.');
 const children=['main','worker'].map(entry=>spawn(process.execPath,[`dist/src/platform/${entry}.js`],{env,stdio:'inherit'}));
 let stopping=false;
 const stop=code=>{if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;};
 for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>stop(code||0));}
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>stop(0));
}

if(require.main===module)run().catch(()=>{console.error('Local billing initialization failed; verify migrations and database.');process.exitCode=1;});
