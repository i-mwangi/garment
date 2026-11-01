import { openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { assertNearAccountId } from "../near/account-id.ts";
import type { NearVaultBinding } from "../../types/near-contracts.ts";

/** Called only after the new owner's exact acceptance transaction and final state are verified. */
export function commitNativeVaultOwner(companyId:string,binding:NearVaultBinding,target:string) {
 assertNearAccountId(target);
 const path=resolve(process.env.SETTLBOX_NEAR_CONTRACT_CONFIG || ".data/near-contracts.json"),lock=path+".ownership.lock";
 const fd=openSync(lock,"wx");let temporary:string|undefined;let created=false;
 try {
  const config=JSON.parse(readFileSync(path,"utf8")),vault=config.treasury;
  if(config.companyId!==companyId || config.networkId!==binding.networkId || config.tokenId!==binding.tokenId || vault.accountId!==binding.accountId || vault.codeHash!==binding.codeHash || vault.executorId!==binding.executorId || ![binding.ownerId,target].includes(vault.ownerId))throw new Error("Native deployment changed during ownership handoff");
  if(vault.ownerId===target)return;
  temporary=path+".ownership."+randomUUID()+".tmp";
  writeFileSync(temporary,JSON.stringify({...config,treasury:{...vault,ownerId:target}},null,2)+"\n",{encoding:"utf8",flag:"wx"});
  created=true;
  renameSync(temporary,path);temporary=undefined;
 }finally{if(temporary && created)unlinkSync(temporary);closeSync(fd);unlinkSync(lock);}
}
