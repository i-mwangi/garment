import { assertFinalSuccess, type NearExecutionOutcome } from "./rpc.ts";
import { assertRequestId } from "./contract-snapshot.ts";
import { parseAmount } from "./amount.ts";
import type { NearGift } from "../../types/near-gift.ts";

export function verifyGiftAction(gift:NearGift,outcome:NearExecutionOutcome,expected:{hash:string;signerId:string}) {
  assertFinalSuccess(outcome);
  const tx=outcome.transaction;
  if(tx.hash!==expected.hash || tx.signer_id!==expected.signerId || tx.receiver_id!==gift.escrowId || tx.actions.length!==1)throw new Error("Native gift action identity mismatch");
  const call=(tx.actions[0] as {FunctionCall?:{method_name:string;deposit:string;args:string}}).FunctionCall;
  if(!call || !["claim_gift","refund_gift"].includes(call.method_name) || call.deposit!=="1")throw new Error("Invalid native gift action");
  const args=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));
  const claim=call.method_name==="claim_gift";
  if(args.gift_id!==gift.id || expected.signerId!==(claim?gift.recipient:gift.sender))throw new Error("Native gift action terms mismatch");
  return claim?"claimed":"refunded";
}

/** Funding requires the direct signed call AND authoritative token and escrow events. */
export function verifyGiftFunding(gift:NearGift,outcome:NearExecutionOutcome,expected:{hash:string;signerId:string;tokenId:string}) {
  assertRequestId(gift.id);assertFinalSuccess(outcome);
  const tx=outcome.transaction;
  if(tx.hash!==expected.hash || tx.signer_id!==expected.signerId || tx.signer_id!==gift.sender || tx.receiver_id!==expected.tokenId || tx.actions.length!==1) throw new Error("Gift funding transaction identity mismatch");
  const call=(tx.actions[0] as {FunctionCall?:{method_name:string;deposit:string;args:string}}).FunctionCall;
  if(call?.method_name!=="ft_transfer_call" || call.deposit!=="1") throw new Error("Gift funding must call native USDC ft_transfer_call");
  const args=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));
  const msg=JSON.parse(args.msg),amount=parseAmount(gift.amount).toString();
  if(args.receiver_id!==gift.escrowId || args.amount!==amount || args.memo!==`settlbox-gift:${gift.id}` || msg.gift_id!==gift.id || msg.recipient!==gift.recipient || msg.expires_at_sec!==String(gift.expiresAt)) throw new Error("Gift funding instructions differ from the native gift");
  function emitted(executor:string,standard:string,eventName:string,predicate:(data:Record<string,unknown>)=>boolean) {
    return outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===executor && receipt.outcome.logs.some(log=>{
      if(!log.startsWith("EVENT_JSON:"))return false;
      try {const event=JSON.parse(log.slice(11));return event.standard===standard && event.event===eventName && Array.isArray(event.data) && event.data.some(predicate);}catch{return false;}
    }));
  }
  if(!emitted(expected.tokenId,"nep141","ft_transfer",item=>item.old_owner_id===gift.sender && item.new_owner_id===gift.escrowId && item.amount===amount)) throw new Error("USDC contract did not confirm gift funding");
  if(!emitted(gift.escrowId,"settlbox_gift","gift_created",item=>item.gift_id===gift.id && item.sender===gift.sender && item.recipient===gift.recipient && item.amount===amount && item.expires_at_sec===String(gift.expiresAt))) throw new Error("Native escrow did not confirm gift creation");
  return {...gift,transactionHash:expected.hash};
}
