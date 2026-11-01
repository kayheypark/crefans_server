// User-approved bean policies, 2026-10-25. Amounts are before the withdrawal fee.
export const beanPolicy=Object.freeze({
 krwPerBean:100,
 chargeKrwPerBean:110, // VAT-inclusive purchase price; cash-out value remains 100 KRW.
 withdrawalFeeBps:2000,
 minimumWithdrawalKrw:100000,
 minimumWithdrawalBeans:1000,
 consumptionOrder:['promotion','purchased'] as const,
 tipHoldDays:7,
 // 2026-10-30 (D6): unused purchased beans refund in full within refundFullDays of payment, minus refundDeductionBps after;
 // purchased and promotion beans expire validityYears after payment/grant with a notice expiryNoticeDays ahead.
 refundFullDays:7,
 refundDeductionBps:1000,
 validityYears:5,
 expiryNoticeDays:30, // 2026-10-30: beans a creator receives (paid or promotion) become withdrawable 7 days after the tip.
 withdrawableBucket:'earned-paid' as const, // Legacy primary bucket, retained for v1 clients.
 withdrawableBuckets:['earned-paid','earned-promotion'] as const,
 earnedPromotionCashWithdrawal:true,
 promotionCashWithdrawal:false,
 purchasedCashWithdrawal:false,
});
