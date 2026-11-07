require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{ConfigService}=require('@nestjs/config');
const {PlatformOperationsService,operationsAlertText}=require('../dist/src/platform/operations.service');
const {checkDisk,diskUsage,diskThresholds}=require('../dist/src/platform/disk-alert');
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);
const db=new PrismaClient(),states=new Set();
// Synthetic filesystem: 10M blocks of 4KiB, no root reservation, so used% is exact.
const at=percent=>async()=>({bsize:4096,blocks:10_000_000,bfree:Math.round(10_000_000*(1-percent/100)),bavail:Math.round(10_000_000*(1-percent/100))});
const scope=()=>{const id=`disk-alert-test-${randomUUID()}`;states.add(id);return id;};
const events=id=>db.platformOperationalEvent.findMany({where:{dedupe_key:{startsWith:id+':'}},orderBy:{created_at:'asc'}});
const ops=new PlatformOperationsService(db,new ConfigService({}));
const run=(id,percent,now,config={},operations=ops)=>checkDisk(db,operations,new ConfigService(config),now,at(percent),id);
after(async()=>{const ids=[...states];const rows=await db.platformOperationalEvent.findMany({where:{OR:ids.map(id=>({dedupe_key:{startsWith:id+':'}}))},select:{id:true}});
 await db.platformAuditLog.deleteMany({where:{source_id:{in:rows.map(r=>r.id)}}});await db.platformOperationalEvent.deleteMany({where:{id:{in:rows.map(r=>r.id)}}});await db.platformJob.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});

test('usage uses the df basis (production worker sample 2026-11-07 = 33%)',()=>{
 const u=diskUsage({bsize:4096,blocks:12422878,bfree:8402050,bavail:8397954});
 assert.equal(Math.ceil(u.usedPercent),33);assert.equal(u.freeGiB.toFixed(1),'32.0');assert.equal(u.totalGiB.toFixed(1),'47.4');
 // Root-reserved blocks are excluded from "available", so usage is higher than (blocks-bfree)/blocks.
 assert.ok(diskUsage({bsize:4096,blocks:100,bfree:20,bavail:15}).usedPercent>80);
});
test('thresholds default to 80/90, follow env, and reject inverted values',()=>{
 assert.deepEqual(diskThresholds(new ConfigService({})),{warning:80,critical:90});
 assert.deepEqual(diskThresholds(new ConfigService({DISK_ALERT_WARNING_PERCENT:'70',DISK_ALERT_CRITICAL_PERCENT:'85'})),{warning:70,critical:85});
 for(const bad of[{DISK_ALERT_WARNING_PERCENT:'95'},{DISK_ALERT_CRITICAL_PERCENT:'101'},{DISK_ALERT_WARNING_PERCENT:'abc'}])assert.throws(()=>diskThresholds(new ConfigService(bad)));
});
test('warning once a day, 90% immediately, one recovery notice',async()=>{
 const id=scope(),t0=new Date('2099-03-01T00:00:00Z'),m=min=>new Date(+t0+min*60000);
 assert.equal((await run(id,79.9,t0)).alert,undefined);
 assert.equal((await run(id,80,m(10))).alert,'disk.warning');
 assert.equal((await run(id,85,m(20))).alert,undefined);
 assert.equal((await run(id,85,m(10+1439))).alert,undefined);
 assert.equal((await run(id,85,m(10+1440))).alert,'disk.warning');
 assert.equal((await run(id,90,m(1460))).alert,'disk.critical');
 assert.equal((await run(id,95,m(1470))).alert,undefined);
 assert.equal((await run(id,85,m(1480))).alert,undefined);
 assert.equal((await run(id,50,m(1490))).alert,'disk.recovered');
 assert.equal((await run(id,50,m(1500))).alert,undefined);
 const rows=await events(id);assert.deepEqual(rows.map(r=>r.type),['disk.warning','disk.warning','disk.critical','disk.recovered']);
 const text=operationsAlertText(rows[2],'synthetic');
 assert.match(text,/\[crefans\] 디스크 사용률 위험/);assert.match(text,/사용률: 90\.0%/);assert.match(text,/여유: 3\.8GB/);assert.match(text,/검사시각: 2099-03-02T00:20:00\.000Z/);assert.match(text,/기준: 경고 80% \/ 위험 90%/);
 const audit=await db.platformAuditLog.findFirst({where:{source_id:rows[2].id}});assert.equal(audit.category,'worker');assert.equal(audit.level,'warning');
});
test('a jump straight to 90% sends only the critical stage; env thresholds apply',async()=>{
 const id=scope(),t0=new Date('2099-04-01T00:00:00Z');
 assert.equal((await run(id,92,t0)).alert,'disk.critical');
 const lower=scope();
 assert.equal((await run(lower,72,t0,{DISK_ALERT_WARNING_PERCENT:'70',DISK_ALERT_CRITICAL_PERCENT:'85'})).alert,'disk.warning');
 assert.deepEqual((await events(id)).map(r=>r.type),['disk.critical']);
});
test('an alert that is not persisted keeps the state so the next check retries it',async()=>{
 const id=scope(),t0=new Date('2099-05-01T00:00:00Z'),failing=Object.assign(Object.create(ops),{record:async()=>undefined});
 await assert.rejects(run(id,88,t0,{},failing),/not persisted/);
 assert.equal((await run(id,88,new Date(+t0+600000))).alert,'disk.warning');
 assert.equal((await events(id)).length,1);
});
