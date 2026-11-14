"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceFetch } from "@/presentation/services/api/seeded-workspace";
import FinanceButton from "@/presentation/components/Common/FinanceButton";
import type { BusinessPolicy } from "@/services/server/business-policy";

type PolicyResponse = { policy: BusinessPolicy; events: { actor: string; event: string; revision: number; created_at: string }[]; providerOverride: string; nearAiConfigured: boolean };

function PolicyEditor({ policy, nearAiConfigured, providerOverride }: { policy: BusinessPolicy; nearAiConfigured: boolean; providerOverride: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(policy);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const amount = (field: "maxSinglePaymentUsdc" | "maxDailyTreasuryUsdc" | "maxDailyInferenceUsd", label: string) =>
    <label className="flex flex-col gap-1 text-sm">{label}<input value={draft[field]} inputMode="decimal" onChange={event => setDraft(value => ({ ...value, [field]: event.target.value }))} className="rounded-lg border border-primary-divider bg-background p-2 num" /></label>;
  async function save() {
    setSaving(true); setMessage("");
    try {
      await workspaceFetch<PolicyResponse>("/api/business-policy", "POST", { policy: {
        stopped: draft.stopped,
        allowAutonomousDrafts: draft.allowAutonomousDrafts,
        allowAutonomousPayments: draft.allowAutonomousPayments,
        maxSinglePaymentUsdc: draft.maxSinglePaymentUsdc,
        maxDailyTreasuryUsdc: draft.maxDailyTreasuryUsdc,
        maxDailyInferenceUsd: draft.maxDailyInferenceUsd,
        aiProvider: draft.aiProvider,
        revenueSharingEnabled: draft.revenueSharingEnabled,
        revenueShareRecipients: draft.revenueShareRecipients,
      }, expectedRevision: policy.revision });
      await client.invalidateQueries({ queryKey: ["business-policy"] });
      await client.invalidateQueries({ queryKey: ["finance-automation"] });
      setMessage("Policy saved. Finance worker submissions follow the treasury limits. NEAR AI Cloud calls, when configured, reserve against the daily inference limit.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Policy could not be saved"); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.stopped} onChange={event => setDraft(value => ({ ...value, stopped: event.target.checked }))} />Stop new autonomous actions</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowAutonomousDrafts} onChange={event => setDraft(value => ({ ...value, allowAutonomousDrafts: event.target.checked }))} />Permit future automatic drafts</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowAutonomousPayments} onChange={event => setDraft(value => ({ ...value, allowAutonomousPayments: event.target.checked }))} />Allow finance worker payments</label>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {amount("maxSinglePaymentUsdc", "Single payment limit (USDC)")}
      {amount("maxDailyTreasuryUsdc", "Daily treasury limit (USDC, UTC)")}
      {amount("maxDailyInferenceUsd", "Daily inference limit (USD, UTC)")}
    </div>
    <label className="flex max-w-sm flex-col gap-1 text-sm">Finance agent AI provider
      <select className="rounded-lg border border-primary-divider bg-background p-2" value={draft.aiProvider} onChange={event => setDraft(value => ({ ...value, aiProvider: event.target.value as BusinessPolicy["aiProvider"] }))}>
        <option value="azure">Azure AI</option><option value="near_ai" disabled={!nearAiConfigured}>NEAR AI Cloud{nearAiConfigured ? "" : " · configure key and model first"}</option>
      </select>
    </label>
    <div className="space-y-3 rounded-xl border border-primary-divider p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Revenue sharing</h3><p className="text-xs text-text-secondary">A verified invoice sale creates exact payable obligations. Vault limits, allowlists and required approvals still apply.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.revenueSharingEnabled} onChange={event => setDraft(value => ({ ...value, revenueSharingEnabled: event.target.checked }))} />Enabled</label></div>
      <div className="space-y-2">{draft.revenueShareRecipients.map((recipient, index) => <div key={`${recipient.accountId}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_2fr_120px_auto]"><input aria-label={`Revenue share label ${index + 1}`} placeholder="Contributor" value={recipient.label} onChange={event => setDraft(value => ({ ...value, revenueShareRecipients: value.revenueShareRecipients.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} className="rounded-lg border border-primary-divider bg-background p-2 text-sm"/><input aria-label={`Revenue share account ${index + 1}`} placeholder="contributor.testnet" value={recipient.accountId} onChange={event => setDraft(value => ({ ...value, revenueShareRecipients: value.revenueShareRecipients.map((item, itemIndex) => itemIndex === index ? { ...item, accountId: event.target.value } : item) }))} className="rounded-lg border border-primary-divider bg-background p-2 text-sm"/><label className="flex items-center gap-1 text-sm"><input aria-label={`Revenue share percent ${index + 1}`} inputMode="decimal" value={recipient.basisPoints / 100} onChange={event => { const percent = Number(event.target.value); setDraft(value => ({ ...value, revenueShareRecipients: value.revenueShareRecipients.map((item, itemIndex) => itemIndex === index ? { ...item, basisPoints: Number.isFinite(percent) ? Math.round(percent * 100) : 0 } : item) })); }} className="min-w-0 rounded-lg border border-primary-divider bg-background p-2"/><span>%</span></label><FinanceButton type="button" onClick={() => setDraft(value => ({ ...value, revenueShareRecipients: value.revenueShareRecipients.filter((_, itemIndex) => itemIndex !== index) }))} className="text-sm underline">Remove</FinanceButton></div>)}</div>
      <FinanceButton type="button" disabled={draft.revenueShareRecipients.length >= 20} onClick={() => setDraft(value => ({ ...value, revenueShareRecipients: [...value.revenueShareRecipients, { accountId: "", label: "", basisPoints: 1000 }] }))} className="text-sm underline disabled:opacity-50">Add recipient</FinanceButton>
      <p className="text-xs text-text-secondary">Configured share: {(draft.revenueShareRecipients.reduce((sum, recipient) => sum + recipient.basisPoints, 0) / 100).toFixed(2)}%. Unallocated revenue remains in the company treasury.</p>
    </div>
    {providerOverride !== "policy" && <p className="text-xs text-text-secondary">The server provider setting currently overrides this selection. Set SETTLBOX_AI_PROVIDER=policy to use the owner choice.</p>}
    <div className="flex items-center gap-3"><FinanceButton disabled={saving} onClick={() => void save()} className="rounded-lg border border-primary-divider px-4 py-2 text-sm disabled:opacity-50">{saving ? "Saving…" : "Save business policy"}</FinanceButton><span className="text-xs text-text-secondary">Version {policy.revision}</span></div>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </div>;
}

export default function BusinessPolicyControls() {
  const query = useQuery({ queryKey: ["business-policy"], queryFn: () => workspaceFetch<PolicyResponse>("/api/business-policy"), retry: false });
  return <section className="rounded-2xl border border-primary-divider bg-background p-5 space-y-3">
    <h2 className="text-lg font-semibold">Autonomous business policy</h2>
    <p className="text-sm text-text-secondary">The policy starts stopped with zero spending limits. It gates finance worker payments and configured NEAR AI Cloud calls, but does not start the worker or replace native vault rules. Automatic drafts remain disabled until a worker uses them.</p>
    {query.isLoading && <p role="status" className="text-sm text-text-secondary">Loading policy…</p>}
    {query.error && <p role="alert" className="text-sm text-red-600">{query.error.message}</p>}
    {query.data && <PolicyEditor key={query.data.policy.revision} policy={query.data.policy} nearAiConfigured={query.data.nearAiConfigured} providerOverride={query.data.providerOverride} />}
    {!!query.data?.events.length && <details><summary className="cursor-pointer text-sm">Policy changes</summary><ul className="mt-2 space-y-1 text-xs text-text-secondary">{query.data.events.map((item, index) => <li key={`${item.revision}-${index}`}>{item.created_at} · Version {item.revision} · {item.event}</li>)}</ul></details>}
  </section>;
}
