require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {PlatformStudioService}=require('../dist/src/platform/studio.service');
const {studioTerms}=require('../dist/src/platform/signup-invites');
const {paymentPolicy}=require('../dist/src/platform/financial-policy');
const errorCode=code=>error=>error.getResponse().code===code;
function fixture(){
 const state={plan:{id:'plan',creator_id:'owner',name:'별빛 멤버십',is_deleted:false,is_active:true},count:0,updates:[],locks:0,onLock:null};
 const membershipItem={findFirst:async({where})=>state.plan.id===where.id&&state.plan.creator_id===where.creator_id&&!state.plan.is_deleted?{...state.plan}:null,update:async args=>{state.updates.push(args);Object.assign(state.plan,args.data);return state.plan;}};
 const db={membershipItem,subscription:{count:async()=>state.count},$queryRaw:async()=>{state.locks++;state.onLock?.();},$transaction:async fn=>fn(db)};
 return {state,service:new PlatformStudioService({db})};
}
test('missing, partial and whitespace confirmation cannot mutate memberships',async()=>{
 for(const confirmation of [undefined,null,'','별빛','별빛멤버십','별빛 멤버십 ',123]){const {state,service}=fixture();await assert.rejects(service.membershipState('owner','plan',{deleted:true,confirmation}),errorCode('CONFIRMATION_REQUIRED'));assert.equal(state.updates.length,0);}
});
test('exact name soft deletes and keeps existing subscription restriction',async()=>{
 const {state,service}=fixture();state.count=1;
 await assert.rejects(service.membershipState('owner','plan',{deleted:true,confirmation:state.plan.name}),errorCode('ACTIVE_SUBSCRIBERS'));assert.equal(state.updates.length,0);
 state.count=0;await service.membershipState('owner','plan',{deleted:true,confirmation:state.plan.name});assert.equal(state.updates.length,1);assert.equal(state.plan.is_deleted,true);assert.equal(state.plan.is_active,false);
 await assert.rejects(service.membershipState('owner','plan',{deleted:true,confirmation:state.plan.name}),errorCode('PLAN_NOT_FOUND'));assert.equal(state.updates.length,1);
});
test('ownership and a concurrent rename/deletion are rechecked under the row lock',async()=>{
 const {state,service}=fixture();await assert.rejects(service.membershipState('other','plan',{deleted:true,confirmation:state.plan.name}),errorCode('PLAN_NOT_FOUND'));
 state.onLock=()=>{state.plan.name='변경된 이름';};await assert.rejects(service.membershipState('owner','plan',{deleted:true,confirmation:'별빛 멤버십'}),errorCode('CONFIRMATION_REQUIRED'));
 state.onLock=()=>{state.plan.is_deleted=true;};await assert.rejects(service.membershipState('owner','plan',{deleted:true,confirmation:'변경된 이름'}),errorCode('PLAN_NOT_FOUND'));assert.equal(state.updates.length,0);
});
test('activation does not require deletion confirmation',async()=>{const {state,service}=fixture();await service.membershipState('owner','plan',{active:false});assert.equal(state.plan.is_active,false);assert.equal(state.plan.is_deleted,false);});
test('studio rate equals new-order payment policy with no override, partial override and zero override',async()=>{
 for(const row of [null,{platform_fee_bps:null},{platform_fee_bps:1550},{platform_fee_bps:0}]){
  const db={financialPolicy:{findUnique:async()=>({platform_fee_bps:1700,settlement_hold_days:9,version:2})},creatorFinancialTerms:{findUnique:async()=>row}};
  const terms=await studioTerms(db,'owner'),policy=await paymentPolicy(db,'owner');assert.equal(terms.platformFeeBps,policy.platformFeeBps);assert.equal(terms.settlementHoldDays,policy.settlementHoldDays);assert.equal(terms.platformFeeBps,row?.platform_fee_bps??1700);
 }
});

test('API documentation requires confirmation only for deletion',()=>{
 const {endpoints}=require('../dist/src/platform/openapi-contract');
 const endpoint=Object.values(endpoints).find(e=>e.summary==='멤버십 활성화·삭제');
 assert.deepEqual(endpoint.body.oneOf[0].required,['active']);assert.deepEqual(endpoint.body.oneOf[1].required,['deleted','confirmation']);
});
