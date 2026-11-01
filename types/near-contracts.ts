export type NearContractNetwork = "testnet" | "mainnet" | "sandbox";
export interface NearContractBinding {
  networkId: NearContractNetwork;
  expectedRpcChainId: string;
  accountId: string;
  codeHash: string;
  tokenId: string;
}
export interface NearVaultBinding extends NearContractBinding { ownerId: string; executorId: string }
export interface NearContractCall {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}
export interface NearVaultPolicy {
  payment_limit: string;
  daily_limit: string;
  lifetime_limit: string;
  approval_threshold: string;
  liquidity_floor: string;
  required_approvals: number;
}
export interface NearVaultConfig {
  owner: string;
  pending_owner: string | null;
  executor: string;
  token_id: string;
  policy: NearVaultPolicy;
  policy_version: string;
  paused: boolean;
  liquid: string;
  lifetime_committed: string;
  in_flight: number;
  approver_count: number;
}
export interface NearVaultPayment {
  recipient: string;
  amount: string;
  expires_at_sec: string;
  policy_version: string;
  approved_by: string[];
  status: "queued" | "executing" | "paid" | "cancelled" | "recovery_pending" | "recovered";
  dispatch_day: string;
  attempt: string;
}
export interface NearGiftState {
  sender: string;
  recipient: string;
  amount: string;
  expires_at_sec: string;
  status: "active" | "claiming" | "refunding" | "claimed" | "refunded";
  attempt: string;
}
