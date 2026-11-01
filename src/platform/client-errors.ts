import {randomUUID} from 'node:crypto';
import {observeAudit,safeAuditData,contentDigest} from './audit';
import {requestContext} from './request-context';
import {reject} from './http';
export async function reportClientError(db:any,limiter:any,input:any,surface:'service'|'console'){
 if(!input||!['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','EvalError','BrowserError'].includes(input.errorType)||!Array.isArray(input.frames)||input.frames.length>12||JSON.stringify(input).length>6000)reject(400,'INVALID_CLIENT_REPORT','오류 보고 형식을 확인해주세요.');
 const context=requestContext.getStore();await limiter.limit('client-errors:'+contentDigest(context?.ip||'unknown'),10,60);
 const data=safeAuditData({errorType:input.errorType,frames:input.frames,surface,clientRequestId:typeof input.requestId==='string'&&/^[a-f0-9-]{36}$/.test(input.requestId)?input.requestId:undefined,outcome:'client_reported'});
 const id=randomUUID();await observeAudit(db,{category:'client',action:'browser.error',level:'error',entityId:id,data:{...data,fingerprint:contentDigest([data.errorType,data.frames,surface])}});return{reportId:id};
}
