"use client";

import { useEffect, useState } from "react";

type Checkout = {
  orderId: string; sourceAmountUnits: string; minimumReceivedUnits: string;
  recipient: string; depositAddress: string; refundTo: string;
  expiresAt: string; status: string; destinationTransactionHash: string | null; refundTransactionHash?: string | null;
  timeline?: { status: string; transactionHash: string | null; createdAt: string }[];
};
const baseUsdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const amount = (units: string) => {
  const value = BigInt(units);
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, "0")}`;
};
const label = (status: string) => status === "refund_verified" ? "Refund verified on Base" : status === "refunded" ? "Refund reported by provider (check Base wallet)" :
  status === "provider_success_unverified" ? "Checking final NEAR receipt" :
  status === "failed" ? "Swap failure reported by provider" : status.replaceAll("_", " ");

export default function BaseUsdcCheckout({ code }: { code: string }) {
  const [available, setAvailable] = useState(false);
  const [refundTo, setRefundTo] = useState("");
  const [order, setOrder] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const raw = sessionStorage.getItem(`settlbox-base-checkout:${code}`);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Checkout;
      if (typeof saved.orderId === "string" && saved.orderId.startsWith(`${code}:`) && typeof saved.status === "string") setOrder(saved);
    } catch { sessionStorage.removeItem(`settlbox-base-checkout:${code}`); }
  }, [code]);
  useEffect(() => {
    if (order) sessionStorage.setItem(`settlbox-base-checkout:${code}`, JSON.stringify(order));
  }, [code, order]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/payment-links/${encodeURIComponent(code)}/intents?availability=1`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : { available: false })
      .then(value => { if (alive) setAvailable(value.available === true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [code]);
  useEffect(() => {
    if (!order || ["confirmed", "refund_verified", "failed"].includes(order.status)) return;
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/payment-links/${encodeURIComponent(code)}/intents?orderId=${encodeURIComponent(order.orderId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Status is temporarily unavailable");
        const next = await response.json() as Checkout;
        if (alive) { setOrder(next); setError(""); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "Status is temporarily unavailable"); }
    };
    const timer = setInterval(() => void poll(), 6000);
    return () => { alive = false; clearInterval(timer); };
  }, [code, order?.orderId, order?.status]);
  if (!available) return null;
  async function quote() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/payment-links/${encodeURIComponent(code)}/intents`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refundTo }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Base USDC quote is unavailable");
      setOrder(result as Checkout);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Base USDC quote is unavailable"); }
    finally { setBusy(false); }
  }
  return <section className="w-full rounded-xl border border-primary-divider bg-background p-5 text-text-primary space-y-4" aria-label="Pay with Base USDC">
    <h2 className="text-lg font-semibold">Pay with Base USDC</h2>
    {!order ? <>
      <p className="text-sm text-text-secondary">Get an exact quote to deliver USDC on NEAR. Enter the Base address that should receive any refund.</p>
      <label className="block text-sm">Base refund address
        <input className="mt-1 w-full rounded-lg border border-primary-divider bg-background p-3 font-mono text-sm" value={refundTo} onChange={event => setRefundTo(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
      </label>
      <button type="button" className="rounded-lg bg-primary-blue px-4 py-2 text-white disabled:opacity-50" disabled={busy || !/^0x[a-fA-F0-9]{40}$/.test(refundTo)} onClick={() => void quote()}>{busy ? "Getting quote…" : "Get Base USDC quote"}</button>
    </> : <>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <span className="text-text-secondary">Send on Base</span><strong className="text-right num">{amount(order.sourceAmountUnits)} USDC</strong>
        <span className="text-text-secondary">Receive on NEAR</span><strong className="text-right num">At least {amount(order.minimumReceivedUnits)} USDC</strong>
        <span className="text-text-secondary">Status</span><strong className="text-right">{label(order.status)}</strong>
      </div>
      <div className="space-y-2 text-sm break-all">
        <p>Base USDC contract <code className="font-mono">{baseUsdc}</code></p>
        <p>Deposit address <code className="font-mono">{order.depositAddress}</code></p>
        <button type="button" className="underline text-primary-blue" onClick={() => void navigator.clipboard.writeText(order.depositAddress)}>Copy deposit address</button>
        <p>Refund address <code className="font-mono">{order.refundTo}</code></p>
        <p>Quote expires {new Date(order.expiresAt).toLocaleString()}</p>
      </div>
      {order.status === "awaiting_deposit" && (Date.parse(order.expiresAt) > Date.now()
        ? <p className="text-sm text-text-secondary">Send the exact USDC amount from your Base wallet before the quote expires. Keep this page open to see settlement. A deposit alone does not confirm payment.</p>
        : <p className="text-sm text-red-600">This quote has expired. Do not send funds to its deposit address. Wait for its final status before requesting another quote.</p>)}
      {order.status === "confirmed" && order.destinationTransactionHash && <p className="text-sm">Final NEAR transfer verified. Transaction: <a className="underline text-primary-blue break-all" href={`https://nearblocks.io/txns/${encodeURIComponent(order.destinationTransactionHash)}`} target="_blank" rel="noreferrer">{order.destinationTransactionHash}</a></p>}
      {order.status === "refund_verified" && order.refundTransactionHash && <p className="text-sm">Base USDC refund transfer verified. Transaction: <a className="underline text-primary-blue break-all" href={`https://basescan.org/tx/${encodeURIComponent(order.refundTransactionHash)}`} target="_blank" rel="noreferrer">{order.refundTransactionHash}</a></p>}
      {["refunded", "failed"].includes(order.status) && <p className="text-sm text-text-secondary">This quote did not complete. The source-chain refund has not been independently verified here. Check your Base wallet before requesting another quote.</p>}
      {order.status === "refund_verified" && <button type="button" className="underline text-primary-blue" onClick={() => { sessionStorage.removeItem(`settlbox-base-checkout:${code}`); setOrder(null); }}>Request another quote</button>}
      {!!order.timeline?.length && <details className="border-t border-primary-divider pt-3 text-sm"><summary className="cursor-pointer">Settlement timeline</summary>
        <ol className="mt-2 space-y-2">{order.timeline.map((event, index) => <li key={`${index}-${event.createdAt}`} className="flex flex-wrap justify-between gap-2"><span>{label(event.status)}</span><time className="text-text-secondary">{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol>
      </details>}
    </>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
