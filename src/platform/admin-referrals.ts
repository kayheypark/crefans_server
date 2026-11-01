import {reject,text} from './http';
import {adminPage} from './admin-console';
import {appendAudit,auditChange} from './audit';
import {ensureReferral,REFERRAL_SETTING,referralOn} from './referrals';

// Console referral management (user request 2026-11-01): the on/off switch, the referral list and a link for any member.
const statuses=['pending','qualified','granted','clawed_back','capped','forfeited'];
const serviceOrigin=()=>process.env.MARKETING_PUBLIC_ORIGIN||'https://crefans.com';
export async function adminReferrals(db:any,query:any){
 const {page,size,skip}=adminPage(query),status=query.status===undefined||query.status===''?undefined:text(query.status,20);if(status&&!statuses.includes(status))reject(400,'INVALID_QUERY','조회 조건을 확인해주세요.');
 const where=status?{reward_status:status}:{};
 const [rows,total,counts]=await Promise.all([db.referralSignup.findMany({where,orderBy:[{created_at:'desc'},{id:'desc'}],skip,take:size}),db.referralSignup.count({where}),db.referralSignup.groupBy({by:['reward_status'],_count:{_all:true},_sum:{reward_quantity:true}})]);
 const people=await db.member.findMany({where:{id:{in:[...new Set(rows.flatMap((r:any)=>[r.referrer_id,r.member_id]))]}},select:{id:true,email:true,nickname:true}});
 const person=(id:string)=>{const m=people.find((p:any)=>p.id===id);return{id,nickname:m?.nickname||'탈퇴한 회원',email:m?.email||''};};
 return{enabled:await referralOn(db),summary:Object.fromEntries(statuses.map(s=>{const c=counts.find((x:any)=>x.reward_status===s);return[s,{count:c?._count._all||0,beans:c?._sum.reward_quantity||0}];})),
  items:rows.map((r:any)=>({id:r.id,referrer:person(r.referrer_id),member:person(r.member_id),status:r.reward_status,rewardQuantity:r.reward_quantity,source:r.reward_source,dueAt:r.grant_due_at,rewardedAt:r.rewarded_at,clawedBackAt:r.clawed_back_at,createdAt:r.created_at})),total,page,pageSize:size};
}
export async function updateReferralSettings(db:any,admin:any,input:any){
 if(typeof input?.enabled!=='boolean')reject(400,'INVALID_INPUT','사용 여부를 선택해주세요.');
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT 1 FROM platform_settings WHERE \`key\`=${REFERRAL_SETTING} FOR UPDATE`;
  const prior=await tx.platformSetting.findUnique({where:{key:REFERRAL_SETTING}}),before=prior?.value===true;
  await tx.platformSetting.upsert({where:{key:REFERRAL_SETTING},create:{key:REFERRAL_SETTING,value:input.enabled,updated_by:admin.id},update:{value:input.enabled,updated_by:admin.id}});
  await appendAudit(tx,{category:'admin',action:'admin.referral_settings_updated',entityId:REFERRAL_SETTING,data:{adminId:admin.id,...auditChange({is_active:before},{is_active:input.enabled})}});
  return{enabled:input.enabled,message:input.enabled?'친구 초대 보상을 켰습니다.':'친구 초대 보상을 껐습니다.'};
 });
}
/** Any member (fan or creator) gets a link; it works for signups only while the switch is on. */
export async function adminReferralLink(db:any,memberId:string){
 const member=await db.member.findUnique({where:{id:text(memberId,191)},select:{id:true,enabled:true}});if(!member)reject(404,'MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.');
 const referral=await ensureReferral(db,member.id);
 return{code:referral.id,link:`${serviceOrigin()}/service/signup?ref=${referral.id}`,enabled:await referralOn(db),memberActive:member.enabled};
}
