import { Handler, ScheduledEvent, Context } from 'aws-lambda';
import { PrismaClient, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import axios from 'axios';

const prisma = new PrismaClient();

interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  method: string;
  approvedAt?: string;
  requestedAt: string;
}

class TossPaymentsService {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.secretKey = process.env.TOSSPAYMENTS_SECRET_KEY!;
    this.baseUrl = process.env.TOSSPAYMENTS_API_URL || 'https://api.tosspayments.com';

    if (!this.secretKey) {
      throw new Error('TOSSPAYMENTS_SECRET_KEY is required');
    }
  }

  generateCustomerKey(userId: string): string {
    return `customer_${userId}`;
  }

  generateOrderId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `order_${userId}_${timestamp}_${random}`;
  }

  async requestBillingPayment(
    billingKey: string,
    customerKey: string,
    amount: number,
    orderId: string
  ): Promise<TossPaymentResponse> {
    const response = await axios.post(
      `${this.baseUrl}/v1/billing/${billingKey}`,
      {
        customerKey,
        amount,
        orderId,
        orderName: '멤버십 구독료',
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data;
  }
}

export const handler: Handler<ScheduledEvent, void> = async (
  event: ScheduledEvent,
  context: Context
): Promise<void> => {
  console.log('🚀 Starting subscription billing process', { event, context });

  const tossPayments = new TossPaymentsService();

  try {
    const now = new Date();

    // 오늘 결제할 구독들 조회
    const subscriptionsToBill = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ONGOING,
        auto_renew: true,
        next_billing_date: {
          lte: now,
        },
        billing_key: {
          not: null,
        },
      },
      include: {
        membership_item: true,
      },
    });

    console.log(`📋 Found ${subscriptionsToBill.length} subscriptions to process`);

    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (const subscription of subscriptionsToBill) {
      try {
        console.log(`💳 Processing subscription: ${subscription.id}`);

        const customerKey = tossPayments.generateCustomerKey(subscription.subscriber_id);
        const orderId = tossPayments.generateOrderId(subscription.subscriber_id);

        // 정기결제 실행
        const paymentResult = await tossPayments.requestBillingPayment(
          subscription.billing_key!,
          customerKey,
          Number(subscription.amount),
          orderId,
        );

        await prisma.$transaction(async (tx) => {
          // 구독 정보 업데이트
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              last_payment_date: new Date(),
              next_billing_date: calculateNextBillingDate(
                subscription.membership_item.billing_period,
                subscription.membership_item.billing_unit,
              ),
              payment_failure_count: 0,
            },
          });

          // 기본 토큰 타입 조회
          const defaultTokenType = await tx.tokenType.findFirst({
            where: { name: '콩' },
          });

          if (!defaultTokenType) {
            throw new Error('기본 토큰 타입을 찾을 수 없습니다.');
          }

          // 결제 거래 기록 생성
          await tx.paymentTransaction.create({
            data: {
              order_id: orderId,
              payment_key: paymentResult.paymentKey,
              user_id: subscription.subscriber_id,
              amount: subscription.amount,
              token_amount: new Decimal(0),
              token_type_id: defaultTokenType.id,
              subscription_id: subscription.id,
              billing_key: subscription.billing_key!,
              is_recurring: true,
              status: PaymentStatus.APPROVED,
              method: paymentResult.method,
              approved_at: new Date(),
              raw_response: paymentResult as any,
            },
          });
        });

        console.log(`✅ Billing payment successful: subscriptionId=${subscription.id}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Billing payment failed: subscriptionId=${subscription.id}`, error);
        failCount++;

        try {
          // 실패 횟수 증가
          const updatedSubscription = await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              payment_failure_count: { increment: 1 },
            },
          });

          // 3회 실패시 구독 종료
          if (updatedSubscription.payment_failure_count >= 3) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: SubscriptionStatus.CANCELLED,
                ended_at: new Date(),
                auto_renew: false,
              },
            });

            console.log(`⚠️ Subscription cancelled due to payment failures: subscriptionId=${subscription.id}`);
          }
        } catch (updateError) {
          console.error(`Failed to update subscription after payment failure: ${subscription.id}`, updateError);
        }
      }

      processedCount++;
    }

    console.log(`🎉 Billing process completed: processed=${processedCount}, success=${successCount}, failed=${failCount}`);

  } catch (error) {
    console.error('💥 Failed to process billing payments', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

function calculateNextBillingDate(period: number, unit: string): Date {
  const now = new Date();

  switch (unit) {
    case 'DAY':
      return new Date(now.getTime() + period * 24 * 60 * 60 * 1000);
    case 'MONTH':
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + period);
      return nextMonth;
    case 'YEAR':
      const nextYear = new Date(now);
      nextYear.setFullYear(nextYear.getFullYear() + period);
      return nextYear;
    default:
      // 기본값은 1개월
      const defaultNext = new Date(now);
      defaultNext.setMonth(defaultNext.getMonth() + 1);
      return defaultNext;
  }
}