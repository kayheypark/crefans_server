import { ArgumentsHost, CallHandler, Catch, ExceptionFilter, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
export const ok = <T>(data:T) => ({success:true,data,errorMessage:null,errorCode:null});
export const fail = (message:string,code:string) => ({success:false,data:null,errorMessage:message,errorCode:code});
export function reject(status:number,code:string,message:string):never {throw new HttpException({code,message},status);}
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context:ExecutionContext,next:CallHandler){return next.handle().pipe(map(data=>ok(data??{})));}
}
@Catch()
export class PlatformExceptionFilter implements ExceptionFilter {
  catch(error:any,host:ArgumentsHost){
    const status=error instanceof HttpException?error.getStatus():error?.code==='P2002'?409:error?.code==='P2025'?404:Number.isInteger(error?.status)&&error.status>=400&&error.status<500?error.status:500;
    const payload:any=error instanceof HttpException?error.getResponse():{};
    const message=status===500?'서버 내부 오류가 발생했습니다.':typeof payload==='string'?payload:Array.isArray(payload.message)?payload.message.join(' '):payload.message||'요청을 처리하지 못했습니다.';
    host.switchToHttp().getResponse().status(status).json(fail(message,payload.code||({400:'INVALID_INPUT',401:'UNAUTHORIZED',403:'FORBIDDEN',404:'NOT_FOUND',409:'CONFLICT',413:'FILE_TOO_LARGE',429:'RATE_LIMITED',503:'PROVIDER_NOT_CONFIGURED'}[status]||'INTERNAL_ERROR')));
  }
}
export function text(value:unknown,max=2000,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))reject(400,'INVALID_INPUT','입력값을 확인해주세요.');return value.trim();}
export const dateOnly=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
