import { openAgentRuns } from "./agent-runs.ts";
import { openBusinessRecords } from "./business-records.ts";
import { planBusinessActions, validateAgentPlanRequest } from "../near/agent-planner.ts";
import { reviewAgentPlan } from "./azure-agent.ts";
import { vaultPlanningContext } from "./vault-planning.ts";
import { readNearDeployment } from "./near-contract-config.ts";
export async function prepareAgentPlan(value:unknown,principalId:string,advisory=true) {
 const repository=openAgentRuns(),records=openBusinessRecords();
 try {
  const input=validateAgentPlanRequest(value),deployment=readNearDeployment(),companyId=deployment.companyId;
  const existing=repository.find(companyId,input);if(existing)return existing;
  const plan=planBusinessActions(input,await vaultPlanningContext(companyId,records.list(companyId)));
  const reviewed=advisory?await reviewAgentPlan(plan):plan;
  return repository.save(companyId,principalId,input,{...reviewed,fundingSource:"treasury_vault",networkId:deployment.treasury.networkId as "testnet"|"mainnet",vaultId:deployment.treasury.accountId});
 }finally{repository.close();records.close();}
}
