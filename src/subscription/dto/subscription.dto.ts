import { IsString, IsNotEmpty } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class SubscribeMembershipDto {
  @IsString()
  @IsNotEmpty()
  membershipItemId: string;
}

export class ConfirmSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  authKey: string;

  @IsString()
  @IsNotEmpty()
  customerKey: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  membershipItemId: string;
}

export class SubscriptionResponse {
  success: boolean;
  data: {
    subscriptionId?: string;
    membershipItemId?: string;
    membershipName?: string;
    price?: number;
    billingPeriod?: number;
    billingUnit?: string;
    customerKey?: string;
    clientKey?: string;
    successUrl?: string;
    failUrl?: string;
    nextBillingDate?: string;
    status?: SubscriptionStatus;
  };
}

export class MySubscriptionItem {
  id: string;
  membershipName: string;
  creatorId: string;
  creator: {
    id: string;
    handle: string;
    name: string;
    avatar?: string;
  };
  amount: number;
  status: SubscriptionStatus;
  nextBillingDate?: string;
  autoRenew: boolean;
  startedAt: string;
  endedAt?: string;
  isActive: boolean;
}

export class MySubscriptionsResponse {
  success: boolean;
  data: MySubscriptionItem[];
}