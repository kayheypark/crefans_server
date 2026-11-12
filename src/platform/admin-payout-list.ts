import {can} from './admin-permissions';
import {financialAdmin} from './admin-console';
import {nextPayoutCutoff} from './beta-policy';

// Weekly manual-payout worklist (2026-11-10 user request): every open membership withdrawal and, for operators who can
// see beans, every open bean payout, with the creator, the transfer amount and the settlement account summary.
// Amounts are what the operator transfers: membership withdrawals are already net of the platform fee, bean payouts use net.
// The full account number is never in this list; it is revealed per account through an audited request.
// 2026-11-11 user decision: the transfer total holds only this Wednesday's batch (processing, or requested before the batch
// cutoff) on a verified, unchanged account. Everything else is listed apart with the reason, because the server refuses to
// record those transfers (PAYOUT_SCHEDULED / ACCOUNT_NOT_VERIFIED) and paying them first would split the ledger from the bank.
const OPEN=['requested','processing'],LIMIT=500;

export async function adminPayoutList(db:any,admin:any,now=new Date()){
 financialAdmin(admin);const beans=can(admin,'beans','view');
 const [withdrawals,payouts]=await Promise.all([
  db.withdrawalRequest.findMany({where:{status:{in:OPEN}},orderBy:[{created_at:'asc'},{id:'asc'}],take:LIMIT+1,select:{id:true,creator_id:true,account_id:true,amount:true,status:true,note:true,created_at:true}}),
  beans?db.beanPayout.findMany({where:{status:{in:OPEN}},orderBy:[{created_at:'asc'},{id:'asc'}],take:LIMIT+1,select:{id:true,creator_id:true,account_id:true,account_version:true,net:true,environment:true,status:true,note:true,created_at:true}}):[]]);
 const truncated=withdrawals.length>LIMIT||payouts.length>LIMIT,ws=withdrawals.slice(0,LIMIT),ps=payouts.slice(0,LIMIT);
 const creatorIds=[...new Set([...ws,...ps].map((r:any)=>r.creator_id))],accountIds=[...new Set([...ws,...ps].map((r:any)=>r.account_id))];
 const [accounts,members,creators]=await Promise.all([
  accountIds.length?db.settlementAccount.findMany({where:{id:{in:accountIds}},select:{id:true,creator_id:true,bank:true,holder_alias:true,last_four:true,verified:true,version:true,account_encrypted:true}}):[],
  creatorIds.length?db.member.findMany({where:{id:{in:creatorIds}},select:{id:true,nickname:true}}):[],
  creatorIds.length?db.creator.findMany({where:{user_id:{in:creatorIds}},select:{user_id:true,display_name:true,handle:true,is_verified:true}}):[]]);
 const accountById=new Map(accounts.map((a:any)=>[a.id,a])),memberById=new Map(members.map((m:any)=>[m.id,m])),creatorById=new Map(creators.map((c:any)=>[c.user_id,c]));
 const person=(id:string)=>{const c:any=creatorById.get(id),m:any=memberById.get(id);return{creatorId:id,creatorName:c?.display_name||m?.nickname||'',handle:c?.handle||null,partner:c?.is_verified===true};};
 const accountView=(id:string,version?:number)=>{const a:any=accountById.get(id);if(!a)return{id,missing:true};
  return{id,bank:a.bank,holder:a.holder_alias,lastFour:a.last_four,verified:a.verified,hasNumber:!!a.account_encrypted,changed:version!==undefined&&version!==a.version};};
 const cutoff=nextPayoutCutoff(now);
 // 2026-11-12: without the partner badge the server refuses the transfer record (PARTNER_CONTRACT_REQUIRED), so it is held.
 const hold=(i:any)=>i.test?'test':!i.partner?'partner-unverified':i.account.missing?'account-missing':!i.account.verified||!i.account.hasNumber?'account-unverified':i.account.changed?'account-changed':i.status==='requested'&&+i.createdAt>=+cutoff?'next-batch':null;
 const items=[
  ...ws.map((w:any)=>({id:w.id,kind:'membership',...person(w.creator_id),amount:w.amount,status:w.status,note:w.note||null,test:false,createdAt:w.created_at,account:accountView(w.account_id)})),
  ...ps.map((p:any)=>({id:p.id,kind:'bean',...person(p.creator_id),amount:p.net,status:p.status,note:p.note||null,test:p.environment!=='live',createdAt:p.created_at,account:accountView(p.account_id,p.account_version)}))]
  .map((i:any)=>{const reason=hold(i);return{...i,due:!reason,holdReason:reason};})
  .sort((a,b)=>a.creatorName.localeCompare(b.creatorName,'ko')||a.creatorId.localeCompare(b.creatorId)||+a.createdAt-+b.createdAt);
 // Test-environment bean payouts are listed so the operator can reject them, but they are never part of a transfer total.
 const groups=new Map<string,any>();for(const i of items){if(!i.due)continue;const g=groups.get(i.creatorId)||{creatorId:i.creatorId,creatorName:i.creatorName,handle:i.handle,count:0,amount:0};g.count++;g.amount+=i.amount;groups.set(i.creatorId,g);}
 const creatorsDue=[...groups.values()],amount=creatorsDue.reduce((s,g)=>s+g.amount,0);
 if(!Number.isSafeInteger(amount))throw new Error('payout total overflow');
 const held=items.filter(i=>!i.due&&!i.test);
 return{items,creators:creatorsDue,batchCutoff:cutoff,totals:{count:items.filter(i=>i.due).length,amount,creators:creatorsDue.length,testCount:items.filter(i=>i.test).length,heldCount:held.length,heldAmount:held.reduce((s,i)=>s+i.amount,0)},beans,truncated};
}
