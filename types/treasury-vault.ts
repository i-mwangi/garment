export interface TreasuryVaultPolicyInput {
  paymentLimitUsdc: string;
  dailyLimitUsdc: string;
  lifetimeLimitUsdc: string;
  approvalThresholdUsdc: string;
  liquidityFloorUsdc: string;
  requiredApprovals: number;
}

export type TreasuryVaultStatus =
  | { state: "not_configured"; message: string }
  | {
      state: "verified";
      networkId: "testnet" | "mainnet";
      address: string;
      administrator: string;
      executor: string;
      paused: boolean;
      approvalCapacityReady: boolean;
      balanceUsdc: string;
      lifetimeSpentUsdc: string;
      policyVersion: string;
      policy: TreasuryVaultPolicyInput;
      blockNumber: string;
      observedAt: string;
    };
