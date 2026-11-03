import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readNearDeployment } from "./near-contract-config.ts";
import { verifiedVault } from "../near/contract-state.ts";
import { assertNearAccountId } from "../near/account-id.ts";
import { parseAmount } from "../near/amount.ts";
import { vaultQueueCall, vaultPaymentCall } from "../near/contract-actions.ts";
import { verifyExecutorCall, verifyVaultSettlement } from "../near/vault-settlement.ts";
import { createNearReader } from "../near/rpc.ts";
import { readTreasuryVaultStatus } from "./treasury-vault.ts";
import { openBusinessRecords } from "./business-records.ts";
import { openAgentRuns } from "./agent-runs.ts";
import { VaultPaymentJournal, vaultPaymentId, type VaultPayment } from "./vault-payment-journal.ts";
import { nativeSubmissionId, nativeSubmissionStatus, resolveNativeSubmission, submitNativeExecutorCall } from "./near-executor.ts";
import type { NearVaultPayment } from "../../types/near-contracts.ts";
export function openVaultPayments(){const path=resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");mkdirSync(dirname(path),{recursive:true});return new VaultPaymentJournal(path);}
export async function vaultPaymentContext(companyId:string) {
 const deployment=readNearDeployment();if(deployment.companyId!==companyId)throw new Error("Native treasury workspace mismatch");
 const snapshot=await verifiedVault(deployment.treasury),vault=await readTreasuryVaultStatus(companyId);
 if(vault.state!=="verified")throw new Error("A verified native treasury is required");
 return {binding:deployment.treasury,snapshot,vault,reader:createNearReader()};
}
function matches(payment:VaultPayment,state:NearVaultPayment) {
 if(state.recipient!==payment.recipient || state.amount!==parseAmount(payment.amount).toString() || state.expires_at_sec!==payment.expiresAt)throw new Error("Native on-chain terms differ from the saved obligation");
}
function scope(payment:VaultPayment,context:Awaited<ReturnType<typeof vaultPaymentContext>>) {
 if(payment.networkId!==context.binding.networkId || payment.vaultId!==context.binding.accountId || payment.codeHash!==context.binding.codeHash)throw new Error("Saved payment belongs to another native treasury deployment");
}
export async function queueVaultPayment(companyId:string,principal:string,runId:string,recordId:string,active:()=>boolean=()=>true) {
 const context=await vaultPaymentContext(companyId),journal=openVaultPayments(),records=openBusinessRecords(),runs=openAgentRuns();
 try {
  let payment=journal.get(companyId,recordId);
  if(!payment) {
   const run=runs.list(companyId).find(item=>item.id===runId),record=records.get(companyId,recordId);
   const action=run?.actions.find(item=>item.recordId===recordId && item.tool==="review_payment" && item.disposition==="review");
   if(!run || run.fundingSource!=="treasury_vault" || run.networkId!==context.binding.networkId || run.vaultId!==context.binding.accountId || !record || !action || action.recipient!==record.recipient || action.amountUsdc!==record.amount || action.kind!==record.kind || action.dueDate!==record.dueDate)throw new Error("Prepare a fresh native vault plan bound to this exact obligation");
   assertNearAccountId(record.recipient);
   const amount=parseAmount(record.amount),p=context.snapshot.config.policy;
   if(context.snapshot.config.paused || amount<=0n || amount>BigInt(p.payment_limit))throw new Error("Native treasury is paused or its payment limit is exceeded");
   if(await context.snapshot.read("is_recipient",{account_id:record.recipient})!==true)throw new Error("Recipient is outside the native treasury allowlist");
   if(!active())throw new Error("Worker stopped before native reservation");
   payment=journal.reserve({id:vaultPaymentId(companyId,context.binding.accountId,recordId,context.binding.networkId),networkId:context.binding.networkId as "testnet"|"mainnet",vaultId:context.binding.accountId,codeHash:context.binding.codeHash,companyId,recordId,runId,recipient:record.recipient,amount:record.amount,expiresAt:String(BigInt(context.snapshot.timestampNs)/1000000000n+86400n),createdAt:new Date().toISOString(),requestedBy:principal,status:"queue_pending"},BigInt(context.snapshot.config.liquid)-BigInt(p.liquidity_floor)-parseAmount(run.request.reserveUsdc));
  }
  scope(payment,context);
  if(payment.queueTransactionHash)return payment;
  if(context.snapshot.config.paused)throw new Error("Native treasury is paused; no queue submission was sent");
  const call=vaultQueueCall(context.binding.accountId,{id:payment.id,recipient:payment.recipient,amount:payment.amount,expiresAt:payment.expiresAt});
  const hash=await submitNativeExecutorCall(context.binding,nativeSubmissionId(context.binding,payment.id,"queue"),call,active);
  return journal.patch(payment,{queueTransactionHash:hash},`Native queue transaction saved: ${hash}`);
 }finally{journal.close();records.close();runs.close();}
}
export async function reconcileVaultPayment(companyId:string,recordId:string) {
 const context=await vaultPaymentContext(companyId),journal=openVaultPayments();
 try {
  let payment=journal.get(companyId,recordId);if(!payment)throw new Error("Native treasury payment not found");scope(payment,context);
  if(payment.status==="paid")return payment;
  for(const stage of ["queue","execute"] as const) {
   const field=stage==="queue"?"queueTransactionHash":"executeTransactionHash";
   const jobId=nativeSubmissionId(context.binding,payment.id,stage),job=nativeSubmissionStatus(jobId);
   if(!payment[field] && job?.hash)payment=journal.patch(payment,{[field]:job.hash},"Recovered original native transaction identity after restart");
   const hash=payment[field];if(!hash)continue;
   const outcome=await context.reader.getReceipt(hash,context.binding.executorId);
   if(outcome.final_execution_status!=="FINAL")return payment;
   if("Failure" in outcome.status || outcome.receipts_outcome.some(receipt=>"Failure" in receipt.outcome.status)) {
    resolveNativeSubmission(jobId,hash);
    return journal.patch(payment,{status:stage==="queue"?"queue_failed_review_required":"execution_failed_review_required"},"Final native transaction failed; no replacement signature was created");
   }
   const call=stage==="queue"?vaultQueueCall(context.binding.accountId,{id:payment.id,recipient:payment.recipient,amount:payment.amount,expiresAt:payment.expiresAt}):vaultPaymentCall(context.binding.accountId,payment.id,"execute");
   verifyExecutorCall(outcome,call,{hash,executorId:context.binding.executorId});
   resolveNativeSubmission(jobId,hash);
   if(stage==="execute") {
    verifyVaultSettlement(outcome,call,payment,{hash,executorId:context.binding.executorId,tokenId:context.binding.tokenId});
    const final=await verifiedVault(context.binding),observed=await final.payment(payment.id);
    if(!observed || observed.status!=="paid")throw new Error("Native payment completion callback is not verified");matches(payment,observed);
    const records=openBusinessRecords();try{records.recordVerifiedVaultPayout(companyId,recordId,payment.id,hash,context.binding.tokenId);}finally{records.close();}
    return journal.patch(payment,{transactionHash:hash,status:"paid"},`Native USDC settlement verified: ${hash}`);
   }
  }
  const latest=await verifiedVault(context.binding),observed=await latest.payment(payment.id);
  if(!observed)return payment;matches(payment,observed);
  const now=BigInt(latest.timestampNs)/1000000000n;
  const status=observed.status==="cancelled"?"cancelled":observed.status==="executing"?"execution_pending":observed.status==="paid"?"settlement_verification":observed.policy_version!==latest.config.policy_version?"policy_changed":BigInt(observed.expires_at_sec)<=now?"expired":parseAmount(payment.amount)<=BigInt(latest.config.policy.approval_threshold) || observed.approved_by.length>=latest.config.policy.required_approvals?"ready":"awaiting_approval";
  return payment.status===status?payment:journal.patch(payment,{status},`Observed native vault status: ${status}`);
 }finally{journal.close();}
}
export async function executeVaultPayment(companyId:string,recordId:string,control:{active:()=>boolean;reserveUsdc:string}={active:()=>true,reserveUsdc:"0"}) {
 let payment=await reconcileVaultPayment(companyId,recordId);
 if(payment.executeTransactionHash || payment.status==="paid")return payment;
 if(payment.status!=="ready")throw new Error("Native payment requires current on-chain approvals before execution");
 const context=await vaultPaymentContext(companyId);scope(payment,context);
 if(context.snapshot.config.paused || BigInt(context.snapshot.config.liquid)<parseAmount(payment.amount)+BigInt(context.snapshot.config.policy.liquidity_floor)+parseAmount(control.reserveUsdc))throw new Error("Native treasury is paused or its liquidity reserve prevents execution");
 const hash=await submitNativeExecutorCall(context.binding,nativeSubmissionId(context.binding,payment.id,"execute"),vaultPaymentCall(context.binding.accountId,payment.id,"execute"),control.active);
 const journal=openVaultPayments();try{payment=journal.get(companyId,recordId)!;return journal.patch(payment,{executeTransactionHash:hash,status:"execution_pending"},`Native execution transaction saved: ${hash}`);}finally{journal.close();}
}
export async function prepareVaultApproval(companyId:string,recordId:string,signerId:string) {
 assertNearAccountId(signerId);
 const context=await vaultPaymentContext(companyId),journal=openVaultPayments();
 try {
  const payment=journal.get(companyId,recordId);if(!payment)throw new Error("Queue the native obligation before approving it");scope(payment,context);
  const observed=await context.snapshot.payment(payment.id);
  if(!observed)throw new Error("Native queue confirmation is still pending");matches(payment,observed);
  if(observed.approved_by.includes(signerId))throw new Error("This wallet already approved the payment. Another distinct human approver is required");
  if(context.snapshot.config.paused || observed.status!=="queued" || observed.policy_version!==context.snapshot.config.policy_version || BigInt(observed.expires_at_sec)<=BigInt(context.snapshot.timestampNs)/1000000000n)throw new Error("Payment changed, expired or the native vault is paused");
  if(signerId===context.binding.executorId || await context.snapshot.read("is_approver",{account_id:signerId})!==true)throw new Error("This NEAR account is not an allowed human approver");
  return {call:vaultPaymentCall(context.binding.accountId,payment.id,"approve"),signerId,networkId:context.binding.networkId,payment};
 }finally{journal.close();}
}
