import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {cookieParser} from './middleware';
import {PlatformModule} from './module';
import {EnvelopeInterceptor,PlatformExceptionFilter,fail} from './http';
async function bootstrap(){
 const app=await NestFactory.create(PlatformModule,{logger:['error','warn','log'],bodyParser:true,rawBody:true});
 app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req:any,res:any,next:any)=>{if(req.path.startsWith('/api/v1/')){res.setHeader('Cache-Control','private, no-store');res.vary('Cookie');}next();});app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter());
 const origins=(process.env.FRONTEND_ORIGINS||'http://127.0.0.1:3010,http://localhost:3010').split(',');
 app.enableCors({origin:origins,credentials:true});
 app.use((req:any,res:any,next:any)=>{if(req.path==='/api/v1/identity/callback'||['GET','HEAD','OPTIONS'].includes(req.method))return next();const origin=req.get('Origin');if(origin&&!origins.includes(origin))return res.status(403).json(fail('허용되지 않은 요청입니다.','INVALID_ORIGIN'));if((req.cookies?.access_token||req.cookies?.refresh_token)&&!origin)return res.status(403).json(fail('요청 출처가 필요합니다.','ORIGIN_REQUIRED'));next();});
 await app.listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1');
}
bootstrap().catch(()=>{console.error('Platform startup failed. Check database and runtime configuration.');process.exit(1);});
