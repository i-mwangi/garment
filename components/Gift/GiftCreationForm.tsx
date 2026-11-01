"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { giftRequest, useGiftEscrow } from "@/services/api/gift";
import { giftFundingCall } from "@/services/near/contract-actions";
import { assertNearAccountId, isNearAccountId } from "@/services/near/account-id";
import { parseAmount } from "@/services/near/amount";
import { getNearNetwork } from "@/services/near/network";
import { pendingSubmission, reconcilePendingSubmission } from "@/services/wallet/web3auth-near";
import toast from "react-hot-toast";

type PendingGift = {id:string;contract:string;recipient:string;amount:string;expiresAt:number;hash?:string};
export function GiftCreationForm() {
  const wallet=useNearWallet(),escrow=useGiftEscrow(),client=useQueryClient();
  const [pending,setPending]=useState<PendingGift|null>(null),[busy,setBusy]=useState(false);
  const sending=useRef(false);
  const storageKey=wallet.address?`settlbox:near:gift:${getNearNetwork().networkId}:${wallet.address}`:null;
  useEffect(()=>{
    setPending(null);if(!storageKey)return;
    try {const value=JSON.parse(localStorage.getItem(storageKey)||"null");if(value && /^[A-Za-z0-9_-]{1,128}$/.test(value.id) && isNearAccountId(value.recipient) && isNearAccountId(value.contract) && typeof value.amount==="string" && Number.isSafeInteger(value.expiresAt))setPending(value);}
    catch{toast.error("Saved native gift request could not be read");}
  },[storageKey]);
  async function fund(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(sending.current || !wallet.address || !storageKey || !escrow.data)return;
    sending.current=true;setBusy(true);
    try {
      const form=new FormData(event.currentTarget);
      const request:PendingGift=pending || {id:crypto.randomUUID(),contract:escrow.data.accountId,recipient:String(form.get("recipient")).trim(),amount:String(form.get("amount")).trim(),expiresAt:Math.floor(new Date(String(form.get("expiresAt"))).getTime()/1000)};
      if(request.contract!==escrow.data.accountId)throw new Error("Saved gift belongs to another native escrow");
      assertNearAccountId(request.recipient);
      if(!Number.isSafeInteger(request.expiresAt) || parseAmount(request.amount)<=0n)throw new Error("Enter a valid recipient, USDC amount and expiry");
      localStorage.setItem(storageKey,JSON.stringify(request));setPending({...request});
      const prior=pendingSubmission(wallet.address);
      if(!request.hash && prior) {
        if(prior.contractId!==escrow.data.tokenId || prior.methodName!=="ft_transfer_call" || typeof prior.args?.msg!=="string" || JSON.parse(prior.args.msg).gift_id!==request.id)throw new Error("Reconcile the previous wallet transaction before funding this gift");
        request.hash=prior.hash;
      }
      if(!request.hash) {
        if(request.expiresAt<=Date.now()/1000)throw new Error("Choose a future expiry before funding");
        request.hash=await wallet.callContract(giftFundingCall(escrow.data.tokenId,request.contract,{id:request.id,recipient:request.recipient,amount:request.amount,expiresAt:String(request.expiresAt)}));
      }
      localStorage.setItem(storageKey,JSON.stringify(request));setPending({...request});
      await giftRequest("","POST",{id:request.id,transactionHash:request.hash});
      await reconcilePendingSubmission(wallet.address);
      localStorage.removeItem(storageKey);setPending(null);
      await client.invalidateQueries({queryKey:["gifts"]});await wallet.refreshBalance();toast.success("Native NEAR gift funding confirmed");
    }catch(error){toast.error(error instanceof Error?error.message:"Gift funding could not be verified; check the saved transaction before retrying");}
    finally{sending.current=false;setBusy(false);}
  }
  return (
    <div className="relative space-y-4 overflow-hidden rounded-2xl border border-primary-divider bg-background p-6">
      <img
        src="/gift/generate-box-gift.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute right-6 top-4 h-20 opacity-20"
      />
      <h2 className="relative text-xl font-semibold">Create a Gift</h2>
      <p className="relative max-w-xl text-sm leading-5 text-text-secondary">
        USDC comes from your connected wallet. Only the selected recipient can
        claim. The sender can refund an unclaimed gift after expiry.
      </p>
      {escrow.error && (
        <p role="alert">
          {escrow.error.message}{" "}
          <button
            onClick={() => {
              void escrow.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!wallet.address ? (
        <button
          onClick={() => {
            void wallet.connect().catch((error) => toast.error(error.message));
          }}
        >
          Sign in with Web3Auth
        </button>
      ) : (
        <form onSubmit={fund} className="relative max-w-xl space-y-4">
          <fieldset disabled={busy || !!pending} className="space-y-4">
            <label className="block">
              Recipient NEAR account
              <input
                name="recipient"
                required
                minLength={2}
                maxLength={64}
                placeholder="recipient.testnet"
                className="block w-full rounded-lg border p-3"
              />
            </label>
            <label className="block">
              Amount (USDC)
              <input
                name="amount"
                required
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,6})?"
                className="block w-full rounded-lg border p-3"
              />
            </label>
            <label className="block">
              Expiry (your local time)
              <input
                name="expiresAt"
                type="datetime-local"
                required
                className="block w-full rounded-lg border p-3"
              />
            </label>
          </fieldset>
          {pending && (
            <p className="break-all">
              Saved request: {pending.amount} USDC to {pending.recipient}.
              Retrying checks this gift before funding again.
            </p>
          )}
          <button
            disabled={busy || !escrow.data}
            className="rounded-lg bg-primary-blue px-5 py-3 text-white"
          >
            {busy
              ? "Verifying gift…"
              : pending
                ? "Retry saved gift"
                : "Fund gift"}
          </button>
        </form>
      )}
    </div>
  );
}
