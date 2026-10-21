// Local integration mode. Live keys and production databases are never accepted.
const fs=require('node:fs');
const {spawn}=require('node:child_process');
function billingTestEnvironment(env){
 const database=new URL(env.DATABASE_URL||'invalid:');
 if(database.hostname!=='127.0.0.1'||database.port!=='3307'||database.pathname!=='/crefans_platform_dev')throw Error('Billing integration requires the isolated local development database.');
 if(!env.TOSS_CLIENT_KEY?.startsWith('test_ck_')||!env.TOSS_SECRET_KEY?.startsWith('test_sk_'))throw Error('Billing integration accepts only individual Toss test keys.');
 return{...env,PLATFORM_FEE_BPS:'1000',SETTLEMENT_HOLD_DAYS:'0',RENEWAL_MAX_RETRIES:'2',RENEWAL_RETRY_HOURS:'1',BANK_PAYOUTS_ENABLED:'false',MEDIA_DELETE_ENABLED:'false'};
}
module.exports={billingTestEnvironment};
if(require.main===module){
 const env=billingTestEnvironment({...process.env,...require('dotenv').parse(fs.readFileSync('.local/platform.env'))});
 console.log('Local Toss TEST billing: API + automatic renewal worker. No real charges. Temporary policies: fee 10%, hold 0d, unused-content full refunds, renewal retries 2 / 1h.');
 const children=['main','worker'].map(entry=>spawn(process.execPath,[`dist/src/platform/${entry}.js`],{env,stdio:'inherit'}));
 let stopping=false;
 const stop=code=>{if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;};
 for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>stop(code||0));}
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>stop(0));
}
