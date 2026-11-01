"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { giftRequest, useGiftEscrow } from "@/services/api/gift";
import { giftActionCall } from "@/services/near/contract-actions";
import { createNearReader } from "@/services/near/rpc";
import { nearTransactionUrl } from "@/services/near/network";
import { verifyGiftAction } from "@/services/near/gift-settlement";
import { pendingSubmission, reconcilePendingSubmission } from "@/services/wallet/web3auth-near";
import type { NearGift } from "@/types/near-gift";
import toast from "react-hot-toast";

export function GiftAction({gift}:{gift:NearGift}) {
  const wallet=useNearWallet(),escrow=useGiftEscrow(),client=useQueryClient();
  const [busy,setBusy]=useState(false),[hash,setHash]=useState<string|null>(null);
  const submitting=useRef(false);
  const claim=gift.status==="active" && wallet.address===gift.recipient;
  const refund=gift.status==="expired" && wallet.address===gift.sender;
  const key=`settlbox:near:gift-action:${gift.networkId}:${gift.escrowId}:${gift.id}:${wallet.address}`;
  async function execute() {
    if(submitting.current || !escrow.data || !wallet.address)return;
    submitting.current=true;setBusy(true);
    try {
      if(escrow.data.accountId!==gift.escrowId || escrow.data.networkId!==gift.networkId)throw new Error("Gift belongs to another native deployment");
      let transactionHash=localStorage.getItem(key);
      const prior=pendingSubmission(wallet.address);
      if(!transactionHash && prior && prior.contractId===gift.escrowId && prior.args?.gift_id===gift.id && ["claim_gift","refund_gift"].includes(prior.methodName||"")) transactionHash=prior.hash;
      if(!transactionHash) {
        if(!claim && !refund)throw new Error("This wallet cannot claim or refund the current gift state");
        const reader=createNearReader();
        const registered=await reader.view<unknown>(escrow.data.tokenId,"storage_balance_of",{account_id:wallet.address});
        if(!registered) {
          if(prior)await reconcilePendingSubmission(wallet.address);
          const bounds=await reader.view<{min:string}>(escrow.data.tokenId,"storage_balance_bounds",{});
          const registration=await wallet.callContract({contractId:escrow.data.tokenId,methodName:"storage_deposit",args:{account_id:wallet.address,registration_only:true},deposit:bounds.min});
          throw new Error(`USDC storage registration submitted: ${registration}. Check confirmation, then review the gift again.`);
        }
        if(prior)await reconcilePendingSubmission(wallet.address);
        transactionHash=await wallet.callContract(giftActionCall(gift.escrowId,gift.id,claim?"claim":"refund"));
      }
      localStorage.setItem(key,transactionHash);setHash(transactionHash);
      const outcome=await createNearReader().getReceipt(transactionHash,wallet.address);
      if(outcome.final_execution_status==="FINAL" && ("Failure" in outcome.status || outcome.receipts_outcome.some(receipt=>"Failure" in receipt.outcome.status))) {
        const restored=await giftRequest<NearGift>(`/${encodeURIComponent(gift.id)}`);
        if(restored.status==="active" || restored.status==="expired") {
          // The finalized failure and restored escrow state permit a NEW explicit
          // review on the next click, never an automatic second signature here.
          if(pendingSubmission(wallet.address)?.hash===transactionHash) {
            try {await reconcilePendingSubmission(wallet.address);}catch{/* terminal failure was checked above */}
          }
          localStorage.removeItem(key);setHash(null);
          await client.invalidateQueries({queryKey:["gift",gift.id]});
          throw new Error("Gift delivery failed and the gift is available again. Review the claim or refund before retrying.");
        }
      }
      const expectedStatus=verifyGiftAction(gift,outcome,{hash:transactionHash,signerId:wallet.address});
      const latest=await giftRequest<NearGift>(`/${encodeURIComponent(gift.id)}`);
      if(latest.status!==expectedStatus)throw new Error(`Native gift is ${latest.status}; token delivery is not confirmed. Check again before retrying.`);
      await reconcilePendingSubmission(wallet.address);
      localStorage.removeItem(key);setHash(null);
      await Promise.all([client.invalidateQueries({queryKey:["gifts"]}),client.invalidateQueries({queryKey:["gift",gift.id]}),wallet.refreshBalance()]);
      toast.success("Native gift delivery confirmed");
    }catch(error){toast.error(error instanceof Error?error.message:"Gift transaction could not be verified");}
    finally{submitting.current=false;setBusy(false);}
  }
  if(gift.status==="claimed" || gift.status==="refunded")return <span>{gift.status}</span>;
  if(!wallet.address)return <button onClick={()=>void wallet.connect().catch(error=>toast.error(error.message))}>Sign in with the recipient or sender wallet</button>;
  return <div className="space-y-2">{escrow.error && <p role="alert">{escrow.error.message}</p>}{claim || refund || hash || gift.status==="claiming" || gift.status==="refunding"?<button disabled={busy || !escrow.data} onClick={()=>void execute()} className="rounded-lg bg-primary-blue px-4 py-2 text-white">{busy?"Confirming…":hash?"Check submitted transaction":claim?"Claim gift":refund?"Refund expired gift":"Check pending gift"}</button>:<p className="text-sm">{gift.status==="expired"?"The sender can refund this expired gift.":"Only the selected recipient wallet can claim this gift."}</p>}{hash && <a href={nearTransactionUrl(hash)} target="_blank" rel="noreferrer">View transaction</a>}</div>;
}
