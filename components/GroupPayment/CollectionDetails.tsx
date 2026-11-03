"use client";

import Link from "next/link";
import type { GroupCollection } from "@/types/collections";
import toast from "react-hot-toast";

export default function CollectionDetails({ collection }: { collection: GroupCollection }) {
  const paid = collection.members.filter(member => member.paid).length;
  const progress = Math.round(paid / collection.members.length * 100);
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(`${window.location.origin}/payment/${code}`); toast.success("Payment link copied"); }
    catch { toast.error("Open the payment link to copy it from your browser"); }
  }
  return <section aria-label="Collection details" className="min-w-0 overflow-hidden rounded-2xl border border-primary-divider bg-background">
    <div className="border-b border-primary-divider p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Collection details</p>
      <h3 className="mt-1 text-xl font-semibold">{collection.title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-app-background p-3"><p className="text-xs text-text-secondary">Total requested</p><p className="num mt-1 text-lg">{collection.amount} USDC</p></div>
        <div className="rounded-xl bg-app-background p-3"><p className="text-xs text-text-secondary">Contributors paid</p><p className="num mt-1 text-lg">{paid} / {collection.members.length}</p></div>
        <div className="rounded-xl bg-app-background p-3"><p className="text-xs text-text-secondary">Collection status</p><p className="mt-1 text-lg">{paid === collection.members.length ? "Complete" : paid ? "Partially paid" : "Awaiting payment"}</p></div>
      </div>
      <div role="progressbar" aria-label="Contributors paid" aria-valuenow={paid} aria-valuemin={0} aria-valuemax={collection.members.length} className="mt-4 h-2 overflow-hidden rounded-full bg-app-background"><div className="h-full rounded-full bg-primary-blue" style={{ width: `${progress}%` }} /></div>
    </div>
    <div className="space-y-2 p-4 sm:p-5">
      <h4 className="text-sm font-semibold">Contributors</h4>
      {collection.members.map(member => <div key={member.linkCode} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-divider p-3">
        <div className="min-w-0"><p className="font-medium">{member.name}</p><p className="num text-sm text-text-secondary">{member.amount} USDC</p>{member.address && <p className="break-all font-mono text-xs text-text-secondary">{member.address}</p>}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className={member.paid ? "rounded-full border border-badge-success-border bg-badge-success-background px-2 py-1 text-badge-success-text" : "rounded-full border border-badge-awaiting-border bg-badge-awaiting-background px-2 py-1 text-badge-awaiting-text"}>{member.paid ? "Paid" : "Pending"}</span><Link href={`/payment/${member.linkCode}`} className="text-primary-blue underline">Open link</Link><button type="button" onClick={() => void copy(member.linkCode)} className="text-primary-blue underline">Copy link</button></div>
        {member.paid && member.transactionHash && <p className="w-full break-all font-mono text-xs text-text-secondary">NEAR transaction: {member.transactionHash}</p>}
      </div>)}
    </div>
  </section>;
}
