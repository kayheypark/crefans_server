export interface TokenTypeResponse {
  // id: number; // 토큰 타입 고유 식별자
  symbol: string;
  name: string;
  price: number;
}

export interface WalletResponse {
  // id: number; // 지갑 고유 식별자
  address: string;
  tokenType: TokenTypeResponse;
  amount: number;
  ownedSince: string;
}

export interface GetUserWalletResponse {
  success: boolean;
  data: {
    wallets: WalletResponse[];
    totalValue: number;
  };
}

export interface ChargeTokenRequest {
  tokenTypeId: string;
  amount: number; // 충전할 토큰 수량
}

export interface ChargeTokenResponse {
  success: boolean;
  data: {
    orderId: string;
    amount: number; // 결제 금액 (원)
    tokenAmount: number; // 충전할 토큰 수량
    clientKey: string; // TossPayments 클라이언트 키
  };
}
