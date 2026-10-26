import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {cookieParser} from './middleware';
import {PlatformOperationsService} from './operations.service';
import {PlatformSecurityService} from './security.service';
import {PlatformModule} from './module';
import {EnvelopeInterceptor,PlatformExceptionFilter,fail} from './http';
import {installPlatformOpenApi} from './openapi';
async function bootstrap(){
 const app=await NestFactory.create(PlatformModule,{logger:['error','warn','log'],bodyParser:true,rawBody:true});
 const operations=app.get(PlatformOperationsService),security=app.get(PlatformSecurityService);
 app.use((req,res,next)=>{void security.middleware(req,res,next).catch(error=>{void operations.error('http.error',error);res.status(503).json(fail('보안 검증을 완료하지 못했습니다.','SECURITY_UNAVAILABLE'));});});
 operations.installFatalHandlers();operations.startWatchdog();app.enableShutdownHooks();
 app.setGlobalPrefix('api/v1');app.use(cookieParser());app.use((req:any,res:any,next:any)=>{if(req.path.startsWith('/api/v1/')){res.setHeader('Cache-Control','private, no-store');res.vary('Cookie');}next();});app.useGlobalInterceptors(new EnvelopeInterceptor());app.useGlobalFilters(new PlatformExceptionFilter(operations));
 const origins=(process.env.FRONTEND_ORIGINS||'http://127.0.0.1:3010,http://localhost:3010,http://127.0.0.1:3002,http://localhost:3002').split(',');
 app.enableCors({origin:origins,credentials:true,exposedHeaders:['X-Request-ID']});
 app.use((req:any,res:any,next:any)=>{if(req.path==='/api/v1/identity/callback'||req.path==='/api/v1/marketing/unsubscribe'||['GET','HEAD','OPTIONS'].includes(req.method))return next();const origin=req.get('Origin');if(origin&&!origins.includes(origin))return res.status(403).json(fail('허용되지 않은 요청입니다.','INVALID_ORIGIN'));if((req.cookies?.access_token||req.cookies?.refresh_token)&&!origin)return res.status(403).json(fail('요청 출처가 필요합니다.','ORIGIN_REQUIRED'));next();});
 installPlatformOpenApi(app);
 await app.listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1');
}
bootstrap().catch(()=>{console.error('Platform startup failed. Check database and runtime configuration.');process.exit(1);});
