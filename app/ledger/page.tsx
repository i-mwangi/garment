import { openBusinessRecords, type VerifiedSaleEvent, type VerifiedPayoutEvent } from "@/services/server/business-records";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { formatAmount } from "@/services/near/amount";
import { getNearNetwork, nearTransactionUrl } from "@/services/near/network";
import { openBusinessPolicy } from "@/services/server/business-policy";

export const dynamic = "force-dynamic";

function explorer(event: VerifiedSaleEvent | VerifiedPayoutEvent): string | null {
  return event.networkId === "testnet" || event.networkId === "mainnet"
    ? nearTransactionUrl(event.transactionHash, getNearNetwork(event.networkId))
    : null;
}

export default function PublicLedgerPage() {
  let sales: VerifiedSaleEvent[] = [];
  let payouts: VerifiedPayoutEvent[] = [];
  let inference: Record<string, unknown>[] = [];
  let unavailable = false;
  try {
    const companyId = readNearTreasuryIdentity().companyId;
    const records = openBusinessRecords();
    try { sales = records.listVerifiedSales(companyId); payouts = records.listVerifiedPayouts(companyId); }
    finally { records.close(); }
    const policy = openBusinessPolicy();
    try { inference = policy.inferenceCharges(companyId); }
    finally { policy.close(); }
  } catch { unavailable = true; }
  const entries = [
    ...sales.map(sale => ({ kind: "Sale", at: sale.settledAt, amountUnits: sale.amountUnits, currency: "USDC", network: `NEAR ${sale.networkId === "testnet" ? "Testnet" : "Mainnet"}`, proofId: sale.transactionHash, proofUrl: explorer(sale) })),
    ...payouts.map(payout => ({ kind: "Treasury payout", at: payout.recordedAt, amountUnits: payout.amountUnits, currency: "USDC", network: `NEAR ${payout.networkId === "testnet" ? "Testnet" : "Mainnet"}`, proofId: payout.transactionHash, proofUrl: explorer(payout) })),
    ...inference.map(charge => ({ kind: "AI inference cost", at: String(charge.recorded_at), amountUnits: String(charge.actual_units), currency: "USD", network: "NEAR AI Cloud", proofId: String(charge.response_id), proofUrl: null })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);

  return <main className="min-h-screen bg-app-background px-4 py-8 text-text-primary md:px-8">
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <a href="/" aria-label="Settlbox home"><img src="/logo/settlbox-wordmark.svg" alt="Settlbox" className="h-8 w-auto dark:hidden" /><img src="/logo/settlbox-light.svg" alt="Settlbox" className="hidden h-8 w-auto dark:block" /></a>
        <span className="rounded-full border border-primary-divider bg-background px-3 py-1 text-xs text-text-secondary">Public evidence</span>
      </header>
      <section className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">Business ledger</h1><p className="max-w-2xl text-sm leading-6 text-text-secondary">Verified NEAR USDC collections and treasury payouts have transaction links. Recorded AI inference charges show provider response IDs; they are application cost records, not on-chain payments. Revenue sharing is disabled.</p></section>
      <section aria-label="Business activity" className="overflow-hidden rounded-2xl border border-primary-divider bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-divider px-5 py-4"><h2 className="font-semibold">Recorded activity</h2><span className="text-xs text-text-secondary">{unavailable ? "Unavailable" : `${entries.length} shown`}</span></div>
        {unavailable ? <p role="status" className="p-5 text-sm text-text-secondary">The ledger is temporarily unavailable.</p> : entries.length === 0 ? <p className="p-5 text-sm text-text-secondary">No verified collections, treasury payouts or AI costs have been recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-app-background text-text-secondary"><tr><th scope="col" className="px-5 py-3 font-medium">Activity</th><th scope="col" className="px-5 py-3 font-medium">Recorded</th><th scope="col" className="px-5 py-3 font-medium">Amount</th><th scope="col" className="px-5 py-3 font-medium">Network / service</th><th scope="col" className="px-5 py-3 font-medium">Evidence</th></tr></thead><tbody>{entries.map(entry => <tr key={`${entry.kind}:${entry.proofId}`} className="border-t border-primary-divider"><td className="whitespace-nowrap px-5 py-4">{entry.kind}</td><td className="whitespace-nowrap px-5 py-4"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time></td><td className="num whitespace-nowrap px-5 py-4">{formatAmount(BigInt(entry.amountUnits))} {entry.currency}</td><td className="whitespace-nowrap px-5 py-4">{entry.network}</td><td className="px-5 py-4 font-mono text-xs">{entry.proofUrl ? <a href={entry.proofUrl} target="_blank" rel="noreferrer" className="text-primary-blue underline" title={entry.proofId}>{entry.proofId.slice(0, 12)}…</a> : <span className="text-text-secondary" title={entry.proofId}>Provider record</span>}</td></tr>)}</tbody></table></div>}
      </section>
      <p className="text-xs leading-5 text-text-secondary">Recorded time is when Settlbox saved the event. Entries contain no customer names, payer addresses, prompts, invoice descriptions or receipt files. NEAR transaction links show chain evidence; AI costs need separate provider billing verification and have no chain proof here.</p>
    </div>
  </main>;
}
