import {Injectable,Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaService} from '../prisma/prisma.service';
import {PlatformMediaStorage} from './media-storage';
import {appendAudit,auditChange,contentDigest} from './audit';
import {categoryAsset,categoryOrder,categoryView} from './category-catalog';
import {reject,text} from './http';
import {randomUUID} from 'crypto';
import {mkdir,writeFile,unlink} from 'fs/promises';
import {join,resolve} from 'path';
import {pipeline} from 'stream/promises';
import {Readable} from 'stream';
const sharp:typeof import('sharp').default=require('sharp');

@Injectable()
export class CategoriesService{
 private readonly logger=new Logger(CategoriesService.name);
 constructor(private db:PrismaService,private config:ConfigService,private storage:PlatformMediaStorage){}
 list(){return this.db.creatorCategory.findMany({where:{is_deleted:false},orderBy:[...categoryOrder]}).then(rows=>rows.map(categoryView));}
 private async lock(tx:any,id:string){
  await tx.$queryRaw`SELECT id FROM creator_categories WHERE id=${id} FOR UPDATE`;
  const row=await tx.creatorCategory.findUnique({where:{id}});
  if(!row||row.is_deleted)reject(404,'CATEGORY_NOT_FOUND','활동 분야를 찾을 수 없습니다.');return row;
 }
 async update(id:string,body:any){
  const name=text(body?.name,40);if(typeof body.active!=='boolean')reject(400,'INVALID_INPUT','사용 여부를 확인해주세요.');
  try{return await this.db.$transaction(async tx=>{
   const before=await this.lock(tx,id),saved=await tx.creatorCategory.update({where:{id},data:{name,is_active:body.active}});
   await appendAudit(tx,{category:'admin',action:'admin.category_saved',entityId:id,data:auditChange({titleHash:contentDigest(before.name),is_active:before.is_active},{titleHash:contentDigest(name),is_active:saved.is_active})});return categoryView(saved);
  });}catch(e){if(e?.code==='P2002')reject(409,'CATEGORY_EXISTS','이미 등록된 분야 이름입니다.');throw e;}
 }
 async reorder(body:any){
  const {ids,expectedIds}=body||{};
  if(!Array.isArray(ids)||!Array.isArray(expectedIds)||ids.length>1000||ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length)reject(400,'INVALID_CATEGORY_ORDER','분야 순서를 확인해주세요.');
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM creator_categories ORDER BY id FOR UPDATE`;
   const rows=await tx.creatorCategory.findMany({where:{is_deleted:false},orderBy:[...categoryOrder]});
   if(JSON.stringify(rows.map(r=>r.id))!==JSON.stringify(expectedIds))reject(409,'CATEGORY_ORDER_CHANGED','다른 운영자가 목록을 변경했습니다. 새로고침 후 다시 정렬해주세요.');
   if(ids.length!==rows.length||rows.some(r=>!ids.includes(r.id)))reject(400,'INVALID_CATEGORY_ORDER','모든 분야를 한 번씩 포함해야 합니다.');
   for(let i=0;i<ids.length;i++){
    const before=rows.find(r=>r.id===ids[i])!;if(before.sort_order===i)continue;
    await tx.creatorCategory.update({where:{id:ids[i]},data:{sort_order:i}});
    await appendAudit(tx,{category:'admin',action:'admin.category_reordered',entityId:ids[i],data:auditChange({sort_order:before.sort_order},{sort_order:i})});
   }
  });return this.list();
 }
 private root(){return join(resolve(this.config.get('MEDIA_ROOT')||'.local/media'),'category-icons');}
 private async remove(value:string|null){
  const asset=categoryAsset(value);if(!asset)return;
  try{if(asset[1]==='s3')await this.storage.remove(`platform/${asset[2]}`);else await unlink(join(this.root(),asset[2]));}
  catch(e){if(e?.code!=='ENOENT')this.logger.error('Category icon cleanup requires retry: '+asset[2]);}
 }
 async upload(id:string,file:any){
  if(!file||file.size>2*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.mimetype)||! /\.(png|jpe?g|webp)$/i.test(file.originalname||''))reject(400,'INVALID_CATEGORY_ICON','PNG·JPG·WebP 이미지(2MB 이하)를 선택해주세요.');
  const category=await this.db.creatorCategory.findFirst({where:{id,is_deleted:false}});if(!category)reject(404,'CATEGORY_NOT_FOUND','활동 분야를 찾을 수 없습니다.');
  let bytes:Buffer;
  try{const input=sharp(file.buffer,{limitInputPixels:16000000}),meta=await input.metadata();if(!['png','jpeg','webp'].includes(meta.format||'')||(meta.pages||1)>1)throw new Error('Unsupported image');bytes=await input.rotate().resize(128,128,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp().toBuffer();}
  catch{reject(400,'INVALID_CATEGORY_ICON','올바른 정지 이미지 파일을 선택해주세요.');}
  const key=randomUUID(),value=`${this.storage.enabled?'s3':'local'}:${key}`,path=join(this.root(),key);
  await mkdir(this.root(),{recursive:true});await writeFile(path,bytes,{mode:0o600});
  let before:string|null=null,saved:any,committed=false;
  try{
   if(this.storage.enabled)await this.storage.put(key,path,'image/webp',bytes.length);
   saved=await this.db.$transaction(async tx=>{const row=await this.lock(tx,id);before=row.icon;const saved=await tx.creatorCategory.update({where:{id},data:{icon:value}});await appendAudit(tx,{category:'admin',action:'admin.category_icon_changed',entityId:id,data:auditChange({contentHash:contentDigest(before)},{contentHash:contentDigest(value)})});return saved;});committed=true;
  }finally{if(!committed)await this.remove(value);if(this.storage.enabled)await unlink(path).catch(()=>{});}
  await this.remove(before);return categoryView(saved);
 }
 async resetIcon(id:string){
  let old:string|null=null;
  const saved=await this.db.$transaction(async tx=>{const row=await this.lock(tx,id);old=row.icon;const saved=await tx.creatorCategory.update({where:{id},data:{icon:null}});await appendAudit(tx,{category:'admin',action:'admin.category_icon_changed',entityId:id,data:auditChange({contentHash:contentDigest(old)},{contentHash:contentDigest(null)})});return saved;});
  await this.remove(old);return categoryView(saved);
 }
 async image(id:string,version:string,res:any){
  const row=await this.db.creatorCategory.findFirst({where:{id,is_deleted:false}}),asset=categoryAsset(row?.icon||null);
  if(!asset||asset[2]!==version)reject(404,'CATEGORY_ICON_NOT_FOUND','아이콘을 찾을 수 없습니다.');
  res.setHeader('Content-Type','image/webp');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=300');
  if(asset[1]==='local')return res.sendFile(join(this.root(),asset[2]));
  try{const object=await this.storage.read(`platform/${asset[2]}`);return await pipeline(object.Body as Readable,res);}
  catch{if(res.headersSent)return res.destroy();reject(503,'STORAGE_UNAVAILABLE','아이콘을 불러오지 못했습니다.');}
 }
}
