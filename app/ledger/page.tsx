import { openBusinessRecords, type VerifiedSaleEvent, type VerifiedPayoutEvent } from "@/services/server/business-records";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { formatAmount } from "@/services/near/amount";
import { getNearNetwork, nearTransactionUrl } from "@/services/near/network";

export const dynamic = "force-dynamic";

function explorer(event: VerifiedSaleEvent | VerifiedPayoutEvent): string | null {
  return event.networkId === "testnet" || event.networkId === "mainnet"
    ? nearTransactionUrl(event.transactionHash, getNearNetwork(event.networkId))
    : null;
}

export default function PublicLedgerPage() {
  let sales: VerifiedSaleEvent[] = [];
  let payouts: VerifiedPayoutEvent[] = [];
  let unavailable = false;
  try {
    const companyId = readNearTreasuryIdentity().companyId;
    const records = openBusinessRecords();
    try { sales = records.listVerifiedSales(companyId); payouts = records.listVerifiedPayouts(companyId); }
    finally { records.close(); }
  } catch { unavailable = true; }
  const entries = [
    ...sales.map(sale => ({ kind: "Sale", at: sale.settledAt, event: sale })),
    ...payouts.map(payout => ({ kind: "Treasury payout", at: payout.recordedAt, event: payout })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500);

  return <main className="min-h-screen bg-app-background px-4 py-8 text-text-primary md:px-8">
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <a href="/" aria-label="Settlbox home"><img src="/logo/settlbox-wordmark.svg" alt="Settlbox" className="h-8 w-auto dark:hidden" /><img src="/logo/settlbox-light.svg" alt="Settlbox" className="hidden h-8 w-auto dark:block" /></a>
        <span className="rounded-full border border-primary-divider bg-background px-3 py-1 text-xs text-text-secondary">Public evidence</span>
      </header>
      <section className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">Business ledger</h1><p className="max-w-2xl text-sm leading-6 text-text-secondary">Verified NEAR USDC invoice collections and native treasury payouts recorded by Settlbox. Each entry links to its NEAR transaction. Inference costs and revenue-share distributions are not yet represented.</p></section>
      <section aria-label="Verified business activity" className="overflow-hidden rounded-2xl border border-primary-divider bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-divider px-5 py-4"><h2 className="font-semibold">Verified activity</h2><span className="text-xs text-text-secondary">{unavailable ? "Unavailable" : `${entries.length} shown`}</span></div>
        {unavailable ? <p role="status" className="p-5 text-sm text-text-secondary">The ledger is temporarily unavailable.</p> : entries.length === 0 ? <p className="p-5 text-sm text-text-secondary">No verified collections or treasury payouts have been recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-app-background text-text-secondary"><tr><th scope="col" className="px-5 py-3 font-medium">Activity</th><th scope="col" className="px-5 py-3 font-medium">Recorded</th><th scope="col" className="px-5 py-3 font-medium">Amount</th><th scope="col" className="px-5 py-3 font-medium">Network</th><th scope="col" className="px-5 py-3 font-medium">Proof</th></tr></thead><tbody>{entries.map(({ kind, at, event }) => <tr key={event.transactionHash} className="border-t border-primary-divider"><td className="whitespace-nowrap px-5 py-4">{kind}</td><td className="whitespace-nowrap px-5 py-4"><time dateTime={at}>{new Date(at).toLocaleString()}</time></td><td className="num whitespace-nowrap px-5 py-4">{formatAmount(BigInt(event.amountUnits))} USDC</td><td className="whitespace-nowrap px-5 py-4">NEAR {event.networkId === "testnet" ? "Testnet" : "Mainnet"}</td><td className="px-5 py-4 font-mono text-xs">{explorer(event) ? <a href={explorer(event)!} target="_blank" rel="noreferrer" className="text-primary-blue underline" title={event.transactionHash}>{event.transactionHash.slice(0, 12)}…</a> : <span className="text-text-secondary">Unavailable</span>}</td></tr>)}</tbody></table></div>}
      </section>
      <p className="text-xs leading-5 text-text-secondary">The recorded time is when Settlbox saved the verified receipt, not the block timestamp. Entries contain no customer names, payer addresses, invoice descriptions, or receipt files. A transaction link lets you inspect the chain proof; this page is an application record, not an independent blockchain index.</p>
    </div>
  </main>;
}
