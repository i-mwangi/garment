export interface GiftEscrowConfiguration { networkId: "testnet" | "mainnet"; accountId: string; tokenId: string; codeHash: string }
export interface NearGift {
  id: string;
  networkId: "testnet" | "mainnet";
  escrowId: string;
  sender: string;
  recipient: string;
  amount: string;
  expiresAt: number;
  status: "active" | "expired" | "claiming" | "refunding" | "claimed" | "refunded";
  transactionHash?: string;
}
