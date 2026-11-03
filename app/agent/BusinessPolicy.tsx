"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceFetch } from "@/presentation/services/api/seeded-workspace";
import FinanceButton from "@/presentation/components/Common/FinanceButton";
import type { BusinessPolicy } from "@/services/server/business-policy";

type PolicyResponse = { policy: BusinessPolicy; events: { actor: string; event: string; revision: number; created_at: string }[] };

function PolicyEditor({ policy }: { policy: BusinessPolicy }) {
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
      }, expectedRevision: policy.revision });
      await client.invalidateQueries({ queryKey: ["business-policy"] });
      await client.invalidateQueries({ queryKey: ["finance-automation"] });
      setMessage("Policy saved. Finance worker submissions now follow these treasury limits; other autonomous workflows are still in development.");
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
    <div className="flex items-center gap-3"><FinanceButton disabled={saving} onClick={() => void save()} className="rounded-lg border border-primary-divider px-4 py-2 text-sm disabled:opacity-50">{saving ? "Saving…" : "Save business policy"}</FinanceButton><span className="text-xs text-text-secondary">Version {policy.revision}</span></div>
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </div>;
}

export default function BusinessPolicyControls() {
  const query = useQuery({ queryKey: ["business-policy"], queryFn: () => workspaceFetch<PolicyResponse>("/api/business-policy"), retry: false });
  return <section className="rounded-2xl border border-primary-divider bg-background p-5 space-y-3">
    <h2 className="text-lg font-semibold">Autonomous business policy</h2>
    <p className="text-sm text-text-secondary">The policy starts stopped with zero spending limits. It gates finance worker submissions but does not start the worker or replace the native vault rules. Draft and inference controls are reserved for later workflows.</p>
    {query.isLoading && <p role="status" className="text-sm text-text-secondary">Loading policy…</p>}
    {query.error && <p role="alert" className="text-sm text-red-600">{query.error.message}</p>}
    {query.data && <PolicyEditor key={query.data.policy.revision} policy={query.data.policy} />}
    {!!query.data?.events.length && <details><summary className="cursor-pointer text-sm">Policy changes</summary><ul className="mt-2 space-y-1 text-xs text-text-secondary">{query.data.events.map((item, index) => <li key={`${item.revision}-${index}`}>{item.created_at} · Version {item.revision} · {item.event}</li>)}</ul></details>}
  </section>;
}
