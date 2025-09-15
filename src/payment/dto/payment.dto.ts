import { IsString, IsNumber, IsOptional, IsEmail, IsUUID, IsEnum, IsObject, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentStatus } from '@prisma/client';

export class PreparePaymentDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @IsString()
  orderName: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;
}

export class ConfirmPaymentDto {
  @IsString()
  paymentKey: string;

  @IsString()
  orderId: string;

  @IsNumber()
  @Type(() => Number)
  amount: number;
}

export class PaymentWebhookDto {
  @IsString()
  eventType: string;

  @IsString()
  createdAt: string;

  @IsObject()
  data: any;
}

export class GetPaymentHistoryDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 10;

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;
}

export class PaymentTransactionResponse {
  id: string;
  orderId: string;
  paymentKey?: string;
  amount: number;
  tokenAmount: number;
  tokenType: {
    symbol: string;
    name: string;
    price: number;
  };
  status: PaymentStatus;
  method?: string;
  approvedAt?: string;
  cancelledAt?: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export class PreparePaymentResponse {
  success: boolean;
  data: {
    orderId: string;
    amount: number;
    tokenAmount: number;
    clientKey: string;
    customerName?: string;
  };
}

export class ConfirmPaymentResponse {
  success: boolean;
  data: PaymentTransactionResponse & {
    token?: {
      symbol: string;
      amount: number;
    };
  };
}

export class PaymentHistoryResponse {
  success: boolean;
  data: {
    transactions: PaymentTransactionResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export class PaymentWebhookResponse {
  success: boolean;
  message: string;
}