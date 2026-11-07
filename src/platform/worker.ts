import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {PlatformModule} from './module';
import {PlatformOperationsService} from './operations.service';
import {PlatformJobsService} from './jobs.service';
import {PlatformMediaStorage} from './media-storage';
import {cleanMediaTemp,watermarkNextMedia} from './media-watermark';
import {transcodeNextVideo} from './video-transcode';
import {releaseHeldNotices} from './post-notices';
import {ConfigService} from '@nestjs/config';
import {checkDisk} from './disk-alert';
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
 const convert=async()=>{if(converting)return;converting=true;try{while(await transcodeNextVideo(db,storage)>0);while(await watermarkNextMedia(db,storage)>0);await releaseHeldNotices(db);}catch(error){await operations.error('worker.error',error,{job:'media-conversion'});}finally{converting=false;}};
 await cleanMediaTemp().catch(error=>operations.error('worker.error',error,{job:'media-temp-cleanup'}));
 void convert();const converter=setInterval(()=>void convert(),15000);
 // Host root disk usage (2026-11-07): no other check watches the 50GB EBS volume.
 const config=app.get(ConfigService),diskMs=Math.max(1,Number(process.env.DISK_ALERT_INTERVAL_MINUTES)||10)*60000;
 const disk=async()=>{try{await checkDisk(db,operations,config);}catch(error){await operations.error('worker.error',error,{job:'disk-alert'});}};
 void disk();const diskTimer=setInterval(()=>void disk(),diskMs);
 for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);clearInterval(converter);clearInterval(diskTimer);await app.close();process.exit(0);});
}
run().catch(()=>{console.error('Platform worker startup failed.');process.exit(1);});
