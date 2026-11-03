"use client";

import type { BusinessRecordInput } from "@/types/business";
import { formatAmount, parseAmount } from "@/services/near/amount";

export default function BatchReview({ payments, busy, retrying, onBack, onSave }: {
  payments: BusinessRecordInput[];
  busy: boolean;
  retrying: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const total = formatAmount(payments.reduce((sum, item) => sum + parseAmount(item.amount), 0n));
  return <section aria-label="Batch draft review" className="mx-auto w-full max-w-[900px] overflow-hidden rounded-3xl border border-primary-divider bg-base-container-main-background">
    <div className="border-b border-primary-divider px-5 py-4 text-center text-sm font-semibold">All payments · draft review</div>
    <div className="bg-base-container-sub-background p-3 sm:p-5">
      <div className="overflow-x-auto rounded-xl border border-primary-divider bg-background">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-app-background text-text-secondary"><tr><th scope="col" className="p-3">Message / vendor</th><th scope="col" className="p-3">To</th><th scope="col" className="p-3">Due</th><th scope="col" className="p-3">Type</th><th scope="col" className="p-3 text-right">Amount</th></tr></thead>
          <tbody>{payments.map((item, index) => <tr key={`${item.recipient}-${index}`} className="border-t border-primary-divider">
            <td className="p-3"><span className="block font-medium">{item.title}</span><span className="block text-xs text-text-secondary">{item.counterparty}</span></td>
            <td className="max-w-[220px] break-all p-3 font-mono text-xs">{item.recipient}</td>
            <td className="whitespace-nowrap p-3">{item.dueDate}</td>
            <td className="p-3"><span className="rounded-full border border-badge-awaiting-border bg-badge-awaiting-background px-2 py-1 text-xs text-badge-awaiting-text">Draft bill</span></td>
            <td className="whitespace-nowrap p-3 text-right num"><span className="inline-flex items-center gap-1"><img src="/token/usdc.svg" alt="" className="h-4 w-4" />{item.amount} USDC</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 border-b border-primary-divider px-5 py-3 text-sm"><span>Number of payments</span><span>{payments.length}</span></div>
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-semibold"><span>Total draft amount</span><span className="num">{total} USDC</span></div>
    <div className="border-t border-primary-divider px-5 py-3 text-sm text-text-secondary">Saving creates separate bill drafts. It does not queue, approve, or send a NEAR payment.</div>
    <div className="flex flex-wrap justify-between gap-3 px-5 pb-5 pt-2"><button type="button" disabled={busy || retrying} onClick={onBack} className="rounded-xl border border-primary-divider px-5 py-2 text-sm disabled:opacity-50">Back to batch</button><button type="button" disabled={busy} onClick={onSave} className="rounded-xl bg-primary-blue px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving drafts…" : retrying ? "Retry saving same drafts" : `Save ${payments.length} drafts`}</button></div>
  </section>;
}
