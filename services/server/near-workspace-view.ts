import { openTeamMembers } from "./team-members.ts";
import { existsSync } from "node:fs";
import type { DemoProposal, DemoAccount } from "../../presentation/contexts/DemoProvider";
import { openVaultPayments } from "./vault-payments.ts";
import { nearContractConfigPath, readNearDeployment } from "./near-contract-config.ts";
import { verifiedVault } from "../near/contract-state.ts";
import type { SeededWorkspace } from "../../types/seeded-workspace";
import type { readNearTreasuryIdentity } from "./near-treasury-config";
import { createNearReader } from "../near/rpc.ts";
import { formatAmount, parseAmount } from "../near/amount.ts";
import { openBusinessRecords } from "./business-records.ts";
import { openPaymentLinks } from "./payment-links.ts";
import { reconcileInvoiceCollections } from "./invoice-reconciliation.ts";
import { projectWorkspaceSettlement } from "./workspace-settlement.ts";
import { recordBalanceObservation } from "./balance-history.ts";
let balanceCache: { key: string; expiresAt: number; value: Promise<string> } | undefined;
export async function nearWorkspaceView(workspace: SeededWorkspace, identity: ReturnType<typeof readNearTreasuryIdentity>): Promise<SeededWorkspace> {
  if (workspace.entityId !== "entity-3") return { ...workspace, treasuryAddress: null, data: { ...workspace.data, accounts: [], balances: {}, totalBalance: 0 } };
  const reader=createNearReader();
  const key=`${reader.network.networkId}:${reader.network.usdcContractId}:${identity.accountId}`;
  if (!balanceCache || balanceCache.key !== key || balanceCache.expiresAt <= Date.now()) {
    const entry={key,expiresAt:Date.now()+10000,value:reader.getUsdcBalance(identity.accountId).then(value=>formatAmount(value))};
    balanceCache=entry;
    entry.value.catch(()=>{if(balanceCache===entry) balanceCache=undefined;});
  }
  const exact=await balanceCache.value;
  const template=workspace.data.accounts[0];
  const walletAccount=(accountId:string,name:string,extra:Partial<DemoAccount>):DemoAccount=>({...template!,...extra,id:accountId,uuid:accountId,accountId,name});
  const accounts:DemoAccount[]=template?[walletAccount(identity.accountId,"NEAR collection wallet",{members:[],publicKeys:[],threshold:1})]:[];
  const balances=Object.fromEntries(accounts.map((account,index)=>[account.accountId,[{faucetId:reader.network.usdcContractId,symbol:"USDC",amount:index===0?Number(exact):0,decimals:6,usdValue:index===0?Number(exact):0}]]));
  const records=openBusinessRecords();const links=openPaymentLinks();
  try {
    const observed=reconcileInvoiceCollections(identity.companyId,records,links);
    const data=projectWorkspaceSettlement(workspace.data,observed,identity.accountId,links.list());
    const pendingProposals:DemoProposal[]=[];
    if(existsSync(nearContractConfigPath())){
      const {treasury}=readNearDeployment(),snapshot=await verifiedVault(treasury),journal=openVaultPayments();
      const team=openTeamMembers();
      let members:{name:string;commitment:string;role:string}[]=[];
      try {
        const candidates=team.list(identity.companyId).filter(member=>member.status==="ACTIVE" && member.walletAddress && ["OWNER","ADMIN","REVIEWER"].includes(member.role));
        const permissions=await Promise.all(candidates.map(member=>snapshot.read("is_approver",{account_id:member.walletAddress})));
        members=candidates.filter((_,i)=>permissions[i]===true).map(member=>({name:`${member.firstName} ${member.lastName}`.trim(),commitment:member.walletAddress!,role:member.role}));
      }finally{team.close();}
      if(template) {accounts.push(walletAccount(treasury.accountId,"NEAR policy treasury",{members,publicKeys:members.map(member=>member.commitment),threshold:snapshot.config.policy.required_approvals}));balances[treasury.accountId]=[{faucetId:reader.network.usdcContractId,symbol:"USDC",amount:Number(formatAmount(BigInt(snapshot.config.liquid))),decimals:6,usdValue:Number(formatAmount(BigInt(snapshot.config.liquid)))}];}
      try {
        for(const payment of journal.list(identity.companyId).filter(p=>p.networkId===identity.networkId && p.vaultId===treasury.accountId && p.codeHash===treasury.codeHash && !["paid","cancelled"].includes(p.status))){
          const state=await snapshot.payment(payment.id),record=records.get(identity.companyId,payment.recordId);
          if(state && (state.recipient!==payment.recipient || state.amount!==parseAmount(payment.amount).toString()))throw new Error("Native proposal state differs from its saved terms");
          pendingProposals.push({businessRecordId:payment.recordId,amountExact:payment.amount,id:payment.recordId,uuid:payment.recordId,accountId:treasury.accountId,accountName:"NEAR policy treasury",type:"SEND",proposalCategory:record?.kind==="payroll"?"paying_payroll":record?.kind==="reimbursement"?"paying_reimbursement":"paying_bill",status:payment.status==="ready"?"READY":payment.status.endsWith("review_required")?"FAILED":"PENDING",amount:Number(payment.amount),currency:"USDC",to:record?.counterparty || payment.recipient,toAddress:payment.recipient,label:record?.title || "Native treasury payment",note:payment.status,createdBy:payment.requestedBy,createdAt:payment.createdAt,signatures:(state?.approved_by || []).map(signer=>({signer,status:"SIGNED",signedAt:""})),requiredSignatures:BigInt(state?.amount || "0")>=BigInt(snapshot.config.policy.approval_threshold)?snapshot.config.policy.required_approvals:0});
        }
      }finally{journal.close();}
    }
    const balanceHistory=recordBalanceObservation(identity.companyId,workspace.entityId,`${identity.networkId}:${identity.accountId}`,exact);
    return {...workspace,treasuryAddress:identity.accountId,data:{...data,pendingProposals,accounts,balances,totalBalance:Number(exact),balanceHistory,verifiedTransactionIds:observed.filter(record=>record.status==="paid"&&record.transactionHash).map(record=>record.id)}};
  } finally {links.close();records.close();}
}
