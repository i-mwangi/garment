import type { AgentChatTurn } from "@/types/agent-chat";
import type { AgentProposal } from "@/types/agent-operation";
import { agentActivity } from "./agent-activity";

type ProposalStatus = AgentProposal["status"];

function draftStatus(status: ProposalStatus | undefined): string {
  switch (status) {
    case "completed": return "Action completed and recorded. Open the review to inspect the saved result.";
    case "cancelled": return "Dismissed without execution.";
    case "failed": return "Action failed. Inspect the saved result before trying again.";
    case "uncertain": return "Outcome unresolved. Check the saved result before trying again.";
    case "running": return "Action in progress. Wait for a saved result.";
    case "awaiting_signature": return "Waiting for wallet authorization. No payment is confirmed yet.";
    default: return "Draft only. Open review to confirm exact details; any NEAR transaction requires wallet authorization.";
  }
}

function value(input: unknown): string {
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") return String(input);
  if (input === null) return "None";
  return JSON.stringify(input);
}

export default function AgentTurnDetails({ turn, status, proposal }: { turn: AgentChatTurn; status?: ProposalStatus; proposal?: AgentProposal }) {
  const action = turn.proposal?.operation;
  const rows = action ? Object.entries(action.arguments).filter(([, item]) => item !== undefined).slice(0, 12) : [];
  const steps = agentActivity(turn, proposal);
  return <div className="space-y-3 text-[13px]">
    <details className="rounded-xl border border-primary-divider bg-background" open={!!action}>
      <summary className="cursor-pointer px-3 py-2 font-medium text-text-primary">Activity and checks · {steps.length} stages</summary>
      <ol aria-label="Finance agent activity" className="border-t border-primary-divider px-3 py-2 space-y-3">
        {steps.map(step => <li key={step.id} className="flex gap-3 text-text-secondary">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-blue" />
          <div className="min-w-0"><p className="font-medium text-text-primary">{step.title} <span className="font-normal text-text-secondary">· {step.state}</span></p><p className="break-words">{step.detail}</p>{step.at && <time className="text-[11px]" dateTime={step.at}>{new Date(step.at).toLocaleString()}</time>}</div>
        </li>)}
      </ol>
    </details>
    {action && <section aria-label="Action draft" className="overflow-hidden rounded-xl border border-primary-divider"><div className="border-b border-primary-divider bg-app-background px-3 py-2 font-semibold">Action draft · {action.tool}</div><div className="overflow-x-auto"><table className="w-full min-w-[300px] text-left"><tbody>{rows.map(([field, item]) => <tr key={field} className="border-b border-primary-divider last:border-b-0"><th scope="row" className="w-1/3 bg-app-background px-3 py-2 font-medium text-text-secondary">{field.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}</th><td className="px-3 py-2 break-all">{value(item)}</td></tr>)}</tbody></table></div><p role="status" className="border-t border-primary-divider px-3 py-2 text-text-secondary">{draftStatus(status)}</p></section>}
    {!action && turn.run.actions.length > 0 && <section aria-label="Saved obligation summary" className="overflow-hidden rounded-xl border border-primary-divider"><div className="border-b border-primary-divider bg-app-background px-3 py-2 font-semibold">Saved obligations · no payment submitted</div><div className="overflow-x-auto"><table className="w-full min-w-[360px] text-left"><thead><tr className="text-text-secondary"><th scope="col" className="px-3 py-2">Item</th><th scope="col" className="px-3 py-2">Amount</th><th scope="col" className="px-3 py-2">Due</th><th scope="col" className="px-3 py-2">Review</th></tr></thead><tbody>{turn.run.actions.slice(0, 10).map(item => <tr key={item.recordId} className="border-t border-primary-divider"><td className="px-3 py-2">{item.title}</td><td className="px-3 py-2 whitespace-nowrap">{item.amountUsdc} USDC</td><td className="px-3 py-2 whitespace-nowrap">{item.dueDate}</td><td className="px-3 py-2">{item.disposition === "blocked" ? "Blocked" : item.tool === "review_receivable" ? "Receivable" : "Eligible for review"}</td></tr>)}</tbody></table></div>{turn.run.actions.length > 10 && <p className="border-t border-primary-divider px-3 py-2 text-text-secondary">Showing 10 of {turn.run.actions.length} saved items.</p>}</section>}
  </div>;
}
