import {HttpException} from '@nestjs/common';

export function reject(status:number,code:string,message:string):never {throw new HttpException({code,message},status);}
