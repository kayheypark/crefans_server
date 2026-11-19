import {randomInt,randomUUID} from 'crypto';
import {reject} from './http';
import {appendAudit} from './audit';
export const AI_HEART_DAILY_CAP=100;
export const heartConversion=(hearts:number)=>hearts>=100?{hearts:hearts%10,credits:Math.floor(hearts/10)}:{hearts,credits:0};
export const heartBalance=async(db:any,user:string)=>await db.aiHeartWallet.findUnique({where:{user_id:user}})||{hearts:0,credits:0};
// 2026-11-17: member row, not creators — non-creator members also use AI photo (see ai-photo-grants).
const lock=async(tx:any,user:string)=>{await tx.$queryRaw`SELECT id FROM members WHERE id=${user} FOR UPDATE`;};
export async function createHeartGame(db:any,user:string){const unfinished=await db.aiHeartGame.findMany({where:{user_id:user,OR:[{status:'ended'},{status:{in:['ready','active']},created_at:{lt:new Date(Date.now()-600000)}}]},take:100});for(const game of unfinished)await settleHeartGame(db,user,game.id);return db.$transaction(async(tx:any)=>{await lock(tx,user);const active=await tx.aiHeartGame.findFirst({where:{user_id:user,status:{in:['ready','active']},created_at:{gt:new Date(Date.now()-600000)}}});if(active)reject(409,'GAME_ACTIVE','이미 진행 중인 하트 게임이 있어요.');const kinds=['heart','candy','heart','moon','heart',...Array.from({length:460},()=>{const r=randomInt(100);return r<70?'heart':r<85?'candy':'moon';})];const g=await tx.aiHeartGame.create({data:{id:randomUUID(),user_id:user,kinds,clicks:[]}});return{id:g.id,kinds};});}
export async function startHeartGame(db:any,user:string,id:unknown){if(id===undefined)return;if(typeof id!=='string')reject(400,'INVALID_GAME','하트 게임을 다시 시작해 주세요.');const r=await db.aiHeartGame.updateMany({where:{id,user_id:user,status:'ready',created_at:{gt:new Date(Date.now()-60000)}},data:{status:'active',started_at:new Date()}});if(r.count!==1)reject(409,'INVALID_GAME','하트 게임을 다시 시작해 주세요.');}
export async function closeHeartGame(db:any,user:string,id:unknown){if(typeof id!=='string')return;await db.aiHeartGame.updateMany({where:{id,user_id:user,status:{in:['ready','active']}},data:{status:'ended',ended_at:new Date()}});}
export async function clickHeart(db:any,user:string,id:string,piece:unknown,eventId:unknown){
 if(!Number.isInteger(piece)||Number(piece)<0||Number(piece)>465||typeof eventId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(eventId))reject(400,'INVALID_CLICK','잘못된 게임 입력이에요.');
 return db.$transaction(async(tx:any)=>{await lock(tx,user);const g=await tx.aiHeartGame.findFirst({where:{id,user_id:user}});if(!g)reject(404,'GAME_NOT_FOUND','하트 게임을 찾지 못했어요.');const clicks=g.clicks as any[];if(clicks.some(c=>c.event===eventId))return{score:g.score};
 if(g.status!=='active'||!g.started_at||Date.now()-g.started_at.getTime()>300000||g.score>=30)return{score:g.score};
 const n=Number(piece),age=Date.now()-g.started_at.getTime(),born=n<=5?0:(n-5)*650;
 if(n&& (age<born||age>born+8000||clicks.some(c=>c.piece===n)))reject(409,'INVALID_CLICK','이미 지나갔거나 선택한 항목이에요.');
 const delta=n&&(g.kinds as string[])[n-1]==='heart'?1:-1,score=Math.max(0,Math.min(30,g.score+delta));
 // Store only bounded game events, never a client-reported score.
 if(clicks.length>=1000)reject(429,'GAME_LIMIT','게임 입력이 너무 많아요.');
 await tx.aiHeartGame.update({where:{id},data:{score,clicks:[...clicks,{event:eventId,piece:n}]}});return{score};
 });
}
export async function settleHeartGame(db:any,user:string,id:string){return db.$transaction(async(tx:any)=>{await lock(tx,user);const g=await tx.aiHeartGame.findFirst({where:{id,user_id:user}});if(!g)reject(404,'GAME_NOT_FOUND','하트 게임을 찾지 못했어요.');if(g.status==='active'&&g.started_at&&Date.now()-g.started_at.getTime()>600000)await tx.aiHeartGame.update({where:{id},data:{status:'ended'}});else if(!['ready','ended','settled'].includes(g.status))reject(409,'GAME_RUNNING','사진 생성이 끝나면 하트가 적립돼요.');
 if(g.status==='settled')return{...await heartBalance(tx,user),earned:g.score,converted:g.converted};
 // 2026-11-15 user decision (night-work /ask-me): at most AI_HEART_DAILY_CAP hearts per member per KST day, so rewarded
 // generations cannot keep refilling themselves. A settled game's score is the hearts actually credited.
 const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10),used=(await tx.aiHeartGame.aggregate({_sum:{score:true},where:{user_id:user,status:'settled',created_at:{gte:new Date(`${day}T00:00:00+09:00`)}}}))._sum.score||0,earned=Math.max(0,Math.min(g.score,AI_HEART_DAILY_CAP-used));
 const before=await heartBalance(tx,user),next=heartConversion(before.hearts+earned);await tx.aiHeartWallet.upsert({where:{user_id:user},create:{user_id:user,hearts:next.hearts,credits:next.credits},update:{hearts:next.hearts,credits:{increment:next.credits}}});await tx.aiHeartGame.update({where:{id},data:{status:'settled',score:earned,converted:next.credits}});await appendAudit(tx,{category:'business',action:'ai-photo.hearts_settled',entityId:user,data:{targetId:id,count:earned,played:g.score,dailyCap:AI_HEART_DAILY_CAP,after:{hearts:next.hearts,credits:next.credits}}});return{...await heartBalance(tx,user),earned,capped:earned<g.score,converted:next.credits};});}
export async function reserveHeartUnits(tx:any,user:string,id:string,needed:number){
 const wallet=await heartBalance(tx,user),units=Math.min(wallet.credits,needed);
 if(!units)return null;
 await tx.aiHeartWallet.update({where:{user_id:user},data:{credits:{decrement:units}}});
 return tx.aiHeartUse.create({data:{id,user_id:user,units}});
}
export async function reserveHeartCredit(db:any,user:string,id:string){
 return db.$transaction(async(tx:any)=>{await lock(tx,user);return reserveHeartUnits(tx,user,id,1);});
}
export async function finishHeartUnits(tx:any,id:string,success:boolean){
 const use=await tx.aiHeartUse.findUnique({where:{id}});
 if(!use)return;
 const changed=await tx.aiHeartUse.updateMany({where:{id,status:'reserved'},data:{status:success?'consumed':'released'}});
 if(changed.count&&!success)await tx.aiHeartWallet.update({where:{user_id:use.user_id},data:{credits:{increment:use.units}}});
}
export async function finishHeartCredit(db:any,id:string,success:boolean){
 const use=await db.aiHeartUse.findUnique({where:{id}});if(!use)return;
 await db.$transaction(async(tx:any)=>{await lock(tx,use.user_id);await finishHeartUnits(tx,id,success);});
}
