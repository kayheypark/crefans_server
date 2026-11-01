import {AsyncLocalStorage} from 'node:async_hooks';

export interface PlatformRequestContext {ip:string;peerIp:string;requestId:string;actorId?:string;actorRole?:string;jobId?:string;}
export const requestContext=new AsyncLocalStorage<PlatformRequestContext>();

declare global {
 namespace Express {
  interface Request {requestContext?:PlatformRequestContext;}
 }
}
