import { assertNearAccountId } from "./account-id.ts";
import type { NearVaultBinding, NearVaultConfig, NearContractCall } from "../../types/near-contracts.ts";
export function nativeOwnershipCall(binding:NearVaultBinding,state:NearVaultConfig,signer:string,action:"propose_owner"|"accept_ownership",target:string):NearContractCall {
  assertNearAccountId(target);assertNearAccountId(signer);
  if(!state.paused || state.in_flight!==0)throw new Error("Pause the native vault and finish pending transfers before changing administration");
  if(target===binding.executorId || target===binding.accountId || target===binding.tokenId || target===state.owner)throw new Error("Choose a distinct human administrator");
  if(action==="propose_owner") {if(signer!==state.owner)throw new Error("Only the current native owner can nominate an administrator");}
  else if(action==="accept_ownership") {if(state.pending_owner!==target || signer!==target)throw new Error("Only the nominated native owner can accept administration");}
  else throw new Error("Unsupported native ownership action");
  return {contractId:binding.accountId,methodName:action,args:action==="propose_owner"?{owner:target}:{},deposit:"1",gas:"50000000000000"};
}
