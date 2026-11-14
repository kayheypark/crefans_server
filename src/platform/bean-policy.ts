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
 // 2026-11-14: KG이니시스 카드사 등록불가 기준(KB 사이버머니 1회 10만원·1일 20만원 초과, 현대 충전 10만원 초과)에 맞춰
 // 단건 충전 상한을 900콩 x 110원 = 99,000원으로 낮춘다(이전 2026-11-06 토스 신고값 10,000콩·1,100,000원). 유효기간 1년.
 maxChargeQuantity:900,
 // 충전 누적 한도(VAT 포함 결제 금액, 원). null 이면 검사하지 않는다. 바꿀 때는 약관·충전 화면·가이드 문구를 같은 값으로 함께 고친다.
 // 2026-11-14 사용자 결정: 하루 200,000원(KB 사이버머니 1일 20만원 초과 등록불가 기준 이하). 월 한도는 쓰지 않는다.
 dailyChargeLimitKrw:200000 as number|null,
 monthlyChargeLimitKrw:null as number|null,
 validityYears:1,
 expiryNoticeDays:30, // 2026-10-30: beans a creator receives (paid or promotion) become withdrawable 7 days after the tip.
 withdrawableBucket:'earned-paid' as const, // Legacy primary bucket, retained for v1 clients.
 withdrawableBuckets:['earned-paid','earned-promotion'] as const,
 earnedPromotionCashWithdrawal:true,
 promotionCashWithdrawal:false,
 purchasedCashWithdrawal:false,
});
