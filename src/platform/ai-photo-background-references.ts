import {readFile} from 'fs/promises';
import {join} from 'path';
import {reject} from './http';
const IDS=new Set(['b7a101','b7a102','b7a103','b7a104','b7a105','b7a106','b7a107','c8b201','c8b202','c8b203','c8b204','c8b205','c8b206','c8b207','c8b208','c8b209','d9c301','d9c302','d9c303','d9c304','d9c305','d9c306','ead401','ead402','ead403','ead404','ead405','ead406','ead407','ead408','ead409','ead410','ead411','ead412','ead413','ead414','ead415','ead416','fb5001','fb5002','fb5003','fb5004','fb5005','fb5006','fb5007','fb5008','fb5009','fb5010','fb5011','fb5012','fb5013','fb5014','fb5015','fb5016','fb5017','fb5018','fb5019','fb5020','fb5021','fb5022','fb5023','fb5024','fb5025','fb5026','fb5027','fb5028','fb5029','fb5030','fb5031','fb5032','fb5033','fb5034','fb5035','fb5036','fb5037','fb5038','fb5039','fb5040','fb5041','fb5042','fb5043','fb5044','fb5045','fb5046','fb5047','fb5048','fb5049','fb5050','fb5051','fb5052','fb5053','fb5054','fb5055','fb5056','fb5057','fb5058','fb5059','fb5060','fb5061','fb5062','fb5063','fb5064','fb5065','fb5066','fb5067','fb5068','fb5069','fb5070','fb5071','fb5072','fb5073','fb5074','fb5075','fb5076','fb5077','fb5078','fb5079','fb5080','fb5081','fb5082','fb5083','fb5084','fb5085','fb5086','fb5087','fb5088','fb5089','fb5090','fb5091','fb5092','fb5093','fb5094']);
export function backgroundReferenceId(value:unknown,kinds:string[]):string|undefined{
 if(value===undefined)return;
 if(typeof value!=='string'||!IDS.has(value)||!kinds.includes('background'))reject(400,'INVALID_BACKGROUND_REFERENCE','배경을 다시 선택해 주세요.');
 return value as string;
}
export async function readBackgroundReference(id:string):Promise<Buffer>{
 backgroundReferenceId(id,['background']);
 try{return await readFile(join(__dirname,'ai-photo-backgrounds',id+'.webp'));}
 catch{reject(503,'BACKGROUND_REFERENCE_UNAVAILABLE','배경 사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');}
}
