import { openVaultPayments } from "./vault-payments.ts";
import { readNearDeployment } from "./near-contract-config.ts";
import { verifiedVault } from "../near/contract-state.ts";
import { parseAmount } from "../near/amount.ts";
import { assertNearAccountId } from "../near/account-id.ts";
import type { BusinessRecord } from "../../types/business.ts";
import type { AgentPlanningContext } from "../../types/agent.ts";
import type { TreasuryVaultStatus } from "../../types/treasury-vault.ts";
export async function vaultPlanningContext(companyId:string,records:BusinessRecord[],_observed?:TreasuryVaultStatus):Promise<AgentPlanningContext> {
 const deployment=readNearDeployment();if(deployment.companyId!==companyId)throw new Error("Native vault workspace mismatch");
 const snapshot=await verifiedVault(deployment.treasury),p=snapshot.config.policy;
 const recipients=[...new Set(records.filter(record=>record.kind!=="invoice").map(record=>{assertNearAccountId(record.recipient);return record.recipient;}))];
 const allowedRecipients:string[]=[];
 for(let offset=0;offset<recipients.length;offset+=8) {
  const batch=recipients.slice(offset,offset+8),allowed=await Promise.all(batch.map(account_id=>snapshot.read("is_recipient",{account_id})));
  batch.forEach((recipient,index)=>{if(allowed[index]===true)allowedRecipients.push(recipient);});
 }
 const day=BigInt(snapshot.timestampNs)/86400000000000n;
 const spent=BigInt(await snapshot.read<string>("daily_committed",{day:day.toString()}));
 const journal=openVaultPayments();let reserved=0n;try{reserved=journal.reserved(companyId);}finally{journal.close();}
 const daily=BigInt(p.daily_limit),remaining=BigInt(p.lifetime_limit)-BigInt(snapshot.config.lifetime_committed);
 return {companyId,records,paused:snapshot.config.paused,balanceBaseUnits:snapshot.config.liquid,reservedBaseUnits:(reserved+BigInt(p.liquidity_floor)).toString(),committedTodayBaseUnits:(spent+reserved).toString(),policy:{allowedRecipients,maxPaymentBaseUnits:p.payment_limit,dailyLimitBaseUnits:(remaining<daily?remaining+spent:daily).toString(),approvalThresholdBaseUnits:p.approval_threshold,requiredApprovals:p.required_approvals}};
}
