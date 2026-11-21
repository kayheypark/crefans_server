import {createHash} from 'node:crypto';

// 2026-11-21 user request: server-side X Conversion API for pixel rjls2. Called only from server code where the conversion
// is confirmed. No token (X_PIXEL_TOKEN) or no identifier → nothing is sent. Failures never break the caller.
export const X_PIXEL_ID='rjls2';
const ENDPOINT=`https://ads-api.x.com/12/measurement/conversions/${X_PIXEL_ID}`;

export type XConversionInput={eventId:string;conversionId?:string;eventSourceUrl?:string;time?:Date;twclid?:string;email?:string;phone?:string;ipAddress?:string;userAgent?:string};

const sha256=(v:string)=>createHash('sha256').update(v).digest('hex');
/** Trimmed, lowercased email → SHA-256 hex. */
export function hashEmail(email:string){const v=email.trim().toLowerCase();return v?sha256(v):undefined;}
/** Phone → E.164 (Korean 010… becomes +8210…) → SHA-256 hex. */
export function hashPhone(phone:string){
 const raw=phone.trim(),digits=raw.replace(/\D/g,'');if(!digits)return undefined;
 const e164=raw.startsWith('+')?'+'+digits:digits.startsWith('0')?'+82'+digits.slice(1):'+'+digits;
 return sha256(e164);
}

export function xConversionBody(input:XConversionInput){
 const id:Record<string,string>={};
 if(input.twclid)id.twclid=input.twclid;
 const he=input.email&&hashEmail(input.email);if(he)id.hashed_email=he;
 const hp=input.phone&&hashPhone(input.phone);if(hp)id.hashed_phone_number=hp;
 if(input.ipAddress&&input.userAgent){id.ip_address=input.ipAddress;id.user_agent=input.userAgent;}
 if(!Object.keys(id).length)return null;
 return {conversions:[{conversion_time:(input.time||new Date()).toISOString(),event_id:input.eventId,
  ...(input.eventSourceUrl?{event_source_url:input.eventSourceUrl}:{}),...(input.conversionId?{conversion_id:input.conversionId}:{}),identifiers:[id]}]};
}

/** Sends one conversion; returns the HTTP status, or null when skipped or failed. */
export async function sendXConversion(input:XConversionInput,token=process.env.X_PIXEL_TOKEN,fetcher:typeof fetch=fetch):Promise<number|null>{
 const body=xConversionBody(input);if(!token||!body)return null;
 try{
  const res=await fetcher(ENDPOINT,{method:'POST',headers:{'X-Pixel-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  if(!res.ok)console.error(JSON.stringify({event:'x_conversion.failed',status:res.status,eventId:input.eventId}));
  return res.status;
 }catch{console.error(JSON.stringify({event:'x_conversion.failed',eventId:input.eventId}));return null;}
}
