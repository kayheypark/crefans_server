import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reject} from './http';
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private members:LocalMemberService){}
  async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest();const token=req.cookies?.access_token;
    if(!token)reject(401,'UNAUTHORIZED','로그인이 필요합니다.');try{req.user=await this.members.validateToken(token);}catch{reject(401,'UNAUTHORIZED','세션을 갱신해주세요.');}return true;}
}
@Injectable()
export class PlatformOptionalAuthGuard implements CanActivate {
  constructor(private members:LocalMemberService){}
  async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest();req.user=null;if(req.cookies?.access_token){try{req.user=await this.members.validateToken(req.cookies.access_token);}catch{if(req.cookies?.refresh_token)reject(401,'SESSION_EXPIRED','세션을 갱신해주세요.');}}else if(req.cookies?.refresh_token)reject(401,'SESSION_EXPIRED','세션을 갱신해주세요.');return true;}
}
