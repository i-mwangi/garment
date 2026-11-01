import { assertNearAccountId } from "./account-id.ts";
import { parseAmount } from "./amount.ts";
import { assertRequestId, unsigned, U64_MAX } from "./contract-snapshot.ts";
import type { NearContractCall } from "../../types/near-contracts.ts";
const CONTRACT_GAS="150000000000000";
function call(contractId:string,methodName:string,args:Record<string,unknown>,deposit="1"):NearContractCall {
  assertNearAccountId(contractId);return {contractId,methodName,args,deposit,gas:CONTRACT_GAS};
}
export function vaultFundingCall(tokenId:string,vaultId:string,amount:string,reference:string) {
  assertNearAccountId(vaultId);assertRequestId(reference);
  const units=parseAmount(amount);if(units<=0n || units>(1n<<128n)-1n)throw new Error("Invalid native vault funding amount");
  return call(tokenId,"ft_transfer_call",{receiver_id:vaultId,amount:units.toString(),memo:`settlbox-vault-funding:${reference}`,msg:"deposit"});
}
export function giftFundingCall(tokenId:string,escrowId:string,input:{id:string;recipient:string;amount:string;expiresAt:string}):NearContractCall {
  assertRequestId(input.id);assertNearAccountId(escrowId);assertNearAccountId(input.recipient);
  const amount=parseAmount(input.amount);if(amount<=0n || amount>(1n<<128n)-1n) throw new Error("Invalid gift USDC amount");
  unsigned(input.expiresAt,"gift expiry",U64_MAX);
  return call(tokenId,"ft_transfer_call",{receiver_id:escrowId,amount:amount.toString(),memo:`settlbox-gift:${input.id}`,msg:JSON.stringify({gift_id:input.id,recipient:input.recipient,expires_at_sec:input.expiresAt})});
}
export function giftActionCall(escrowId:string,id:string,action:"claim"|"refund") {
  if(!["claim","refund"].includes(action)) throw new Error("Invalid gift action");
  assertRequestId(id);return call(escrowId,action==="claim"?"claim_gift":"refund_gift",{gift_id:id});
}
export function vaultQueueCall(vaultId:string,input:{id:string;recipient:string;amount:string;expiresAt:string}) {
  assertRequestId(input.id);assertNearAccountId(input.recipient);const amount=parseAmount(input.amount);
  if(amount<=0n || amount>(1n<<128n)-1n) throw new Error("Invalid treasury USDC amount");
  unsigned(input.expiresAt,"payment expiry",U64_MAX);
  return call(vaultId,"queue_payment",{payment_id:input.id,recipient:input.recipient,amount:amount.toString(),expires_at_sec:input.expiresAt},"0");
}
export function vaultPaymentCall(vaultId:string,id:string,action:"approve"|"execute"|"cancel") {
  if(!["approve","execute","cancel"].includes(action)) throw new Error("Invalid vault payment action");
  assertRequestId(id);return call(vaultId,`${action}_payment`,{payment_id:id},action==="execute"?"0":"1");
}
