// Operator-only bootstrap for the separate console account table (admins). Never uses a default password:
// prints a one-time temporary password that must be changed at first console login.
require('dotenv').config({path:process.env.PLATFORM_RUNTIME_FILE||'.local/platform.env'});
const {PrismaClient}=require('@prisma/client'),{randomBytes,randomUUID}=require('node:crypto');
const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const email=arg('email')?.trim().toLowerCase(),name=arg('name')?.trim();
if(!process.env.DATABASE_URL||!email||!name||!process.argv.includes('--apply'))throw Error('Use an explicit database, --email=<operator email> --name=<name> and --apply.');
const db=new PrismaClient();
async function run(){const {hashPassword}=require('../dist/src/auth/local/credentials');const password=randomBytes(12).toString('base64url'),password_hash=await hashPassword(password);
 await db.admin.upsert({where:{email},create:{user_sub:randomUUID(),email,name,role:'SUPER_ADMIN',password_hash,must_change_password:true},update:{role:'SUPER_ADMIN',is_active:true,password_hash,must_change_password:true}});
 await db.adminSession.deleteMany({where:{admin:{email}}});console.log('Super administrator configured. Temporary password (shown once):',password);}
run().catch(()=>{console.error('Administrator setup failed; verify the database and build.');process.exitCode=1;}).finally(()=>db.$disconnect());
