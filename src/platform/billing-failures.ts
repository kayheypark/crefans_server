// Toss billing approval codes, verified 2026-10-22. Only confirmed card declines
// disable a method. Timeouts, 5xx and duplicate/processing responses remain uncertain.
export const unusableCardCodes = new Set([
 'INVALID_CARD_LOST_OR_STOLEN','INVALID_STOPPED_CARD','INVALID_CARD_EXPIRATION',
 'INVALID_CARD_NUMBER','INVALID_BILL_KEY_REQUEST','INVALID_REJECT_CARD',
 'NOT_SUPPORTED_CARD_TYPE','NOT_REGISTERED_CARD_COMPANY',
]);
export const paymentFailureCodes = new Set(['PAYMENT_FAILED','PAYMENT_METHOD_UNAVAILABLE','PAYMENT_METHOD_REQUIRED']);
export function renewalDeadline(sub:any,retries:number,hours:number){
 const start=new Date(sub.next_billing_date),end=new Date(start);
 end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);
 end.setUTCDate(Math.min(new Date(sub.started_at).getUTCDate(),new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));
 // Bound recovery by the existing retry schedule and never collect a missed old cycle.
 return new Date(Math.min(start.getTime()+(retries+1)*hours*3600000,end.getTime()));
}
export const billingMethodView=(m:any)=>({id:m.id,label:m.label,description:m.masked_number||`•••• ${m.last_four}`,isDefault:m.is_default,requiresUpdate:!!m.unavailable_at});
