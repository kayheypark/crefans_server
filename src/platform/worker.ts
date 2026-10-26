import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {PlatformModule} from './module';
import {PlatformOperationsService} from './operations.service';
import {PlatformJobsService} from './jobs.service';
async function run(){
 const app=await NestFactory.createApplicationContext(PlatformModule,{logger:['error','warn']}),jobs=app.get(PlatformJobsService),operations=app.get(PlatformOperationsService);operations.installFatalHandlers();let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{await jobs.tick();}catch(error){await operations.error('worker.error',error,{job:'worker-tick'});}finally{busy=false;}};
 await tick();const timer=setInterval(()=>void tick(),60000);
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await app.close();process.exit(0);});
}
run().catch(()=>{console.error('Platform worker startup failed.');process.exit(1);});
