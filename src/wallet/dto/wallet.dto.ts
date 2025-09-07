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
