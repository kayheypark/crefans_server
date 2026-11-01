import * as parser from 'cookie-parser';
import {fail} from './http';
export const cookieParser=parser;

export const originList=(value:string|undefined,fallback:string)=>(value||fallback).split(',').map(v=>v.trim()).filter(Boolean);
// State-changing requests must come from an allowed page. Console routes accept only the console origin
// once ADMIN_ORIGINS is set, and fan routes never accept it; any session cookie or console route needs an Origin.
export function originGuard(origins:string[],adminOrigins:string[]){
 const consoleOrigins=adminOrigins.length?adminOrigins:origins,fanOrigins=origins.filter(o=>!adminOrigins.includes(o));
 return (req:any,res:any,next:any)=>{
  if(req.path==='/api/v1/identity/callback'||req.path==='/api/v1/marketing/unsubscribe'||['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const origin=req.get('Origin'),consoleRoute=req.path==='/api/v1/admin'||req.path.startsWith('/api/v1/admin/');
  if(origin&&!(consoleRoute?consoleOrigins:fanOrigins).includes(origin))return res.status(403).json(fail('허용되지 않은 요청입니다.','INVALID_ORIGIN'));
  if(!origin&&(consoleRoute||req.cookies?.access_token||req.cookies?.refresh_token||req.cookies?.admin_access_token||req.cookies?.admin_refresh_token))return res.status(403).json(fail('요청 출처가 필요합니다.','ORIGIN_REQUIRED'));
  next();
 };
}
