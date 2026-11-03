"use client";
import { useState, type FormEvent } from "react";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { formatAmount, parseAmount } from "@/services/near/amount";
import { assertNearAccountId } from "@/services/near/account-id";
import { createNearReader, assertFinalSuccess } from "@/services/near/rpc";
import { nearTransactionUrl } from "@/services/near/network";
import { pendingSubmission, reconcilePendingSubmission } from "@/services/wallet/web3auth-near";

export function NearTransferForm() {
  const wallet = useNearWallet();
  const [recipient, setRecipient] = useState(""); const [amount, setAmount] = useState("");
  const [review, setReview] = useState<{ sender: string; recipient: string; amount: string } | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null); const [kind, setKind] = useState("Transfer");
  const [settlementStatus, setStatus] = useState<"submitted" | "confirmed" | "failed">("submitted");
  const [checking, setChecking] = useState(false);
  async function checkSettlement() {
    if (!hash || !wallet.address || checking) return;
    setChecking(true); setError(null);
    try {
      const receipt = await createNearReader().getReceipt(hash, wallet.address);
      if ("Failure" in receipt.status) { setStatus("failed"); await reconcilePendingSubmission(wallet.address); return; }
      assertFinalSuccess(receipt); setStatus("confirmed");
      await reconcilePendingSubmission(wallet.address); await wallet.refreshBalance();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Settlement is unavailable. Check the original transaction again."); }
    finally { setChecking(false); }
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || hash) return;
    try {
      assertNearAccountId(recipient.trim());
      if (parseAmount(amount) <= 0n) throw new Error("Enter a positive USDC amount");
      if (!wallet.address) throw new Error("Connect your Web3Auth wallet before reviewing a transfer");
      setReview({ sender: wallet.address, recipient: recipient.trim(), amount }); setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the transfer details"); }
  }
  async function submit() {
    if (!review || pending || hash) return;
    if (wallet.address !== review.sender) { setReview(null); setError("Wallet account changed. Review the transfer again."); return; }
    setPending(true); setError(null); setHash(null); setStatus("submitted"); setKind("Transfer");
    try { setHash(await wallet.sendUsdc(review.recipient, review.amount)); setReview(null); }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : "Payment submission failed"; setError(message);
      if (wallet.address) { const saved = pendingSubmission(wallet.address); if (saved) { setHash(saved.hash); setKind(message.startsWith("Recipient storage registration") ? "Storage registration" : "Previous transaction"); } }
    } finally { setPending(false); }
  }
  return <section className="w-full max-w-xl space-y-5 p-8 text-text-primary">
    <h1 className="text-2xl font-semibold">Send USDC</h1>
    <p className="text-text-secondary">Send from your Web3Auth wallet on {wallet.chainName}. Review the recipient and amount before approving.</p>
    {wallet.address && <div className="space-y-2 rounded-lg border border-primary-divider p-3 text-sm"><p className="text-text-secondary">Your NEAR account</p><p className="break-all font-mono">{wallet.address}</p><button type="button" className="text-primary-blue" onClick={() => void navigator.clipboard.writeText(wallet.address!).catch(() => setError("Copy the account ID shown above"))}>Copy account ID</button></div>}
    <p>Wallet balance: {wallet.balanceBaseUnits === null ? "Unavailable" : `${formatAmount(BigInt(wallet.balanceBaseUnits))} USDC`}</p>
    <p className="text-sm text-text-secondary">NEAR for gas and storage: {wallet.nativeBalanceBaseUnits === null ? "Unavailable" : formatAmount(BigInt(wallet.nativeBalanceBaseUnits), 24)}</p>
    {wallet.balanceError && <p role="status" className="text-sm text-text-secondary">{wallet.balanceError}</p>}
    {!wallet.address && <button onClick={() => void wallet.connect().catch(failure => setError(failure.message))} disabled={wallet.isConnecting} className="rounded-lg bg-blue-600 px-4 py-3 text-white">{wallet.isConnecting ? "Connecting…" : "Continue with Web3Auth"}</button>}
    {!review && !hash && <form onSubmit={prepare} className="space-y-4">
      <label className="block">Recipient account ID<input required value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="recipient.testnet or implicit account ID" className="mt-1 w-full rounded-lg border border-primary-divider bg-background p-3" /></label>
      <label className="block">Amount in USDC<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" className="num mt-1 w-full rounded-lg border border-primary-divider bg-background p-3" /></label>
      <button disabled={pending || !wallet.address} className="rounded-lg bg-primary-blue px-4 py-3 text-white disabled:opacity-50">Review transfer</button>
    </form>}
    {review && !hash && <section aria-label="Transfer review" className="overflow-hidden rounded-2xl border border-primary-divider bg-background">
      <h2 className="border-b border-primary-divider bg-app-background px-4 py-3 text-lg font-semibold">Transaction overview</h2>
      <dl className="divide-y divide-primary-divider text-sm"><div className="flex justify-between gap-4 p-4"><dt className="text-text-secondary">From</dt><dd className="max-w-[70%] break-all text-right font-mono text-xs">{review.sender}</dd></div><div className="flex justify-between gap-4 p-4"><dt className="text-text-secondary">To</dt><dd className="max-w-[70%] break-all text-right font-mono text-xs">{review.recipient}</dd></div><div className="flex justify-between gap-4 p-4"><dt className="text-text-secondary">Network</dt><dd>{wallet.chainName}</dd></div><div className="flex justify-between gap-4 p-4"><dt className="text-text-secondary">Asset</dt><dd className="inline-flex items-center gap-2"><img src="/token/usdc.svg" alt="" className="h-4 w-4" />USDC</dd></div><div className="flex justify-between gap-4 p-4"><dt className="text-text-secondary">Amount</dt><dd className="num font-semibold">{review.amount} USDC</dd></div></dl>
      <p className="px-4 py-3 text-xs text-text-secondary">The wallet may first request separate recipient storage registration. A transaction is complete only after its NEAR result is verified.</p>
      <div className="flex flex-wrap justify-between gap-3 p-4"><button type="button" disabled={pending} onClick={() => setReview(null)} className="rounded-lg border border-primary-divider px-4 py-2 text-sm disabled:opacity-50">Back to edit</button><button type="button" disabled={pending || !wallet.address} onClick={() => void submit()} className="rounded-lg bg-primary-blue px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Awaiting authorization…" : "Continue to wallet"}</button></div>
    </section>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {hash && <div className="space-y-3"><p role="status">{kind} {settlementStatus}. {kind === "Storage registration" && settlementStatus === "confirmed" && "No USDC was sent. Review the transfer again to submit it."} <a className="text-blue-600" target="_blank" rel="noreferrer" href={nearTransactionUrl(hash)}>View in explorer</a></p>{settlementStatus === "submitted" && <button type="button" disabled={checking} onClick={() => void checkSettlement()} className="rounded-lg border px-4 py-2 disabled:opacity-50">{checking ? "Checking…" : "Check settlement"}</button>}{settlementStatus !== "submitted" && <button type="button" disabled={checking || pending} onClick={() => { setHash(null); setReview(null); setError(null); }} className="rounded-lg border px-4 py-2 disabled:opacity-50">{kind === "Storage registration" && settlementStatus === "confirmed" ? "Review transfer again" : "Start another transfer"}</button>}</div>}
  </section>;
}
