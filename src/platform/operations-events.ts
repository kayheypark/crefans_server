import {auditOperation} from './audit';
import {Prisma,PlatformOperationalEvent} from '@prisma/client';
import {requestContext} from './request-context';

const metadataKeys=['targetId','memberId','creatorId','subscriptionId','postId','orderId','planId','status','previousStatus'] as const;

// Call inside the business transaction; delivery belongs to the operations worker.
export async function enqueueOperation(tx:Prisma.TransactionClient,type:string,data:Record<string,unknown>,dedupeKey?:string,auditData:Record<string,unknown>={}):Promise<PlatformOperationalEvent>{
 if(typeof type!=='string'||!/^[a-z][a-z0-9_.-]{0,63}$/.test(type))throw new Error('Invalid operation type');
 const metadata:Record<string,string>={};
 for(const key of metadataKeys){const value=data[key];if(typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,191}$/.test(value))metadata[key]=value;}
 const context=requestContext.getStore();
 const event={type,data:metadata,ip:context?.ip||null,peer_ip:context?.peerIp||null,request_id:context?.requestId||null,dedupe_key:dedupeKey||null};
 if(!dedupeKey){const saved=await tx.platformOperationalEvent.create({data:event});await auditOperation(tx,saved,auditData);return saved;}
 try{const saved=await tx.platformOperationalEvent.upsert({where:{dedupe_key:dedupeKey},create:event,update:{}});await auditOperation(tx,saved,auditData);return saved;}
 catch(error){
  if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')throw error;
  // MySQL upsert can race; a locking read sees the winner beyond an earlier snapshot.
  const rows=await tx.$queryRaw<PlatformOperationalEvent[]>`SELECT * FROM platform_operational_events WHERE dedupe_key=${dedupeKey} FOR UPDATE`;
  if(!rows.length)throw error;await auditOperation(tx,rows[0],auditData);return rows[0];
 }
}
