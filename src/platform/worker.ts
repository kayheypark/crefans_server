import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {PlatformModule} from './module';
import {PlatformOperationsService} from './operations.service';
import {PlatformJobsService} from './jobs.service';
import {PlatformMediaStorage} from './media-storage';
import {transcodeNextVideo} from './video-transcode';
async function run(){
 const app=await NestFactory.createApplicationContext(PlatformModule,{logger:['error','warn']}),jobs=app.get(PlatformJobsService),operations=app.get(PlatformOperationsService);operations.installFatalHandlers();let busy=false;
 let startedAt=0;const tick=async()=>{if(busy)return;busy=true;startedAt=Date.now();try{await jobs.tick();}catch(error){await operations.error('worker.error',error,{job:'worker-tick'});}finally{busy=false;}};
 // A tick that never returns (hung connection, provider call without timeout) stops all queues while the
 // process still looks alive. Exit so the container restart policy brings a fresh worker back.
 const stallMs=Number(process.env.WORKER_STALL_MINUTES||15)*60000;
 const guard=setInterval(()=>{if(busy&&Date.now()-startedAt>stallMs){console.error(JSON.stringify({event:'worker_stalled',minutes:Math.round((Date.now()-startedAt)/60000)}));void operations.record('worker.stalled',{job:'worker-tick',status:'restarting'}).finally(()=>process.exit(1));}},60000);guard.unref();
 await tick();const timer=setInterval(()=>void tick(),60000);
 // Video conversion runs in its own loop so a long ffmpeg job never delays billing and other ticks (2026-11-01).
 const storage=app.get(PlatformMediaStorage),db=(jobs as any).db;let converting=false;
 const convert=async()=>{if(converting)return;converting=true;try{while(await transcodeNextVideo(db,storage)>0);}catch(error){await operations.error('worker.error',error,{job:'video-transcode'});}finally{converting=false;}};
 void convert();const converter=setInterval(()=>void convert(),15000);
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);clearInterval(converter);await app.close();process.exit(0);});
}
run().catch(()=>{console.error('Platform worker startup failed.');process.exit(1);});
