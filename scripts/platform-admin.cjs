// Operator-only bootstrap; never creates a default password or public signup role.
require('dotenv').config({path:process.env.PLATFORM_RUNTIME_FILE||'.local/platform.env'});
const {PrismaClient}=require('@prisma/client');
const id=process.argv.find(value=>value.startsWith('--member-id='))?.slice(12);
if(!process.env.DATABASE_URL||!id||!process.argv.includes('--apply'))throw Error('Use an explicit database, --member-id=<existing member UUID> and --apply.');
const db=new PrismaClient();
async function run(){const member=await db.member.findFirst({where:{id,enabled:true,email_verified:true}});if(!member)throw Error('Verified active member required');await db.admin.upsert({where:{user_sub:id},create:{user_sub:id,name:member.name,email:member.email,role:'SUPER_ADMIN'},update:{role:'SUPER_ADMIN',is_active:true}});console.log('Administrator role configured.');}
run().catch(()=>{console.error('Administrator setup failed; verify the member and database.');process.exitCode=1;}).finally(()=>db.$disconnect());
