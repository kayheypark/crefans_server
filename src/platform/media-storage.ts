import {Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {S3Client,PutObjectCommand,DeleteObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {createReadStream} from 'fs';
import {reject} from './http';

export const managedMediaKey=(key:string)=>/^platform\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key);

/** New media only. Legacy S3 objects and local files retain their existing read path. */
@Injectable()
export class PlatformMediaStorage implements OnModuleInit,OnModuleDestroy {
 private client?:S3Client;
 constructor(private config:ConfigService){}
 get enabled(){return this.config.get('MEDIA_STORAGE')==='s3';}
 onModuleInit(){
  if(!['local','s3'].includes(this.config.get('MEDIA_STORAGE')||'local'))throw new Error('Invalid media storage mode');
  if(this.enabled)this.validate();
 }
 onModuleDestroy(){this.client?.destroy();}
 private validate(){
  if(!this.config.get('S3_MEDIA_BUCKET')||!this.config.get('AWS_REGION'))throw new Error('Private media storage configuration is incomplete');
 }
 private s3(){return this.client||(this.client=new S3Client({region:this.config.get<string>('AWS_REGION'),requestChecksumCalculation:'WHEN_REQUIRED'}));}
 async put(id:string,path:string,mime:string,size:number){
  const key=`platform/${id}`;if(!this.enabled||!managedMediaKey(key))reject(503,'STORAGE_NOT_CONFIGURED','미디어 저장소 설정을 확인해주세요.');
  this.validate();const body=createReadStream(path);
  // Private bucket only; edge authorization precedes shared caching and viewer response is no-store.
  try{await this.s3().send(new PutObjectCommand({Bucket:this.config.get('S3_MEDIA_BUCKET'),Key:key,Body:body,ContentLength:size,ContentType:mime,ContentDisposition:'inline',CacheControl:'max-age=0, s-maxage=86400',ServerSideEncryption:'AES256'}));}
  catch{reject(503,'STORAGE_UNAVAILABLE','미디어를 저장하지 못했습니다. 다시 시도해주세요.');}
  finally{body.destroy();}
 }
 async remove(key:string){
  if(!this.enabled||!managedMediaKey(key))reject(503,'STORAGE_NOT_CONFIGURED','미디어 저장소 설정을 확인해주세요.');
  await this.s3().send(new DeleteObjectCommand({Bucket:this.config.get('S3_MEDIA_BUCKET'),Key:key}));
 }
 async read(key:string,options:{head?:boolean;range?:string;signal?:AbortSignal}={}){
  if(!this.enabled||!managedMediaKey(key))reject(503,'STORAGE_NOT_CONFIGURED','미디어 저장소 설정을 확인해주세요.');
  this.validate();const input={Bucket:this.config.get<string>('S3_MEDIA_BUCKET'),Key:key};
  if(options.head)return {...await this.s3().send(new HeadObjectCommand(input),{abortSignal:options.signal}),Body:undefined};
  return this.s3().send(new GetObjectCommand({...input,...(options.range?{Range:options.range}:{})}),{abortSignal:options.signal});
 }
}
