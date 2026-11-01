// Explicitly invoked real Telegram check; sends only its own synthetic event.
require('reflect-metadata');
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
const env=require('dotenv').parse(fs.readFileSync('.local/platform.env'));
const url=new URL(env.DATABASE_URL||'invalid:');
if(url.hostname!=='127.0.0.1'||url.port!=='3307'||url.pathname!=='/crefans_platform_dev')throw Error('Only isolated local development DB accepted');
if(!env.TELEGRAM_OPERATIONS_BOT_TOKEN||!env.TELEGRAM_OPERATIONS_CHAT_ID)throw Error('Configure the dedicated operations bot token and channel ID in .local/platform.env');
process.env.DATABASE_URL=env.DATABASE_URL;
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config'),{PlatformOperationsService}=require('../dist/src/platform/operations.service');
const db=new PrismaClient(),ops=new PlatformOperationsService(db,new ConfigService(env));
(async()=>{try{const event=await ops.record('operations.test',{action:'connectivity-check'},`operations.test:${randomUUID()}`);if(!event)throw Error('Could not persist synthetic event');const sent=await ops.flush(new Date(),fetch,event.id);console.log(JSON.stringify({eventId:event.id,telegramAccepted:sent===true,actualReceipt:'verify the target channel UI separately'}));if(!sent)process.exitCode=1;}finally{await db.$disconnect();}})().catch(()=>{console.error('Operations connectivity check failed; inspect configuration and retained event.');process.exitCode=1;});
