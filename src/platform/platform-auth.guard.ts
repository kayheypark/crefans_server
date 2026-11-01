import {actorContext} from './audit';
import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import {LocalMemberService} from '../auth/local/local-member.service';
import {reject} from './http';
import {ConfigService} from '@nestjs/config';
import {verifyEdgeRequest} from './media-edge-protocol';
@Injectable()
export class PlatformMediaEdgeGuard implements CanActivate {
 constructor(private config:ConfigService){}
 canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest(),envelope=verifyEdgeRequest(req,this.config.get('MEDIA_EDGE_SECRET')||'');if(envelope?.purpose!=='media'||!['GET','HEAD'].includes(envelope.mediaMethod))reject(403,'EDGE_AUTH_REQUIRED','허용되지 않은 요청입니다.');return true;}
}
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private members:LocalMemberService){}
  async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest();const token=req.cookies?.access_token;
    if(!token)reject(401,'UNAUTHORIZED','로그인이 필요합니다.');try{req.user=await this.members.validateToken(token);}catch{reject(401,'UNAUTHORIZED','세션을 갱신해주세요.');}actorContext(req.user);return true;}
}
@Injectable()
export class PlatformOptionalAuthGuard implements CanActivate {
  constructor(private members:LocalMemberService){}
  async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest();req.user=null;if(req.cookies?.access_token){try{req.user=await this.members.validateToken(req.cookies.access_token);}catch{if(req.cookies?.refresh_token)reject(401,'SESSION_EXPIRED','세션을 갱신해주세요.');}}else if(req.cookies?.refresh_token)reject(401,'SESSION_EXPIRED','세션을 갱신해주세요.');actorContext(req.user);return true;}
}
