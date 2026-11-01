"use client";

import Link from "next/link";
import { NearNetworkIcon } from "@/components/Common/NearNetworkIcon";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatAmount } from "@/services/near/amount";
import type { NativeApprovalPolicy as ApprovalPolicy, NativePaymentExecution as PaymentExecution, NativePaymentIntent as PaymentIntent, NativeWalletReference as WalletReference } from "@/types/near-finance";
import {useNearWallet} from "@/contexts/NearWalletProvider";
import {authorizeNativeTreasuryPayment} from "@/services/api/treasury";
import {getNearNetwork,nearTransactionUrl} from "@/services/near/network";

interface TreasuryView {
  wallet: WalletReference;
  balanceBaseUnits: string;
  policy: ApprovalPolicy;
  payments: { intent: PaymentIntent; execution: PaymentExecution }[];
}

export default function TestnetTreasuryPage() {
  const wallet=useNearWallet();
  const [treasury, setTreasury] = useState<TreasuryView | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [execution, setExecution] = useState<PaymentExecution | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/treasury", { cache: "no-store" });
    if (response.status === 401) { setUnauthorized(true); return; }
    if (!response.ok) throw new Error("Treasury is unavailable. Check server configuration.");
    const view: TreasuryView = await response.json();
    setTreasury(view);
    setUnauthorized(false);
    setRecipient(previous => previous || view.policy.allowedRecipients[0] || "");
    const pendingKey = sessionStorage.getItem("settlbox_pending_payment");
    if (pendingKey && view.payments.some(payment => payment.intent.id === pendingKey && payment.execution.status !== "ready")) {
      sessionStorage.removeItem("settlbox_pending_payment");
      setUncertain(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(failure => setError(failure instanceof Error ? failure.message : "Treasury could not load"));
    if (sessionStorage.getItem("settlbox_pending_payment")) setUncertain(true);
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const key = sessionStorage.getItem("settlbox_pending_payment") || crypto.randomUUID();
    sessionStorage.setItem("settlbox_pending_payment", key);
    try {
      const response = await fetch("/api/treasury/payments", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ recipient, amount }),
      });
      if (!response.ok) throw new Error("Payment did not complete. Check the payment list before attempting another payment.");
      const result: { execution: PaymentExecution } = await response.json();
      setExecution(result.execution);
      sessionStorage.removeItem("settlbox_pending_payment");
      await refresh();
    } catch (failure) {
      setUncertain(true);
      setError(failure instanceof Error ? failure.message : "Payment status is uncertain");
    } finally { busy.current = false; setPending(false); }
  }

  async function cancelPendingDraft() {
    const id=sessionStorage.getItem("settlbox_pending_payment");if(!id || busy.current)return;
    busy.current=true;setPending(true);setError(null);
    try {
      const response=await fetch(`/api/business-records/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel"})});
      const result=await response.json();
      if(!response.ok && !(response.status===404 && result.error==="Business record not found"))throw new Error(result.error || "The payment already has a reserved workflow; reconcile it before changing instructions");
      sessionStorage.removeItem("settlbox_pending_payment");setUncertain(false);await refresh();
    }catch(error){setError(error instanceof Error?error.message:"Draft cancellation could not be verified");}
    finally{busy.current=false;setPending(false);}
  }
  async function approve(id: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await authorizeNativeTreasuryPayment(id,wallet);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Approval failed"); }
    finally { busy.current = false; setPending(false); }
  }

  return <section className="mx-auto w-full max-w-3xl space-y-6 p-8 text-text-primary">
    <h1 className="flex items-center gap-3 text-2xl font-semibold"><NearNetworkIcon className="h-7 w-7" />Settlbox · {getNearNetwork().name} treasury</h1>
    <p className="text-text-secondary">Company payments use native USDC and on-chain vault spending rules.</p>
    {unauthorized && <Link href="/operator" className="text-blue-600">Authorize workspace access</Link>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {treasury && <>
      <div className="rounded-xl border p-5">
        <p className="break-all text-sm">Treasury wallet: {treasury.wallet.address}</p>
        <p className="mt-3 text-2xl font-semibold">{formatAmount(BigInt(treasury.balanceBaseUnits))} USDC</p>
        <p className="mt-2 text-sm text-text-secondary">Transaction limit {formatAmount(BigInt(treasury.policy.maxPaymentBaseUnits))} USDC · Daily limit {formatAmount(BigInt(treasury.policy.dailyLimitBaseUnits))} USDC</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Create payment</h2>
        <label className="block">Approved recipient
          <input value={recipient} onChange={event=>setRecipient(event.target.value)} disabled={pending || uncertain} placeholder="recipient.testnet" required className="mt-2 w-full rounded-lg border p-3" />
        </label>
        <label className="block">Amount in USDC<input required inputMode="decimal" value={amount} disabled={pending || uncertain} onChange={event => setAmount(event.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label>
        <button disabled={pending || !recipient} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{pending ? "Processing…" : uncertain ? "Retry original request" : "Create payment"}</button>
        {execution && <p role="status">Payment {execution.status.replaceAll("_", " ")}.</p>}
        {uncertain && <p role="status">A previous request is unresolved. Retry its original identity or cancel its unpaid draft before changing the terms.</p>}
        {uncertain&&<button type="button" disabled={pending} onClick={()=>void cancelPendingDraft()} className="text-blue-600">Cancel unpaid draft</button>}
      </form>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Payment history</h2><button type="button" onClick={() => void refresh().catch(() => setError("Status refresh failed"))} className="text-blue-600">Refresh status</button></div>
        {treasury.payments.length === 0 && <p>No payments yet.</p>}
        {treasury.payments.map(payment => <article key={payment.intent.id} className="space-y-2 rounded-lg border p-4">
          <p>{formatAmount(BigInt(payment.intent.amount.baseUnits))} USDC · {payment.execution.status.replaceAll("_", " ")}</p>
          <p className="break-all text-sm text-text-secondary">To {payment.intent.recipient}</p>
          {payment.execution.status === "awaiting_approval" && <button disabled={pending} onClick={() => void approve(payment.intent.id)} className="text-blue-600">Approve payment</button>}
          {payment.execution.transactionHash && <a href={nearTransactionUrl(payment.execution.transactionHash)} target="_blank" rel="noreferrer" className="text-blue-600">View settlement</a>}
        </article>)}
      </div>
    </>}
  </section>;
}
