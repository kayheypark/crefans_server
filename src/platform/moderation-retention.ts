// Report and sanction records (2026-11-02 user decision, privacy policy §7): kept 3 years after handling ends, then deleted.
// A report ends when it is resolved; a sanction ends when its period ends (until), otherwise when it was taken. Pending reports
// stay. The current state of a post or account lives on that row, so deleting the history never lifts a sanction.
export const MODERATION_RETENTION_YEARS=3;
export async function pruneModerationRecords(db:any,now=new Date()){
 const cutoff=new Date(now);cutoff.setFullYear(cutoff.getFullYear()-MODERATION_RETENTION_YEARS);
 const reports=await db.userReport.deleteMany({where:{status:{not:'PENDING'},resolved_at:{lt:cutoff}}});
 const actions=await db.moderationAction.deleteMany({where:{OR:[{until:null,created_at:{lt:cutoff}},{until:{lt:cutoff}}]}});
 return reports.count+actions.count;
}
