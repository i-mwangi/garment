import { existsSync } from "node:fs";
import { nearContractConfigPath, readNearDeployment } from "./near-contract-config.ts";
import { verifiedVault } from "../near/contract-state.ts";
import { formatAmount } from "../near/amount.ts";
import type { TreasuryVaultStatus } from "../../types/treasury-vault.ts";
export async function readTreasuryVaultStatus(companyId:string):Promise<TreasuryVaultStatus> {
 const path=nearContractConfigPath();
 if(!existsSync(path))return {state:"not_configured",message:"Deploy and verify the native NEAR treasury vault before enabling payments."};
 const deployment=readNearDeployment();if(deployment.companyId!==companyId)throw new Error("Native vault belongs to another workspace");
 const vault=await verifiedVault(deployment.treasury),p=vault.config.policy;
 return {state:"verified",networkId:deployment.treasury.networkId as "testnet"|"mainnet",address:deployment.treasury.accountId,administrator:vault.config.owner,executor:vault.config.executor,paused:vault.config.paused,approvalCapacityReady:vault.config.approver_count>=p.required_approvals,balanceUsdc:formatAmount(BigInt(vault.config.liquid)),lifetimeSpentUsdc:formatAmount(BigInt(vault.config.lifetime_committed)),policyVersion:vault.config.policy_version,policy:{paymentLimitUsdc:formatAmount(BigInt(p.payment_limit)),dailyLimitUsdc:formatAmount(BigInt(p.daily_limit)),lifetimeLimitUsdc:formatAmount(BigInt(p.lifetime_limit)),approvalThresholdUsdc:formatAmount(BigInt(p.approval_threshold)),liquidityFloorUsdc:formatAmount(BigInt(p.liquidity_floor)),requiredApprovals:p.required_approvals},blockNumber:String(vault.blockHeight),observedAt:new Date(Number(BigInt(vault.timestampNs)/1000000n)).toISOString()};
}
