// User-approved bean policies, 2026-10-25. Amounts are before the withdrawal fee.
export const beanPolicy=Object.freeze({
 krwPerBean:100,
 chargeKrwPerBean:110, // VAT-inclusive purchase price; cash-out value remains 100 KRW.
 withdrawalFeeBps:2000,
 minimumWithdrawalKrw:100000,
 minimumWithdrawalBeans:1000,
 consumptionOrder:['promotion','purchased'] as const,
 withdrawableBucket:'earned-paid' as const, // Legacy primary bucket, retained for v1 clients.
 withdrawableBuckets:['earned-paid','earned-promotion'] as const,
 earnedPromotionCashWithdrawal:true,
 promotionCashWithdrawal:false,
 purchasedCashWithdrawal:false,
});
