import { openAgentRuns } from "./agent-runs.ts";
import { openBusinessRecords } from "./business-records.ts";
import { planBusinessActions, validateAgentPlanRequest } from "../near/agent-planner.ts";
import { reviewAgentPlan } from "./azure-agent.ts";
import { vaultPlanningContext } from "./vault-planning.ts";
import { readNearDeployment } from "./near-contract-config.ts";
import { readNearTreasuryIdentity } from "./near-treasury-config.ts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
export async function prepareAgentPlan(value:unknown,principalId:string,advisory=true) {
 const repository=openAgentRuns(),records=openBusinessRecords();
 try {
  const input=validateAgentPlanRequest(value);
  const configPath=resolve(process.env.SETTLBOX_NEAR_CONTRACT_CONFIG || ".data/near-contracts.json");
  if(!existsSync(configPath)) {
   const workspace=readNearTreasuryIdentity();
   const existing=repository.find(workspace.companyId,input);if(existing)return existing;
   return repository.save(workspace.companyId,principalId,input,{
    mode:"proposal_only",engine:"deterministic",networkId:workspace.networkId,
    planningUnavailableReason:"The NEAR treasury contract is not deployed or activated. Vault balance, payment eligibility and approvals cannot be checked yet.",
    balanceUsdc:"0",reserveUsdc:input.reserveUsdc,obligationsUsdc:"0",unallocatedUsdc:"0",actions:[],
   });
  }
  const deployment=readNearDeployment(),companyId=deployment.companyId;
  const existing=repository.find(companyId,input);if(existing)return existing;
  const plan=planBusinessActions(input,await vaultPlanningContext(companyId,records.list(companyId)));
  const reviewed=advisory?await reviewAgentPlan(plan):plan;
  return repository.save(companyId,principalId,input,{...reviewed,fundingSource:"treasury_vault",networkId:deployment.treasury.networkId as "testnet"|"mainnet",vaultId:deployment.treasury.accountId});
 }finally{repository.close();records.close();}
}
