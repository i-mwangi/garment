import { parseAmount } from "../near/amount.ts";
import { assertNearAccountId } from "../near/account-id.ts";
import { openBusinessRecords } from "./business-records.ts";
import { readNearTreasuryIdentity } from "./near-treasury-config.ts";
import { prepareAgentPlan } from "./prepare-agent-plan.ts";
import { openVaultPayments, queueVaultPayment, reconcileVaultPayment, executeVaultPayment, vaultPaymentContext } from "./vault-payments.ts";
import type { VaultPayment } from "./vault-payment-journal.ts";
import type { BusinessRecord } from "../../types/business.ts";
import type { NativeTreasuryPayment, NativeTreasuryView } from "../../types/near-finance.ts";
import { vaultPaymentCall } from "../near/contract-actions.ts";
import { verifyExecutorCall } from "../near/vault-settlement.ts";
import { isNearTransactionHash } from "../near/account-id.ts";

export function nativePaymentView(payment:VaultPayment,record?:BusinessRecord):NativeTreasuryPayment {
 return {intent:{id:payment.recordId,companyId:payment.companyId,walletId:payment.vaultId,recipient:payment.recipient,amount:{symbol:"USDC",decimals:6,baseUnits:parseAmount(payment.amount).toString()},purpose:record?.title==="Direct USDC transfer"?"transfer":record?.kind==="payroll"?"payroll":"bill",idempotencyKey:payment.recordId},execution:{paymentId:payment.recordId,status:payment.status==="paid"?"confirmed":payment.status,...(payment.transactionHash?{transactionHash:payment.transactionHash}:{}),...(payment.status.endsWith("review_required")?{failureReason:"The original native transaction requires review; no replacement payment was signed"}:{})}};
}
export async function payNativeObligation(companyId:string,recordId:string,principal:string) {
 const journal=openVaultPayments(),records=openBusinessRecords();
 try {
  const record=records.get(companyId,recordId);if(!record || record.kind==="invoice")throw new Error("Choose a saved native payable obligation");
  let payment=journal.get(companyId,recordId);
  if(!payment) {
   if(record.status!=="draft")throw new Error("This obligation already belongs to another payment workflow");
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const plan=await prepareAgentPlan({requestId:crypto.randomUUID(),throughDate:record.dueDate>today?record.dueDate:today,reserveUsdc:"0"},principal,false);
   payment=await queueVaultPayment(companyId,principal,plan.id,recordId);
  } else if(!payment.queueTransactionHash && payment.status==="queue_pending")payment=await queueVaultPayment(companyId,principal,payment.runId,recordId);
  payment=await reconcileVaultPayment(companyId,recordId);
  if(payment.status==="ready" && !payment.executeTransactionHash)payment=await executeVaultPayment(companyId,recordId);
  return nativePaymentView(payment,record);
 }finally{journal.close();records.close();}
}
export async function createNativeTransfer(id:string,recipient:string,amount:string,principal:string) {
 assertNearAccountId(recipient);if(parseAmount(amount)<=0n)throw new Error("A positive six-decimal USDC amount is required");
 const {companyId}=readNearTreasuryIdentity(),records=openBusinessRecords();
 try {
  const existing=records.get(companyId,id);
  const dueDate=existing?.dueDate || new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  records.create(companyId,{kind:"bill",title:"Direct USDC transfer",counterparty:recipient,recipient,amount,dueDate,description:"Direct native NEAR USDC transfer"},id);
 }finally{records.close();}
 return payNativeObligation(companyId,id,principal);
}
export async function readNativeTreasury():Promise<NativeTreasuryView> {
 const {companyId}=readNearTreasuryIdentity(),journal=openVaultPayments(),records=openBusinessRecords();
 try {
  const saved=journal.list(companyId);
  await Promise.all(saved.filter(payment=>!["paid","cancelled","expired","policy_changed"].includes(payment.status) && !payment.status.endsWith("review_required")).slice(0,8).map(payment=>reconcileVaultPayment(companyId,payment.recordId).catch(()=>payment)));
  const context=await vaultPaymentContext(companyId),known=[...new Set(records.list(companyId).filter(record=>record.kind!=="invoice").map(record=>record.recipient))];
  const allowed:string[]=[];
  for(let offset=0;offset<known.length;offset+=8){const batch=known.slice(offset,offset+8),permissions=await Promise.all(batch.map(account_id=>context.snapshot.read("is_recipient",{account_id})));batch.forEach((id,index)=>{if(permissions[index]===true)allowed.push(id);});}
  const p=context.snapshot.config.policy;
  return {wallet:{id:context.binding.accountId,companyId,address:context.binding.accountId,networkId:context.binding.networkId as "testnet"|"mainnet"},balanceBaseUnits:context.snapshot.config.liquid,policy:{allowedRecipients:allowed,maxPaymentBaseUnits:p.payment_limit,dailyLimitBaseUnits:p.daily_limit,approvalThresholdBaseUnits:p.approval_threshold,requiredApprovals:p.required_approvals},payments:journal.list(companyId).filter(payment=>payment.networkId===context.binding.networkId && payment.vaultId===context.binding.accountId && payment.codeHash===context.binding.codeHash).map(payment=>nativePaymentView(payment,records.get(companyId,payment.recordId)))};
 }finally{journal.close();records.close();}
}
export async function confirmNativeTreasuryApproval(companyId:string,recordId:string,signer:string,hash:string,principal:string) {
 if(!isNearTransactionHash(hash))throw new Error("A native approval transaction hash is required");
 const context=await vaultPaymentContext(companyId),journal=openVaultPayments();
 try {
  const payment=journal.get(companyId,recordId);
  if(!payment || payment.vaultId!==context.binding.accountId || payment.codeHash!==context.binding.codeHash || payment.networkId!==context.binding.networkId)throw new Error("Native approval payment deployment mismatch");
  const call=vaultPaymentCall(context.binding.accountId,payment.id,"approve");
  verifyExecutorCall(await context.reader.getReceipt(hash,signer),call,{hash,executorId:signer});
  const latest=await vaultPaymentContext(companyId),state=await latest.snapshot.payment(payment.id);
  if(!state?.approved_by.includes(signer))throw new Error("The native contract has not recorded this human approval");
 }finally{journal.close();}
 return payNativeObligation(companyId,recordId,principal);
}
export async function nativeCancellation(companyId:string,recordId:string,signer:string,hash?:string) {
 const context=await vaultPaymentContext(companyId),journal=openVaultPayments(),records=openBusinessRecords();
 try {
  let payment=journal.get(companyId,recordId);
  if(!payment || payment.vaultId!==context.binding.accountId || payment.networkId!==context.binding.networkId || payment.codeHash!==context.binding.codeHash || signer!==context.binding.ownerId)throw new Error("Only the configured native vault owner can cancel this queued payment");
  const call=vaultPaymentCall(context.binding.accountId,payment.id,"cancel");
  if(!hash){const state=await context.snapshot.payment(payment.id);if(state?.status!=="queued")throw new Error("Only a queued native payment can be cancelled");return {call,signerId:signer,networkId:context.binding.networkId,payment};}
  if(!isNearTransactionHash(hash))throw new Error("Invalid native cancellation hash");
  verifyExecutorCall(await context.reader.getReceipt(hash,signer),call,{hash,executorId:signer});
  const state=await (await vaultPaymentContext(companyId)).snapshot.payment(payment.id);
  if(state?.status!=="cancelled")throw new Error("Native cancellation is not final");
  records.transition(companyId,recordId,"cancelled",["awaiting_approval","cancelled"]);
  payment=journal.get(companyId,recordId)!;
  if(payment.status!=="cancelled")payment=journal.patch(payment,{status:"cancelled"},`Native cancellation verified: ${hash}`);
  return nativePaymentView(payment,records.get(companyId,recordId));
 }finally{journal.close();records.close();}
}
