import { assertFinalSuccess, type NearExecutionOutcome } from "./rpc.ts";
import { parseAmount } from "./amount.ts";
import type { NearContractCall } from "../../types/near-contracts.ts";
import { sameJson } from "./json.ts";

export function verifyExecutorCall(outcome:NearExecutionOutcome,call:NearContractCall,expected:{hash:string;executorId:string}) {
  assertFinalSuccess(outcome);
  const tx=outcome.transaction;
  if(tx.hash!==expected.hash || tx.signer_id!==expected.executorId || tx.receiver_id!==call.contractId || tx.actions.length!==1)throw new Error("Native executor transaction identity mismatch");
  const signed=(tx.actions[0] as {FunctionCall?:{method_name:string;deposit:string;args:string}}).FunctionCall;
  if(signed?.method_name!==call.methodName || signed.deposit!==call.deposit)throw new Error("Native executor method mismatch");
  const args=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(signed.args),c=>c.charCodeAt(0))));
  if(!sameJson(args,call.args))throw new Error("Native executor signed terms differ from the saved obligation");
}
export function verifyVaultSettlement(outcome:NearExecutionOutcome,call:NearContractCall,payment:{id:string;recipient:string;amount:string},expected:{hash:string;executorId:string;tokenId:string}) {
  verifyExecutorCall(outcome,call,expected);
  if(call.methodName!=="execute_payment" || call.args.payment_id!==payment.id)throw new Error("Settlement must execute this native payment");
  const amount=parseAmount(payment.amount).toString();
  function event(executor:string,standard:string,name:string,predicate:(data:Record<string,unknown>)=>boolean){return outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===executor && receipt.outcome.logs.some(log=>{
    if(!log.startsWith("EVENT_JSON:"))return false;
    try{const value=JSON.parse(log.slice(11));return value.standard===standard && value.event===name && Array.isArray(value.data) && value.data.some(predicate);}catch{return false;}
  }));}
  if(!event(expected.tokenId,"nep141","ft_transfer",item=>item.old_owner_id===call.contractId && item.new_owner_id===payment.recipient && item.amount===amount && item.memo===`settlbox-vault:${payment.id}`))throw new Error("Authoritative USDC settlement event is missing");
  if(!event(call.contractId,"settlbox_vault","payment_executed",item=>item.payment_id===payment.id && item.recipient===payment.recipient && item.amount===amount))throw new Error("Native vault completion event is missing");
}
export function verifyVaultFunding(outcome:NearExecutionOutcome,call:NearContractCall,vaultId:string,expected:{hash:string;signerId:string}) {
  verifyExecutorCall(outcome,call,{hash:expected.hash,executorId:expected.signerId});
  if(call.methodName!=="ft_transfer_call" || call.args.receiver_id!==vaultId || call.args.msg!=="deposit" || call.deposit!=="1")throw new Error("Vault funding requires its native deposit callback");
  const emitted=(executor:string,standard:string,name:string,predicate:(data:Record<string,unknown>)=>boolean)=>outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===executor && receipt.outcome.logs.some(log=>{
    if(!log.startsWith("EVENT_JSON:"))return false;
    try{const value=JSON.parse(log.slice(11));return value.standard===standard && value.event===name && Array.isArray(value.data) && value.data.some(predicate);}catch{return false;}
  }));
  if(!emitted(call.contractId,"nep141","ft_transfer",item=>item.old_owner_id===expected.signerId && item.new_owner_id===vaultId && item.amount===call.args.amount) || !emitted(vaultId,"settlbox_vault","deposited",item=>item.sender_id===expected.signerId && item.amount===call.args.amount))throw new Error("Native vault did not confirm its funded USDC ledger");
}
