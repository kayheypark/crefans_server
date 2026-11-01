// Read-only counts. Never export member identities, credentials or billing keys.
require('dotenv').config({path:process.env.PLATFORM_RUNTIME_FILE||'.local/platform.env'});
const {PrismaClient,Prisma}=require('@prisma/client');
if(!process.env.DATABASE_URL)throw Error('An explicit DATABASE_URL is required.');
const db=new PrismaClient();
async function run(){const counts={
 missingSubscriptionSnapshots:await db.subscription.count({where:{plan_snapshot:{equals:Prisma.DbNull}}}),
 legacyPlaintextBillingKeys:await db.subscription.count({where:{billing_key:{not:null}}}),
 activeSubscriptionsWithoutBillingMethod:await db.subscription.count({where:{status:'ONGOING',auto_renew:true,billing_method_id:null}}),
 membersWithoutPassIdentity:await db.member.count({where:{identity_hash:null}}),
 unprocessedMedia:await db.media.count({where:{is_deleted:false,processing_status:{not:'COMPLETED'}}}),
 unresolvedPayments:await db.checkoutOrder.count({where:{status:{in:['processing','refunding']}}}),
 pendingWithdrawals:await db.withdrawalRequest.count({where:{status:{in:['requested','processing']}}})
};console.log(JSON.stringify(counts,null,2));if(counts.missingSubscriptionSnapshots||counts.legacyPlaintextBillingKeys||counts.activeSubscriptionsWithoutBillingMethod)process.exitCode=1;}
run().catch(()=>{console.error('Platform audit failed; check database configuration.');process.exitCode=1;}).finally(()=>db.$disconnect());
