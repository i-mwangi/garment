"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BusinessRecord } from "@/types/business";

interface Option { id: string; supplier: string; reference: string; recipient: string; amount: string; receivedDate: string; submittedBy: string }
async function request<T>(id: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/business-records/${encodeURIComponent(id)}/quotes`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Supplier options are unavailable");
  return value as T;
}

export function ProcurementQuoteComparison({ record, role }: { record: BusinessRecord; role?: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["procurement-quotes", record.id], queryFn: () => request<{ quotes: Option[] }>(record.id), retry: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editable = record.status === "draft" && (role === "OWNER" || role === "ADMIN");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(record.id, "POST", Object.fromEntries(["supplier", "reference", "recipient", "amount", "receivedDate"].map(key => [key, String(data.get(key) || "").trim()])));
      form.reset(); await query.refetch(); setMessage("Supplier option saved for comparison. It is not approved or verified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Supplier option could not be saved"); }
    finally { setBusy(false); }
  }
  async function select(quoteId: string) {
    setBusy(true); setMessage("");
    try {
      await request(record.id, "PATCH", { quoteId });
      await client.invalidateQueries({ queryKey: ["business-records"] });
      await client.invalidateQueries({ queryKey: ["business-timeline"] });
      setMessage("Supplier option selected. The owner must approve its exact terms before unattended payment.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Supplier option could not be selected"); }
    finally { setBusy(false); }
  }
  const field = "w-full rounded-lg border border-primary-divider bg-background p-2 text-sm";
  return <section className="rounded-2xl border border-primary-divider bg-background p-5 space-y-4" aria-label="Supplier quote comparison">
    <div><h3 className="font-semibold">Compare supplier options</h3><p className="text-sm text-text-secondary">These are user-supplied quotes. Selecting one updates the draft bill and clears any earlier approval. Supplier identity and quote authenticity still require human review.</p></div>
    {query.isLoading && <p className="text-sm text-text-secondary">Loading options…</p>}
    {query.error && <p role="alert" className="text-sm text-red-600">{query.error.message}</p>}
    {!!query.data?.quotes.length && <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-primary-divider text-text-secondary"><th className="py-2">Supplier</th><th>Reference</th><th>Account</th><th className="text-right">USDC</th><th>Received</th><th></th></tr></thead><tbody>{query.data.quotes.map(option => <tr key={option.id} className="border-b border-primary-divider"><td className="py-3">{option.supplier}</td><td>{option.reference}</td><td className="font-mono text-xs">{option.recipient}</td><td className="text-right num">{option.amount}</td><td>{option.receivedDate}</td><td className="text-right">{role === "OWNER" && record.status === "draft" && <button type="button" disabled={busy} className="text-primary-blue underline disabled:opacity-50" onClick={() => void select(option.id)}>Select</button>}</td></tr>)}</tbody></table></div>}
    {editable && <form onSubmit={event => void add(event)} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs">Supplier<input name="supplier" required maxLength={160} className={field}/></label>
      <label className="text-xs">Quote reference<input name="reference" required maxLength={160} className={field}/></label>
      <label className="text-xs">NEAR account<input name="recipient" required className={field}/></label>
      <label className="text-xs">Amount (USDC)<input name="amount" required inputMode="decimal" className={field}/></label>
      <label className="text-xs">Received date<input name="receivedDate" required type="date" className={field}/></label>
      <button type="submit" disabled={busy} className="rounded-lg border border-primary-divider px-4 py-2 text-sm disabled:opacity-50 sm:col-span-2 xl:col-span-5">{busy ? "Saving…" : "Add supplier option"}</button>
    </form>}
    {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </section>;
}
