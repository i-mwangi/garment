import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, SignedTransaction, actions } from "near-api-js";
import { encodeBase58 } from "../near/base58.ts";
import { createNearReader } from "../near/rpc.ts";
import { getNearNetwork } from "../near/network.ts";
import { verifiedVault } from "../near/contract-state.ts";
import { verifyExecutorPermission } from "../near/executor-permission.ts";
import { NearSubmissionJournal, type NativeSubmission } from "./near-submission-journal.ts";
import type { NearContractCall, NearVaultBinding } from "../../types/near-contracts.ts";

function journal(){const path=resolve(process.env.SETTLBOX_NEAR_EXECUTOR_DATABASE || ".data/near-executor.sqlite");mkdirSync(dirname(path),{recursive:true});return new NearSubmissionJournal(path);}
function fingerprint(call:NearContractCall){return JSON.stringify([call.contractId,call.methodName,Object.entries(call.args).sort(([a],[b])=>a.localeCompare(b)),call.gas,call.deposit]);}
export function nativeSubmissionId(binding:NearVaultBinding,paymentId:string,stage:"queue"|"execute") {
  return createHash("sha256").update(JSON.stringify([binding.networkId,binding.accountId,binding.codeHash,paymentId,stage])).digest("hex");
}
function decodeSaved(job:NativeSubmission,call:NearContractCall,executor:string) {
  if(!job.hash || !job.signedBytes)throw new Error("Native submission has no durable signed transaction");
  const signed=SignedTransaction.decode(Buffer.from(job.signedBytes,"base64"));
  const tx=signed.transaction;
  if(encodeBase58(createHash("sha256").update(tx.encode()).digest())!==job.hash || tx.signerId!==executor || tx.receiverId!==call.contractId || tx.actions.length!==1)throw new Error("Saved native transaction identity mismatch");
  const action=tx.actions[0].functionCall;
  if(!action || action.methodName!==call.methodName || action.deposit!==BigInt(call.deposit) || action.gas!==BigInt(call.gas))throw new Error("Saved native transaction call mismatch");
  const args=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(action.args));
  if(Object.keys(args).length!==Object.keys(call.args).length || Object.entries(call.args).some(([key,value])=>args[key]!==value))throw new Error("Saved native transaction arguments mismatch");
  return signed;
}

/** Retries re-broadcast identical signed bytes; they never allocate a new signature. */
export async function submitNativeExecutorCall(binding:NearVaultBinding,id:string,call:NearContractCall,active:()=>boolean=()=>true) {
  if(call.contractId!==binding.accountId || call.deposit!=="0" || !["queue_payment","execute_payment"].includes(call.methodName))throw new Error("Executor may only queue or execute its configured native vault");
  const network=getNearNetwork();
  if(network.networkId!==binding.networkId)throw new Error("Native executor network mismatch");
  await verifiedVault(binding);
  const store=journal();
  try {
    if(!active())throw new Error("Worker stopped before native signing");
    let job=store.begin({id,scope:binding.networkId,executor:binding.executorId,fingerprint:fingerprint(call)});
    const provider=new JsonRpcProvider({url:network.rpcUrl});
    if(job.state==="preparing") {
      const keyFile=process.env.SETTLBOX_NEAR_EXECUTOR_KEY_FILE;
      if(!keyFile)throw new Error("Configure a restricted NEAR executor access-key file");
      const credential=JSON.parse(readFileSync(resolve(keyFile),"utf8"));
      if(credential.account_id!==binding.executorId || typeof credential.private_key!=="string")throw new Error("Native executor credential account mismatch");
      const key=KeyPair.fromString(credential.private_key),publicKey=key.getPublicKey().toString();
      const access=await createNearReader().rpc("query",{request_type:"view_access_key",account_id:binding.executorId,public_key:publicKey,finality:"final"});
      verifyExecutorPermission(access,binding.accountId,call.methodName);
      const tx=await new Account(binding.executorId,provider).createTransaction({receiverId:binding.accountId,publicKey,actions:[actions.functionCall(call.methodName,call.args,BigInt(call.gas),0n)]});
      if(!active())throw new Error("Worker stopped before native signature");
      const signed=await new KeyPairSigner(key).signTransaction(tx);
      job=store.signed(job,encodeBase58(signed.txHash),Buffer.from(signed.signedTransaction.encode()).toString("base64"));
    }
    if(job.state!=="resolved") {
      const signed=decodeSaved(job,call,binding.executorId);
      if(!active())return job.hash!; // Durable hash remains available for reconciliation.
      try {await provider.sendTransaction(signed);}catch{/* Transport uncertainty preserves this original hash and blocks new nonces. */}
    }
    return job.hash!;
  }finally{store.close();}
}
export function resolveNativeSubmission(id:string,hash:string){const store=journal();try{store.resolve(id,hash);}finally{store.close();}}
export function nativeSubmissionStatus(id:string){const store=journal();try{const job=store.get(id);return job?{hash:job.hash,state:job.state}:undefined;}finally{store.close();}}
