"use client";
import {useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {workspaceFetch} from "@/presentation/services/api/seeded-workspace";
import {useNearWallet} from "@/contexts/NearWalletProvider";
import {getNearNetwork,nearTransactionUrl} from "@/services/near/network";
import {pendingSubmission,reconcilePendingSubmission} from "@/services/wallet/web3auth-near";
import type {NearContractCall,NearVaultBinding} from "@/types/near-contracts";
import type {AgentProposal} from "@/types/agent-operation";
interface Prepared {proposal:AgentProposal;call:NearContractCall;binding:NearVaultBinding;signer:string;target:string;hash?:string}
export default function OwnershipTransfer({address}:{address:string}) {
 const wallet=useNearWallet(),queries=useQueryClient(),requestIds=useRef(new Map<string,string>());
 const config=useQuery({queryKey:["human-wallet-config"],queryFn:()=>workspaceFetch<{ownerId:string;pendingOwnerId:string|null;paused:boolean}>("/api/treasury/human-wallet"),retry:false});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[hash,setHash]=useState<string|null>(null);
 async function perform(action:"propose_owner"|"accept_ownership") {
  if(busy || !wallet.address)return;setBusy(true);setMessage("");
  try {
   const target=action==="accept_ownership"?wallet.address:address.trim();
   const key=`settlbox:near:ownership:${getNearNetwork().networkId}:${wallet.address}:${action}:${target}`;
   const raw=localStorage.getItem(key);let prepared:Prepared|undefined=raw?JSON.parse(raw):undefined;
   if(!prepared) {
    const requestKey=action+":"+target;let requestId=requestIds.current.get(requestKey);
    if(!requestId){requestId=crypto.randomUUID();requestIds.current.set(requestKey,requestId);}
    prepared=await workspaceFetch<Prepared>("/api/treasury/human-wallet","POST",{action,address:target,requestId});
    localStorage.setItem(key,JSON.stringify(prepared));
   }
   if(prepared.signer!==wallet.address || prepared.binding.networkId!==getNearNetwork().networkId || prepared.call.methodName!==action || prepared.target!==target)throw new Error("Saved native ownership review does not match this wallet or action");
   const prior=pendingSubmission(wallet.address);
   if(!prepared.hash && prior?.contractId===prepared.call.contractId && prior.methodName===action && JSON.stringify(prior.args)===JSON.stringify(prepared.call.args))prepared.hash=prior.hash;
   if(!prepared.hash) {
    if(Date.parse(prepared.proposal.expiresAt)<=Date.now())throw new Error("This ownership review expired. Check for a submitted transaction before preparing another review");
    prepared.hash=await wallet.callContract(prepared.call);
   }
   localStorage.setItem(key,JSON.stringify(prepared));setHash(prepared.hash);
   await workspaceFetch("/api/treasury/human-wallet","POST",{action:"verify_ownership",proposalId:prepared.proposal.id,transactionHash:prepared.hash});
   if(pendingSubmission(wallet.address)?.hash===prepared.hash)await reconcilePendingSubmission(wallet.address);
   localStorage.removeItem(key);requestIds.current.delete(action+":"+target);
   await Promise.all([queries.invalidateQueries({queryKey:["human-wallet-config"]}),queries.invalidateQueries({queryKey:["treasury-vault"]})]);
   setMessage(action==="propose_owner"?"Native nomination confirmed. The nominated administrator must sign acceptance with their own wallet.":"Native ownership acceptance verified. The configured vault administrator has been updated.");
  }catch(error){setMessage(error instanceof Error?error.message:"Native ownership is unresolved; check the saved transaction before retrying");}
  finally{setBusy(false);}
 }
 return <div className="space-y-2 rounded-lg border border-primary-divider p-3"><p className="font-medium">Transfer vault administration</p><p className="text-sm text-text-secondary">Pause the vault and finish pending payments. Nominate an active workspace administrator's NEAR account, then sign acceptance with that account. The collection wallet remains unchanged.</p>{config.data&&<p className="break-all text-sm">Current owner: {config.data.ownerId}<br/>Nominated owner: {config.data.pendingOwnerId||"None"}</p>}<div className="flex flex-wrap gap-2"><button disabled={busy||!wallet.address||!address.trim()} onClick={()=>void perform("propose_owner")} className="rounded-lg border border-primary-divider px-3 py-2 disabled:opacity-50">Nominate NEAR administrator</button><button disabled={busy||!wallet.address} onClick={()=>void perform("accept_ownership")} className="rounded-lg border border-primary-divider px-3 py-2 disabled:opacity-50">Accept or verify nomination</button></div>{message&&<p role="status" className="break-all text-sm">{message}</p>}{hash&&<a href={nearTransactionUrl(hash)} target="_blank" rel="noreferrer" className="break-all text-primary-blue">View ownership transaction</a>}</div>;
}
