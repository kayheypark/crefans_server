import {normalizeEmail} from '../auth/local/credentials';
import {can} from './admin-permissions';
import {appendAudit,auditChange,contentDigest} from './audit';
import {beanPolicy} from './bean-policy';
import {betaPolicy} from './beta-policy';
import {POLICY_CONFIRMATION,policyView} from './financial-policy';
import {reject,text} from './http';

// Per-creator overrides. null keeps the platform default (DB financial policy, bean policy, beta minimum withdrawal).
const termKeys=['platform_fee_bps','settlement_hold_days','bean_withdrawal_fee_bps','minimum_withdrawal_krw'] as const;
type Terms=Record<typeof termKeys[number],number|null>;
const limits:Record<typeof termKeys[number],[number,number]>={platform_fee_bps:[0,10000],settlement_hold_days:[0,365],bean_withdrawal_fee_bps:[0,10000],minimum_withdrawal_krw:[beanPolicy.krwPerBean,100000000]};
const fromInput:Record<typeof termKeys[number],string>={platform_fee_bps:'platformFeeBps',settlement_hold_days:'settlementHoldDays',bean_withdrawal_fee_bps:'beanWithdrawalFeeBps',minimum_withdrawal_krw:'minimumWithdrawalKrw'};
export function termsInput(input:any):Terms{
 const out={} as Terms;
 for(const key of termKeys){
  const v=input?.[fromInput[key]],[min,max]=limits[key];
  if(v!==null&&v!==undefined&&(!Number.isSafeInteger(v)||v<min||v>max||key==='minimum_withdrawal_krw'&&v%beanPolicy.krwPerBean))reject(400,'INVALID_CREATOR_TERMS','수수료율·보류 기간·최소 출금 금액을 확인해주세요.');
  out[key]=v??null;
 }
 return out;
}
export const termsView=(t:any)=>({platformFeeBps:t?.platform_fee_bps??null,settlementHoldDays:t?.settlement_hold_days??null,beanWithdrawalFeeBps:t?.bean_withdrawal_fee_bps??null,minimumWithdrawalKrw:t?.minimum_withdrawal_krw??null});
const sameTerms=(a:any,b:Terms)=>termKeys.every(k=>(a?.[k]??null)===b[k]);
const hasTerms=(t:any)=>termKeys.some(k=>t?.[k]!==null&&t?.[k]!==undefined);
// Changing money terms needs the financial-policy permission and the same typed phrase as the platform policy.
function assertTermsChange(admin:any,input:any){
 if(!can(admin,'settings','update'))reject(403,'ADMIN_PERMISSION_REQUIRED','수수료·출금 조건을 변경할 권한이 없습니다.');
 if(input?.confirmation!==POLICY_CONFIRMATION)reject(400,'CONFIRMATION_REQUIRED','확인 문구를 정확히 입력해주세요.');
}
const termsAudit=(t:any)=>t?{platform_fee_bps:t.platform_fee_bps??null,settlement_hold_days:t.settlement_hold_days??null,bean_withdrawal_fee_bps:t.bean_withdrawal_fee_bps??null,minimum_withdrawal_krw:t.minimum_withdrawal_krw??null,version:t.version}:null;

export const inviteView=(i:any)=>({id:i.id,email:i.email,memo:i.memo,terms:termsView(i),status:i.used_at?'used':i.revoked_at?'revoked':'active',memberId:i.member_id,usedAt:i.used_at,revokedAt:i.revoked_at,version:i.version,createdAt:i.created_at,updatedAt:i.updated_at});
export async function listInvites(db:any,query:any){
 const page=Number(query.page||1),status=query.status||'active';
 if(!Number.isSafeInteger(page)||page<1||page>10000||!['active','used','revoked'].includes(status))reject(400,'INVALID_QUERY','조회 조건을 확인해주세요.');
 const search=query.search===undefined?'':text(query.search,191,false);
 const where={...(status==='active'?{revoked_at:null,used_at:null}:status==='used'?{used_at:{not:null}}:{revoked_at:{not:null},used_at:null}),...(search?{OR:[{email:{contains:search}},{memo:{contains:search}}]}:{})};
 const [items,total]=await db.$transaction([db.signupInvite.findMany({where,orderBy:[{created_at:'desc'},{id:'desc'}],skip:(page-1)*20,take:20}),db.signupInvite.count({where})]);
 // Platform values that empty term fields fall back to, shown in the invite form and confirmation.
 return{items:items.map(inviteView),total,page,defaults:await defaultTerms(db)};
}
const inviteAudit=(i:any)=>i?{...termsAudit(i),status:i.used_at?'used':i.revoked_at?'revoked':'active',contentHash:contentDigest(i.email),titleHash:contentDigest(i.memo)}:null;
export async function saveInvite(db:any,admin:any,id:string|undefined,input:any){
 const memo=text(input?.memo??'',100,false),terms=termsInput(input);
 const email=id?null:normalizeEmail(text(input?.email,191));
 if(email!==null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject(400,'INVALID_EMAIL','이메일 형식을 확인해주세요.');
 return db.$transaction(async(tx:any)=>{
  let before:any=null;
  if(id){await tx.$queryRaw`SELECT id FROM signup_invites WHERE id=${id} FOR UPDATE`;before=await tx.signupInvite.findUnique({where:{id}});if(!before)reject(404,'INVITE_NOT_FOUND','초대를 찾을 수 없습니다.');if(before.revoked_at)reject(409,'INVITE_REVOKED','취소된 초대입니다. 같은 이메일로 다시 초대해주세요.');if(input?.expectedVersion!==before.version)reject(409,'INVITE_CHANGED','다른 운영자가 초대를 변경했습니다. 다시 불러와주세요.');}
  else{
   const holder=await tx.member.findFirst({where:{email:email!},select:{id:true,withdrawn_at:true}});
   if(holder&&!holder.withdrawn_at)reject(409,'MEMBER_EXISTS','이미 가입한 이메일입니다. 회원·크리에이터 메뉴에서 조건을 설정해주세요.');
   // 2026-10-31: a withdrawn member may be invited again before the 30-day purge. Only the email and the CI-derived
   // duplicate-signup value are released now (both unique); the rest of the account still waits for the purge job.
   if(holder){await tx.member.update({where:{id:holder.id},data:{email:`withdrawn-${holder.id}@deleted.invalid`,identity_hash:null}});await appendAudit(tx,{category:'admin',action:'member.email_released',entityId:holder.id,data:{memberId:holder.id}});}
   await tx.$queryRaw`SELECT id FROM signup_invites WHERE email=${email} FOR UPDATE`;before=await tx.signupInvite.findUnique({where:{email:email!}});
   if(before&&!before.revoked_at&&!before.used_at)reject(409,'INVITE_EXISTS','이미 초대된 이메일입니다.');
   // An invite used by a member who has since withdrawn (or been erased) is reissued; otherwise the member still holds it.
   if(before?.used_at&&!(before.member_id&&(await tx.member.findUnique({where:{id:before.member_id},select:{withdrawn_at:true}}))?.withdrawn_at))reject(409,'INVITE_USED','가입을 마친 초대입니다. 회원·크리에이터 메뉴에서 조건을 변경해주세요.');
  }
  if(id&&before?.used_at)reject(409,'INVITE_USED','가입을 마친 초대입니다. 회원·크리에이터 메뉴에서 조건을 변경해주세요.');
  // A revoked or reissued invite's terms are no longer in effect: re-inviting that email is judged like a new invite.
  const reissued=!id&&!!before?.used_at,current=!id&&(before?.revoked_at||reissued)?null:before;
  if(!sameTerms(current,terms)&&(hasTerms(terms)||hasTerms(current)))assertTermsChange(admin,input);
  // A revoked email that is invited again reuses its row so the email stays unique.
  const saved=before?await tx.signupInvite.update({where:{id:before.id},data:{memo,...terms,revoked_at:null,...(reissued?{used_at:null,member_id:null}:{}),version:{increment:1}}}):await tx.signupInvite.create({data:{email:email!,memo,...terms}});
  await appendAudit(tx,{category:'admin',action:reissued?'admin.signup_invite_reissued':before&&!id?'admin.signup_invite_restored':before?'admin.signup_invite_updated':'admin.signup_invite_created',entityId:saved.id,data:auditChange(inviteAudit(before),inviteAudit(saved)!)});
  return{invite:inviteView(saved),message:'초대를 저장했습니다.'};
 });
}
export async function revokeInvite(db:any,id:string,input:any){
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM signup_invites WHERE id=${id} FOR UPDATE`;
  const before=await tx.signupInvite.findUnique({where:{id}});
  if(!before)reject(404,'INVITE_NOT_FOUND','초대를 찾을 수 없습니다.');
  if(before.used_at)reject(409,'INVITE_USED','가입을 마친 초대는 취소할 수 없습니다.');
  if(before.revoked_at)return{message:'이미 취소된 초대입니다.'};
  if(input?.expectedVersion!==before.version)reject(409,'INVITE_CHANGED','다른 운영자가 초대를 변경했습니다. 다시 불러와주세요.');
  const saved=await tx.signupInvite.update({where:{id},data:{revoked_at:new Date(),version:{increment:1}}});
  await appendAudit(tx,{category:'admin',action:'admin.signup_invite_revoked',entityId:id,data:auditChange(inviteAudit(before),inviteAudit(saved)!)});
  return{message:'초대를 취소했습니다.'};
 });
}
export async function hasActiveInvite(db:any,email:string){return !!await db.signupInvite.findFirst({where:{email:normalizeEmail(email),revoked_at:null,used_at:null},select:{id:true}});}
// Runs inside the signup transaction: the invite is consumed and its terms become the new member's terms.
export async function consumeInvite(tx:any,email:string,memberId:string){
 await tx.$queryRaw`SELECT id FROM signup_invites WHERE email=${normalizeEmail(email)} FOR UPDATE`;
 const invite=await tx.signupInvite.findFirst({where:{email:normalizeEmail(email),revoked_at:null,used_at:null}});
 if(!invite)return false;
 await tx.signupInvite.update({where:{id:invite.id},data:{used_at:new Date(),member_id:memberId,version:{increment:1}}});
 if(hasTerms(invite)){const saved=await tx.creatorFinancialTerms.create({data:{member_id:memberId,...Object.fromEntries(termKeys.map(k=>[k,invite[k]]))}});await recordTermChange(tx,saved,'invite',null,'초대 조건 적용');}
 await appendAudit(tx,{category:'auth',action:'auth.signup_invite_used',entityId:invite.id,data:{memberId}});
 return true;
}

// One history row per saved version; (member_id, version) is unique so a version is never rewritten.
async function recordTermChange(tx:any,saved:any,source:'admin'|'invite',changedBy:string|null,reason:string){
 await tx.creatorFinancialTermChange.create({data:{member_id:saved.member_id,version:saved.version,...Object.fromEntries(termKeys.map(k=>[k,saved[k]])),source,changed_by:changedBy,reason}});
}
export async function memberTerms(db:any,memberId:string){
 if(!await db.member.findUnique({where:{id:memberId},select:{id:true}}))reject(404,'MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.');
 const row=await db.creatorFinancialTerms.findUnique({where:{member_id:memberId}});
 const changes=await db.creatorFinancialTermChange.findMany({where:{member_id:memberId},orderBy:{version:'desc'},take:100});
 const admins=await db.admin.findMany({where:{id:{in:[...new Set(changes.map((c:any)=>c.changed_by).filter(Boolean))]}},select:{id:true,name:true}});
 const history=changes.map((c:any)=>({version:c.version,terms:termsView(c),source:c.source,changedBy:c.changed_by,changedByName:admins.find((a:any)=>a.id===c.changed_by)?.name??null,reason:c.reason,createdAt:c.created_at}));
 return{terms:termsView(row),version:row?.version??0,defaults:await defaultTerms(db),history};
}
export async function saveMemberTerms(db:any,admin:any,memberId:string,input:any){
 const terms=termsInput(input);
 return db.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT id FROM members WHERE id=${memberId} FOR UPDATE`;
  if(!await tx.member.findUnique({where:{id:memberId},select:{id:true}}))reject(404,'MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.');
  const before=await tx.creatorFinancialTerms.findUnique({where:{member_id:memberId}});
  if(input?.expectedVersion!==(before?.version??0))reject(409,'TERMS_CHANGED','다른 운영자가 조건을 변경했습니다. 다시 불러와주세요.');
  if(sameTerms(before,terms))return{terms:termsView(before),version:before?.version??0,message:'변경된 조건이 없습니다.'};
  assertTermsChange(admin,input);const reason=text(input?.reason,500);
  const saved=before?await tx.creatorFinancialTerms.update({where:{member_id:memberId},data:{...terms,version:{increment:1}}}):await tx.creatorFinancialTerms.create({data:{member_id:memberId,...terms}});
  await recordTermChange(tx,saved,'admin',admin.id,reason);
  await appendAudit(tx,{category:'admin',action:'admin.creator_terms_updated',entityId:memberId,data:auditChange(termsAudit(before),termsAudit(saved)!)});
  return{terms:termsView(saved),version:saved.version,message:'수수료·출금 조건을 저장했습니다. 이후 결제·출금 신청부터 적용됩니다.'};
 });
}

async function defaultTerms(db:any){
 const p=policyView(await db.financialPolicy.findUnique({where:{id:'platform'}}));
 return{platformFeeBps:p.platformFeeBps,settlementHoldDays:p.settlementHoldDays,beanWithdrawalFeeBps:beanPolicy.withdrawalFeeBps,minimumWithdrawalKrw:betaPolicy.minimumWithdrawal};
}
// Withdrawal terms in effect for a creator right now. Membership fee/hold are resolved in paymentPolicy.
export async function withdrawalTerms(db:any,memberId:string){
 const row=await db.creatorFinancialTerms.findUnique({where:{member_id:memberId}});
 const minimumWithdrawalKrw=row?.minimum_withdrawal_krw??betaPolicy.minimumWithdrawal;
 return{beanWithdrawalFeeBps:row?.bean_withdrawal_fee_bps??beanPolicy.withdrawalFeeBps,minimumWithdrawalKrw,minimumWithdrawalBeans:Math.ceil(minimumWithdrawalKrw/beanPolicy.krwPerBean)};
}
// Studio shows a creator's own terms only when an override exists; otherwise the published default notes apply.
export async function studioTerms(db:any,memberId:string){
 const row=await db.creatorFinancialTerms.findUnique({where:{member_id:memberId}});
 if(!row)return null;
 const d=await defaultTerms(db);
 return{platformFeeBps:row.platform_fee_bps??d.platformFeeBps,settlementHoldDays:row.settlement_hold_days??d.settlementHoldDays,beanWithdrawalFeeBps:row.bean_withdrawal_fee_bps??d.beanWithdrawalFeeBps,minimumWithdrawalKrw:row.minimum_withdrawal_krw??d.minimumWithdrawalKrw};
}
