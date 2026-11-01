import { assertNearAccountId } from "./account-id.ts";
import { assertFinalSuccess, type NearExecutionOutcome } from "./rpc.ts";
import type { NearContractCall, NearVaultBinding } from "../../types/near-contracts.ts";
import { sameJson } from "./json.ts";

export function vaultAdministrationCall(binding:NearVaultBinding,action:unknown,address?:unknown):NearContractCall {
  let methodName:string,args:Record<string,unknown>;
  if(action==="allow_recipient" || action==="allow_approver") {
    assertNearAccountId(address);
    if(address===binding.accountId || (action==="allow_approver" && address===binding.executorId))throw new Error("Invalid recipient or approver authority");
    methodName=action==="allow_recipient"?"set_recipient":"set_approver";
    args=action==="allow_recipient"?{recipient:address,allowed:true}:{approver:address,allowed:true};
  } else if(action==="pause" || action==="unpause") {methodName="set_paused";args={paused:action==="pause"};}
  else if(action==="configure_executor") {methodName="set_executor";args={executor:binding.executorId};}
  else throw new Error("Unsupported native vault administration action");
  return {contractId:binding.accountId,methodName,args,deposit:"1",gas:"50000000000000"};
}

export function verifyVaultAdministration(call:NearContractCall,outcome:NearExecutionOutcome,expected:{hash:string;ownerId:string;blockTimestampNs:string;reviewCreatedAt:string}) {
  assertFinalSuccess(outcome);
  const created=Date.parse(expected.reviewCreatedAt);
  if(!Number.isFinite(created) || !/^\d+$/.test(expected.blockTimestampNs) || BigInt(expected.blockTimestampNs)<BigInt(created)*1000000n)throw new Error("Native authorization transaction predates this review");
  const tx=outcome.transaction;
  if(tx.hash!==expected.hash || tx.signer_id!==expected.ownerId || tx.receiver_id!==call.contractId || tx.actions.length!==1)throw new Error("Native vault administration transaction identity mismatch");
  const signed=(tx.actions[0] as {FunctionCall?:{method_name:string;deposit:string;args:string}}).FunctionCall;
  if(signed?.method_name!==call.methodName || signed.deposit!==call.deposit)throw new Error("Native vault administration method mismatch");
  const args=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(signed.args),c=>c.charCodeAt(0))));
  if(!sameJson(args,call.args))throw new Error("Signed native administration arguments differ from the saved review");
}
