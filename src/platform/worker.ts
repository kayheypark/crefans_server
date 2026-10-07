import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {PlatformModule} from './module';
import {PlatformJobsService} from './jobs.service';
async function run(){
 const app=await NestFactory.createApplicationContext(PlatformModule,{logger:['error','warn']}),jobs=app.get(PlatformJobsService);let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{await jobs.tick();}catch{console.error('Platform worker task failed; inspect job and order states.');}finally{busy=false;}};
 await tick();const timer=setInterval(()=>void tick(),60000);
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await app.close();process.exit(0);});
}
run().catch(()=>{console.error('Platform worker startup failed.');process.exit(1);});
