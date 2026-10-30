require('reflect-metadata');require('dotenv').config({path:'.local/platform.env',override:true});
// 2026-10-30 /pilot-work follow-ups: operator actions notify the member with a public reason, a creator leaves only after
// sales stop and paid periods end (remainder withdrawable below the minimum), refunds after payout become receivables,
// and the 30-day purge also removes messages, inquiries and the CI-derived hash.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{PrismaClient}=require('@prisma/client');
const source=process.env.DATABASE_URL;assert.match(source||'',/@127\.0\.0\.1:3307\/crefans_platform_dev$/);const url=new URL(source);url.pathname='/crefans_platform_e2e';process.env.DATABASE_URL=url.toString();
const {NestFactory}=require('@nestjs/core'),{PlatformModule}=require('../dist/src/platform/module'),{cookieParser}=require('../dist/src/platform/middleware'),{EnvelopeInterceptor,PlatformExceptionFilter}=require('../dist/src/platform/http'),{digest}=require('../dist/src/auth/local/credentials'),{requestContext}=require('../dist/src/platform/request-context');
const {PlatformService}=require('../dist/src/platform/service'),{PlatformFinanceService}=require('../dist/src/platform/finance.service'),{purgeWithdrawnMembers}=require('../dist/src/platform/member-purge');
const db=new PrismaClient(),tag=randomBytes(4).toString('hex'),ids={creator:randomUUID(),fan:randomUUID(),leaver:randomUUID()},admins=[],cookies={};let app,origin,release,postId,service,finance;
async function api(path,actor,body,method=body?'POST':'GET'){const res=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://beta.crefans.com',...(actor?{cookie:cookies[actor]}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};}
async function session(name,id){const token='la.'+randomBytes(32).toString('base64url');cookies[name]='access_token='+token;await db.memberSession.create({data:{member_id:id,access_hash:digest(token),refresh_hash:digest(randomUUID()),access_until:new Date(Date.now()+3600000),expires_at:new Date(Date.now()+3600000)}});}
const code=c=>e=>e.getResponse?.().code===c;
before(async()=>{release=await require('./e2e-db-lock.cjs').lockE2EDatabase(source);const fs=require('node:fs/promises'),path=require('node:path'),temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'crefans-followups-schema-'));try{await fs.copyFile('prisma/schema.prisma',path.join(temp,'schema.prisma'));await fs.cp('prisma/migrations',path.join(temp,'migrations'),{recursive:true});const r=require('node:child_process').spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(temp,'schema.prisma')],{cwd:temp,env:process.env,encoding:'utf8'});assert.equal(r.status,0,'isolated migrations must pass');}finally{await fs.rm(temp,{recursive:true,force:true});}
 for(const [name,id] of Object.entries(ids)){await db.member.create({data:{id,email:`${name}-${tag}@followups.test.invalid`,password_hash:'x',nickname:name+tag,name,preferred_username:name+tag,email_verified:true,status:'CONFIRMED'}});await session(name,id);}
 for(const id of [ids.creator,ids.leaver])await db.creator.create({data:{user_id:id,display_name:'후속 검증 '+tag,handle:'fu'+id.slice(0,8)}});
 postId=(await db.posting.create({data:{user_sub:ids.creator,title:'후속 검증 글 '+tag,content:'본문',status:'PUBLISHED',is_public:true,allow_comments:true,published_at:new Date()}})).id;
 const a=await db.admin.create({data:{user_sub:randomUUID(),name:'moderator',email:randomUUID()+'@followups.test.invalid',role:'ADMIN',permissions:{content:{view:true,update:true},members:{view:true,update:true}}}});admins.push(a.id);cookies.moderator=await require('./admin-session.cjs')(db,a.id);
 app=await NestFactory.create(PlatformModule,{logger:false});app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req,res,next)=>requestContext.run({ip:'127.0.0.1',peerIp:'127.0.0.1',requestId:randomUUID()},next));app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());await app.listen(0,'127.0.0.1');origin=await app.getUrl();
 service=app.get(PlatformService);finance=app.get(PlatformFinanceService);});
after(async()=>{await app?.close();const all=Object.values(ids);const plans=(await db.membershipItem.findMany({where:{creator_id:{in:all}},select:{id:true}})).map(p=>p.id);
 await db.memberNotice.deleteMany({where:{member_id:{in:all}}});await db.memberNotification.deleteMany({where:{member_id:{in:all}}});await db.creatorReceivable.deleteMany({where:{creator_id:{in:all}}});
 await db.withdrawalRequest.deleteMany({where:{creator_id:{in:all}}});await db.settlementAccount.deleteMany({where:{creator_id:{in:all}}});await db.revenueEntry.deleteMany({where:{creator_id:{in:all}}});await db.checkoutOrder.deleteMany({where:{membership_id:{in:plans}}});await db.subscription.deleteMany({where:{membership_item_id:{in:plans}}});await db.membershipItem.deleteMany({where:{id:{in:plans}}});
 const comments=(await db.comment.findMany({where:{posting_id:postId},select:{id:true}})).map(c=>c.id);await db.moderationAction.deleteMany({where:{target_id:{in:[postId,...comments,...all]}}});await db.platformAuditLog.deleteMany({where:{entity_id:{in:[postId,...comments,...all]}}});await db.comment.deleteMany({where:{posting_id:postId}});
 await db.directMessage.deleteMany({where:{OR:[{sender_id:{in:all}},{recipient_id:{in:all}}]}});await db.supportTicket.deleteMany({where:{member_id:{in:all}}});await db.identityProof.deleteMany({where:{member_id:{in:all}}});
 await db.posting.deleteMany({where:{user_sub:{in:all}}});await db.creator.deleteMany({where:{user_id:{in:all}}});await db.userProfile.deleteMany({where:{user_id:{in:all}}});await db.memberSession.deleteMany({where:{member_id:{in:all}}});await db.admin.deleteMany({where:{id:{in:admins}}});await db.member.deleteMany({where:{id:{in:all}}});await db.$disconnect();await release?.();});

test('hiding a post or comment and restricting a member need a public reason and send an app notice plus a queued mail',async()=>{
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true,reason:'내부 메모'})).status,400,'the public reason is required');
 assert.equal((await api(`/admin/posts/${postId}/moderation`,'moderator',{hidden:true,reason:'신고 3건 확인',publicReason:'저작권 침해 신고가 확인되었습니다.'})).status,201);
 const note=(await db.memberNotification.findMany({where:{member_id:ids.creator,type:'moderation'}}))[0];assert.equal(note.text,'운영 정책에 따라 게시물이 숨겨졌습니다.');assert.equal(note.path,`/post/${postId}`);
 const mail=await db.memberNotice.findFirstOrThrow({where:{member_id:ids.creator,kind:'moderation'}});assert.deepEqual(mail.rows.at(-1),['사유','저작권 침해 신고가 확인되었습니다.']);assert.equal(JSON.stringify(mail.rows).includes('신고 3건 확인'),false,'the internal reason stays internal');
 const history=await api(`/admin/posts/${postId}/moderation`,'moderator');assert.deepEqual([history.data[0].reason,history.data[0].publicReason],['신고 3건 확인','저작권 침해 신고가 확인되었습니다.']);
 const boot=await api('/bootstrap','creator');assert.equal(boot.data.data.notifications.find(n=>n.text.startsWith('운영 정책')).type,'운영 안내');
 const c=await db.comment.create({data:{posting_id:postId,author_id:ids.fan,content:'광고 댓글'}});await db.posting.update({where:{id:postId},data:{comment_count:{increment:1}}});
 assert.equal((await api(`/admin/comments/${c.id}/moderation`,'moderator',{hidden:true,reason:'스팸',publicReason:'광고성 댓글입니다.'})).status,201);
 assert.ok(await db.memberNotification.findFirst({where:{member_id:ids.fan,type:'moderation',text:'운영 정책에 따라 댓글이 숨겨졌습니다.'}}));
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:true,days:7,reason:'반복 스팸',publicReason:'광고 댓글을 반복해 7일간 이용이 제한됩니다.'})).status,201);
 const suspended=await db.memberNotice.findFirstOrThrow({where:{member_id:ids.fan,kind:'moderation',rows:{array_contains:[['조치','이용 제한']]}}});assert.ok(JSON.stringify(suspended.rows).includes('까지'));
 assert.equal((await api(`/admin/members/${ids.fan}/suspension`,'moderator',{suspended:false,reason:'소명',publicReason:'소명을 확인해 제한을 해제했습니다.'})).status,201);
 assert.equal(await db.memberNotice.count({where:{member_id:ids.fan,kind:'moderation'}}),3);
});

test('a creator leaves only after sales stop and paid periods end; the remainder can then be withdrawn below the minimum',async()=>{
 const id=ids.leaver,plan=await db.membershipItem.create({data:{creator_id:id,name:'탈퇴 검증',price:9900,billing_unit:'MONTH',benefits:''}});
 await assert.rejects(service.withdrawAccount(id),code('MEMBERSHIP_ON_SALE'));
 await db.membershipItem.update({where:{id:plan.id},data:{is_active:false}});
 const sub=await db.subscription.create({data:{subscriber_id:ids.fan,membership_item_id:plan.id,amount:9900,status:'CANCELLED',auto_renew:false,ended_at:new Date(Date.now()+5*86400000)}});
 await assert.rejects(service.withdrawAccount(id),code('PAID_PERIOD_REMAINS'));
 assert.deepEqual((await finance.finance(id)).closingBlockers.map(b=>b.code),['PAID_PERIOD_REMAINS']);
 await db.subscription.update({where:{id:sub.id},data:{ended_at:new Date(Date.now()-1000)}});
 const order=await db.checkoutOrder.create({data:{member_id:ids.fan,membership_id:plan.id,snapshot:{name:'탈퇴 검증'},amount:9900,status:'paid',idempotency_key:randomUUID(),expires_at:new Date(),paid_at:new Date(Date.now()-20*86400000)}});
 await db.revenueEntry.create({data:{creator_id:id,order_id:order.id,title:'탈퇴 검증',gross:9900,fees:1980,net:7920,available_at:new Date(Date.now()-10*86400000),receipt_confirmed_at:new Date(),received_amount:7920}});
 await assert.rejects(service.withdrawAccount(id),code('EARNINGS_REMAIN'));
 const account=await db.settlementAccount.create({data:{creator_id:id,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',verified:true}});
 await assert.rejects(finance.review(id,{amount:7920,accountId:account.id}),code('INVALID_AMOUNT'),'below the minimum without closing');
 await assert.rejects(finance.review(id,{amount:5000,accountId:account.id,closing:true}),code('CLOSING_WITHDRAWAL_ALL'));
 const quote=await finance.review(id,{amount:7920,accountId:account.id,closing:true});assert.equal(quote.availableAfterRequest,0);
 await db.withdrawalRequest.create({data:{creator_id:id,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:7920,status:'paid'}});
 assert.equal((await service.withdrawAccount(id)).message,'회원 탈퇴가 완료되었습니다.');
});

test('a refund after payout becomes a receivable with a notice and settles itself once later income covers it',async()=>{
 const id=ids.creator,plan=await db.membershipItem.create({data:{creator_id:id,name:'미수금 검증',price:10000,billing_unit:'MONTH',benefits:''}});
 const order=await db.checkoutOrder.create({data:{member_id:ids.fan,membership_id:plan.id,snapshot:{name:'미수금 검증'},amount:10000,status:'paid',idempotency_key:randomUUID(),expires_at:new Date(),paid_at:new Date(Date.now()-20*86400000)}});
 await db.revenueEntry.create({data:{creator_id:id,order_id:order.id,title:'미수금 검증',gross:10000,fees:2000,net:8000,available_at:new Date(Date.now()-10*86400000),receipt_confirmed_at:new Date(),received_amount:8000}});
 const account=await db.settlementAccount.create({data:{creator_id:id,bank:'Synthetic',holder_alias:'Synthetic',last_four:'1234',verified:true}});
 await db.withdrawalRequest.create({data:{creator_id:id,request_key:randomUUID(),account_id:account.id,account_label:'Synthetic',amount:8000,status:'paid'}});
 await finance.completeRefund(order,'provider');await finance.completeRefund(order,'provider');
 const r=await db.creatorReceivable.findMany({where:{creator_id:id,kind:'membership'}});assert.deepEqual(r.map(x=>[x.amount,x.status]),[[8000,'open']],'one receivable for the paid-out income');
 assert.ok(await db.memberNotification.findFirst({where:{member_id:id,type:'settlement',text:{contains:'8,000원'}}}));
 assert.deepEqual((await finance.finance(id)).receivables.map(x=>x.amount),[8000]);
 await finance.settleReceivables();assert.equal((await db.creatorReceivable.findUniqueOrThrow({where:{id:r[0].id}})).status,'open','still owed');
 const next=await db.checkoutOrder.create({data:{member_id:ids.fan,membership_id:plan.id,snapshot:{name:'미수금 검증'},amount:12000,status:'paid',idempotency_key:randomUUID(),expires_at:new Date(),paid_at:new Date(Date.now()-15*86400000)}});
 await db.revenueEntry.create({data:{creator_id:id,order_id:next.id,title:'다음 결제',gross:12000,fees:2400,net:9600,available_at:new Date(Date.now()-5*86400000),receipt_confirmed_at:new Date(),received_amount:9600}});
 await finance.settleReceivables();const settled=await db.creatorReceivable.findUniqueOrThrow({where:{id:r[0].id}});assert.deepEqual([settled.status,settled.settled_by],['settled','system']);
 assert.equal((await finance.finance(id)).summary.available,1600,'the next income paid the receivable first');
});

test('30 days after withdrawal the purge removes the CI-derived hash, keeps messages for the other side and inquiries for 3 years',async()=>{
 const id=ids.fan,other=ids.creator,hash='c'.repeat(64);
 await db.directMessage.createMany({data:[{sender_id:id,recipient_id:other,body:'보낸 메시지'},{sender_id:other,recipient_id:id,body:'받은 메시지'}]});
 await db.supportTicket.create({data:{member_id:id,category:'기타',title:'문의',message:'내용'}});
 await db.identityProof.create({data:{token_hash:randomBytes(32).toString('hex'),provider_reference:randomUUID(),member_id:id,attempt_id:randomUUID(),identity_hash:hash,expires_at:new Date()}});
 await db.member.update({where:{id},data:{enabled:false,withdrawn_at:new Date(Date.now()-31*86400000)}});
 await purgeWithdrawnMembers(db);
 const proof=await db.identityProof.findFirstOrThrow({where:{member_id:id}});assert.notEqual(proof.identity_hash,hash);assert.equal(proof.verified_name,null);
 assert.equal(await db.directMessage.count({where:{OR:[{sender_id:id},{recipient_id:id}]}}),2,'the other person keeps the conversation');
 assert.equal((await db.member.findUniqueOrThrow({where:{id}})).nickname,'탈퇴한 사용자');
 assert.equal(await db.supportTicket.count({where:{member_id:id}}),1,'inquiries are dispute records for 3 years');
 await db.member.update({where:{id},data:{purged_at:new Date(Date.now()-(3*365+1)*86400000)}});await purgeWithdrawnMembers(db);
 assert.equal(await db.supportTicket.count({where:{member_id:id}}),0,'then deleted');
});
