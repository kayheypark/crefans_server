// Supply DATABASE_URL through a private environment file. No default .env loading.
require('reflect-metadata');const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{auditView}=require('../dist/src/platform/admin-logs');
async function exportLogs(db,{from,to,output}){
 const start=new Date(from),end=new Date(to);if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>=end||+end-+start>31*86400000)throw Error('Export requires a valid range up to 31 days');if(!path.isAbsolute(output)||!output.endsWith('.jsonl'))throw Error('Absolute .jsonl output required');
 const temp=output+'.partial-'+randomUUID(),file=await fs.open(temp,'wx',0o600),hash=createHash('sha256');let count=0,cursor;
 try{while(true){const rows=await db.platformAuditLog.findMany({where:{occurred_at:{gte:start,lt:end}},orderBy:[{occurred_at:'asc'},{id:'asc'}],take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!rows.length)break;for(const row of rows){const line=JSON.stringify(auditView(row))+'\n';await file.write(line);hash.update(line);count++;}cursor=rows.at(-1).id;}await file.sync();await file.close();await fs.link(temp,output);await fs.unlink(temp);return{from:start.toISOString(),to:end.toISOString(),count,sha256:hash.digest('hex')};}
 catch(error){await file.close().catch(()=>{});await fs.unlink(temp).catch(()=>{});throw error;}
}
module.exports={exportLogs};if(require.main===module){const [from,to,output,...extra]=process.argv.slice(2);if(extra.length||!process.env.DATABASE_URL){console.error('Usage: DATABASE_URL supplied privately; from-ISO to-ISO absolute-output.jsonl');process.exitCode=1;}else{const db=new PrismaClient();exportLogs(db,{from,to,output:output||''}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Audit export failed; no log contents printed');process.exitCode=1;}).finally(()=>db.$disconnect());}}
