"use client";
import ReviewHeading from "./ReviewHeading";
import FinanceButton from "@/presentation/components/Common/FinanceButton";
import { useEffect, useRef, useState } from "react";
import { workspaceFetch } from "@/presentation/services/api/seeded-workspace";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { getNearNetwork, nearTransactionUrl } from "@/services/near/network";
import { pendingSubmission, reconcilePendingSubmission } from "@/services/wallet/web3auth-near";
import type { NearContractCall } from "@/types/near-contracts";
import type { AgentProposal } from "@/types/agent-operation";
const names:Record<string,string>={allow_recipient:"Allow payment recipient",allow_approver:"Add human approver",pause:"Pause treasury payments",unpause:"Activate treasury payments",configure_executor:"Assign NEAR execution account"};
export default function WalletReview({proposal,onClose,onUpdated}:{proposal:AgentProposal;onClose:()=>void;onUpdated:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),submitting=useRef(false),wallet=useNearWallet();
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState(""),[hash,setHash]=useState<string|null>(null);
 const action=String(proposal.operation.arguments.action||"");
 const savedCall=(proposal.result as {call?:NearContractCall}|undefined)?.call;
 const displayedAccount=action==="configure_executor" && savedCall?.args && typeof savedCall.args.executor==="string" ? savedCall.args.executor : proposal.operation.arguments.address;
 const key=`settlbox:near:agent-authorization:${getNearNetwork().networkId}:${wallet.address}:${proposal.id}`;
 useEffect(()=>{
  dialog.current?.showModal();
  let savedHash=localStorage.getItem(key);
  const saved=proposal.result as {call?:NearContractCall;networkId?:string;ownerId?:string}|undefined;
  if(!savedHash && wallet.address && saved?.call && saved.ownerId===wallet.address && saved.networkId===getNearNetwork().networkId) {
   const prior=pendingSubmission(wallet.address);
   if(prior?.contractId===saved.call.contractId && prior.methodName===saved.call.methodName && JSON.stringify(prior.args)===JSON.stringify(saved.call.args)) {
    savedHash=prior.hash;localStorage.setItem(key,savedHash);
   }
  }
  setHash(savedHash);
 },[key,proposal.result,wallet.address]);
 const verify=async(transactionHash=hash)=>{
  if(!transactionHash)throw new Error("No native transaction has been submitted for this proposal");
  const result=await workspaceFetch<AgentProposal>("/api/agent-actions","POST",{action:"verify",id:proposal.id,transactionHash});
  if(result.status!=="completed")throw new Error("Native authorization is still awaiting final verification");
  if(wallet.address && pendingSubmission(wallet.address)?.hash===transactionHash)await reconcilePendingSubmission(wallet.address);
  localStorage.removeItem(key);setStatus("Verified on NEAR and recorded.");onUpdated();
 };
 const authorize=async()=>{
  if(submitting.current)return;submitting.current=true;setBusy(true);setError("");
  try {
   if(!wallet.address){await wallet.connect();return;}
   let transactionHash=localStorage.getItem(key);
   if(!transactionHash) {
    const prepared=await workspaceFetch<{call:NearContractCall;networkId:string;ownerId:string}>("/api/agent-actions","POST",{action:"confirm",id:proposal.id});
    if(prepared.networkId!==getNearNetwork().networkId || prepared.ownerId!==wallet.address)throw new Error("Sign in with the configured native vault owner");
    const prior=pendingSubmission(wallet.address);
    if(prior && prior.contractId===prepared.call.contractId && prior.methodName===prepared.call.methodName && JSON.stringify(prior.args)===JSON.stringify(prepared.call.args))transactionHash=prior.hash;
    else {dialog.current?.close();transactionHash=await wallet.callContract(prepared.call);}
    localStorage.setItem(key,transactionHash);setHash(transactionHash);
   }
   await verify(transactionHash);
  }catch(failure){setError(failure instanceof Error?failure.message:"Native authorization could not be verified. Check the saved hash before retrying.");}
  finally{dialog.current?.showModal();submitting.current=false;setBusy(false);}
 };
 return <dialog ref={dialog} aria-labelledby="wallet-review-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-primary-divider bg-background p-6 text-text-primary shadow-[0_34px_70px_-26px_rgba(20,32,64,0.32)] ring-[10px] ring-[#f1f2f4] backdrop:bg-app-background/60 backdrop:backdrop-blur-sm"><ReviewHeading id="wallet-review-title" title={names[action]} onClose={onClose} disabled={busy}/><p className="mt-3 text-[14px]">{getNearNetwork().name}. Review the native vault action before authorizing it with Web3Auth.</p>{typeof displayedAccount==="string"&&<p className="my-4 break-all text-[14px]">NEAR account: {displayedAccount}</p>}{error&&<p role="alert" className="mt-3 text-[14px] text-red-600">{error}</p>}{status&&<p role="status" className="mt-3 text-[14px]">{status}</p>}{hash&&<a href={nearTransactionUrl(hash)} target="_blank" rel="noreferrer" className="mt-3 block break-all text-primary-blue">View submitted transaction</a>}<div className="mt-6 flex flex-wrap gap-3"><FinanceButton disabled={busy||!!status} onClick={()=>void authorize()} className="rounded-xl bg-[#1b1b1b] px-5 py-3 text-[14px] text-white disabled:opacity-50">{busy?"Waiting for authorization…":hash?"Check submitted authorization":"Authorize with Web3Auth"}</FinanceButton><FinanceButton disabled={busy||!hash} onClick={()=>void verify().catch(failure=>setError(failure.message))} className="rounded-xl border border-primary-divider px-4 py-3 text-[14px]">Check status</FinanceButton></div></dialog>;
}
