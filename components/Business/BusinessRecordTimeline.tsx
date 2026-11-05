"use client";

import { useQuery } from "@tanstack/react-query";
import { workspaceFetch } from "@/presentation/services/api/seeded-workspace";
import type { BusinessTimelineEvent } from "@/services/server/business-records";

const labels: Record<BusinessTimelineEvent["type"], string> = {
  created: "Draft created", status_changed: "Status changed", terms_updated: "Terms updated",
  supplier_quote_approved: "Supplier quote approved", sale_verified: "Sale verified",
  payout_verified: "Payout verified",
};

export function BusinessRecordTimeline({ recordId }: { recordId: string }) {
  const query = useQuery({ queryKey: ["business-timeline", recordId],
    queryFn: () => workspaceFetch<{ events: BusinessTimelineEvent[] }>(`/api/business-records/${encodeURIComponent(recordId)}/timeline`), retry: false });
  return <section aria-label="Business record timeline" className="rounded-2xl border border-primary-divider bg-background p-5">
    <h3 className="text-lg font-semibold">Activity and proof</h3>
    <p className="mt-1 text-xs text-text-secondary">Recorded changes since timeline tracking began. A transaction is verified only when a separate proof entry appears.</p>
    {query.isLoading && <p role="status" className="mt-3 text-sm text-text-secondary">Loading activity…</p>}
    {query.error && <p role="alert" className="mt-3 text-sm text-red-600">Activity is unavailable. Refresh to try again.</p>}
    {query.data && <ol className="mt-3 space-y-2">{query.data.events.map((event, index) => <li key={`${event.occurredAt}-${index}`} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-primary-divider p-3 text-sm">
      <div><span className="font-medium">{labels[event.type] || event.type}</span><span className="ml-2 text-text-secondary">{event.status.replaceAll("_", " ")}</span>
        {event.transactionHash && <p className="mt-1 break-all font-mono text-xs text-text-secondary">NEAR proof: {event.transactionHash}</p>}</div>
      <time className="text-xs text-text-secondary" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
    </li>)}</ol>}
  </section>;
}
