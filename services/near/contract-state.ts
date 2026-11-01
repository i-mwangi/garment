import type { NearContractBinding, NearGiftState, NearVaultBinding, NearVaultConfig, NearVaultPayment, NearVaultPolicy } from "../../types/near-contracts.ts";
import { account, assertRequestId, contractSnapshot, count, record, unsigned, U64_MAX, type ContractRpc } from "./contract-snapshot.ts";

export function validateNativeVaultPolicy(value:unknown):NearVaultPolicy {
  const p=record(value,"vault policy");
  const result:NearVaultPolicy={payment_limit:unsigned(p.payment_limit,"payment limit"),daily_limit:unsigned(p.daily_limit,"daily limit"),lifetime_limit:unsigned(p.lifetime_limit,"lifetime limit"),approval_threshold:unsigned(p.approval_threshold,"approval threshold"),liquidity_floor:unsigned(p.liquidity_floor,"liquidity floor"),required_approvals:count(p.required_approvals,"required approvals",20)};
  if(BigInt(result.payment_limit)<=0n || BigInt(result.payment_limit)>BigInt(result.daily_limit) || BigInt(result.daily_limit)>BigInt(result.lifetime_limit) || BigInt(result.approval_threshold)>BigInt(result.payment_limit) || result.required_approvals<1) throw new Error("Invalid native vault policy limits");
  return result;
}
export async function verifiedVault(binding:NearVaultBinding,rpc?:ContractRpc) {
  account(binding.ownerId);account(binding.executorId);
  if(binding.ownerId===binding.executorId) throw new Error("Treasury owner and executor must differ");
  const snapshot=await contractSnapshot(binding,rpc);
  const raw=record(await snapshot.read("get_config"),"vault configuration");
  if(raw.owner!==binding.ownerId || raw.executor!==binding.executorId || raw.token_id!==binding.tokenId || typeof raw.paused!=="boolean") throw new Error("Native vault authority or token identity mismatch");
  const config:NearVaultConfig={owner:account(raw.owner),pending_owner:raw.pending_owner===null?null:account(raw.pending_owner),executor:account(raw.executor),token_id:account(raw.token_id),policy:validateNativeVaultPolicy(raw.policy),policy_version:unsigned(raw.policy_version,"policy version",U64_MAX),paused:raw.paused,liquid:unsigned(raw.liquid,"liquid USDC"),lifetime_committed:unsigned(raw.lifetime_committed,"committed USDC"),in_flight:count(raw.in_flight,"pending transfers",1000),approver_count:count(raw.approver_count,"approver count",20)};
  if(config.policy_version==="0") throw new Error("Invalid native vault policy version");
  const tokenBalance=unsigned(await snapshot.view(binding.tokenId,"ft_balance_of",{account_id:binding.accountId}),"USDC balance");
  if(BigInt(config.liquid)>BigInt(tokenBalance)) throw new Error("Vault USDC accounting exceeds its verified token balance");
  return {...snapshot,config,tokenBalance,
    async payment(id:string):Promise<NearVaultPayment|null> {
      assertRequestId(id);
      const value=await snapshot.read("get_payment",{payment_id:id});if(value===null)return null;
      const p=record(value,"vault payment");
      if(!["queued","executing","paid","cancelled","recovery_pending","recovered"].includes(String(p.status)) || !Array.isArray(p.approved_by) || p.approved_by.length>20 || new Set(p.approved_by).size!==p.approved_by.length) throw new Error("Invalid native vault payment state");
      return {recipient:account(p.recipient),amount:unsigned(p.amount,"payment amount"),expires_at_sec:unsigned(p.expires_at_sec,"payment expiry",U64_MAX),policy_version:unsigned(p.policy_version,"payment policy version",U64_MAX),approved_by:p.approved_by.map(account),status:p.status as NearVaultPayment["status"],dispatch_day:unsigned(p.dispatch_day,"dispatch day",U64_MAX),attempt:unsigned(p.attempt,"payment attempt",U64_MAX)};
    },
  };
}
export async function verifiedGiftEscrow(binding:NearContractBinding,rpc?:ContractRpc) {
  const snapshot=await contractSnapshot(binding,rpc);
  if(await snapshot.read("get_token_id")!==binding.tokenId) throw new Error("Gift escrow token identity mismatch");
  return {...snapshot,
    async gift(id:string):Promise<NearGiftState|null> {
      assertRequestId(id);
      const value=await snapshot.read("get_gift",{gift_id:id});if(value===null)return null;
      const g=record(value,"gift state");
      if(!["active","claiming","refunding","claimed","refunded"].includes(String(g.status))) throw new Error("Invalid native gift state");
      return {sender:account(g.sender),recipient:account(g.recipient),amount:unsigned(g.amount,"gift amount"),expires_at_sec:unsigned(g.expires_at_sec,"gift expiry",U64_MAX),status:g.status as NearGiftState["status"],attempt:unsigned(g.attempt,"gift attempt",U64_MAX)};
    },
  };
}
