// Defaults are technical access-log housekeeping, not a statutory retention policy.
export async function pruneAuditLogs(db:any,now=new Date()){
 const access=Number(process.env.ACCESS_LOG_RETENTION_DAYS||7),audit=Number(process.env.AUDIT_RETENTION_DAYS||0);
 if(!Number.isInteger(access)||access<1||access>3650||!Number.isInteger(audit)||audit<0||audit>3650)throw new Error('Invalid audit retention configuration');
 const OR:any[]=[{category:'request',occurred_at:{lt:new Date(+now-access*86400000)}}];
 // Zero deliberately holds the audit trail pending the operator's retention decision.
 if(audit)OR.push({category:{not:'request'},occurred_at:{lt:new Date(+now-audit*86400000)}});
 const rows=await db.platformAuditLog.findMany({where:{OR},select:{id:true},orderBy:{occurred_at:'asc'},take:1000});
 return rows.length?(await db.platformAuditLog.deleteMany({where:{id:{in:rows.map(r=>r.id)}}})).count:0;
}
