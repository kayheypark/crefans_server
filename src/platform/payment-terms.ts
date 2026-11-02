// 2026-11-02 user decision: the screen right before paying shows the payment conditions (product, VAT-inclusive price, billing cycle,
// how to cancel, withdrawal limits, terms link) behind a required check box (전자상거래법 제13조 거래조건 고지·제17조 청약철회 제한 표시).
// The front shows the same version and sends it with the payment request; the server keeps the agreement in member_consents.
export const PAYMENT_TERMS={version:'2026-11-02.1'} as const;
/** HTTP entry points pass the received version (null when missing); internal callers (confirmation, worker retries) pass undefined. */
export function paymentTermsAccepted(terms:unknown){return terms===undefined||terms===PAYMENT_TERMS.version;}
