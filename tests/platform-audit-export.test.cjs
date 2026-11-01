const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{tmpdir}=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {exportLogs}=require('../scripts/platform-audit-export.cjs');
test('export is private, bounded, sanitized, checksummed and refuses overwrite',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'crefans-audit-export-')),output=path.join(dir,'incident.jsonl');let page=0;
 const db={platformAuditLog:{findMany:async q=>{assert.equal(q.take,500);return page++?[]:[{id:'test',category:'finance',metadata:{status:'paid',password:'SECRET'},occurred_at:new Date()}];}}};
 try{const opts={from:'2026-10-01',to:'2026-10-02',output},result=await exportLogs(db,opts),bytes=await fs.readFile(output);assert.equal(result.count,1);assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal((await fs.stat(output)).mode&0o777,0o600);assert.doesNotMatch(bytes.toString(),/SECRET|password/);await assert.rejects(exportLogs(db,opts),e=>e.code==='EEXIST');assert.deepEqual(await fs.readFile(output),bytes);await assert.rejects(exportLogs(db,{...opts,from:'2025-01-01'}),/31 days/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
