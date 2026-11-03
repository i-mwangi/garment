import type { AgentChatTurn } from "../../types/agent-chat.ts";
import type { AgentProposal } from "../../types/agent-operation.ts";

export type ActivityState = "recorded" | "blocked" | "waiting" | "active" | "failed" | "unknown";
export interface AgentActivityStep {
  id: string;
  title: string;
  detail: string;
  state: ActivityState;
  at?: string;
}

export function agentActivity(turn: AgentChatTurn, currentProposal?: AgentProposal): AgentActivityStep[] {
  const steps: AgentActivityStep[] = [];
  const run = turn.run;
  if (run.planningUnavailableReason) {
    steps.push({ id: "treasury", title: "Treasury availability", detail: run.planningUnavailableReason, state: "blocked", at: run.createdAt });
  } else {
    steps.push({ id: "balance", title: "Funding balance checked", detail: `${run.fundingSource === "treasury_vault" ? "Treasury vault" : "Company wallet"}: ${run.balanceUsdc} USDC`, state: "recorded", at: run.createdAt });
    steps.push({ id: "obligations", title: "Saved obligations evaluated", detail: `${run.obligationsUsdc} USDC through ${run.request.throughDate}`, state: "recorded", at: run.createdAt });
    if (run.cashPosition) steps.push({ id: "protected", title: "Protected amount applied", detail: `${run.cashPosition.protectedUsdc} USDC in commitments and liquidity floor`, state: "recorded", at: run.createdAt });
  }
  const proposal = currentProposal ?? turn.proposal;
  if (!proposal) {
    steps.push({ id: "analysis", title: "Analysis saved", detail: "No action was proposed or submitted.", state: "recorded", at: turn.createdAt });
    return steps;
  }
  steps.push({ id: "draft", title: "Action draft saved", detail: proposal.operation.tool, state: "recorded", at: proposal.createdAt });
  const current = {
    pending: ["Human review required", "No action has been confirmed.", "waiting"],
    awaiting_signature: ["Wallet authorization required", "No NEAR transaction is confirmed yet.", "waiting"],
    running: ["Action in progress", "Wait for the saved outcome before retrying.", "active"],
    completed: ["Action result recorded", "Inspect the saved result. A payment needs separate settlement proof.", "recorded"],
    failed: ["Action failed", "Inspect the saved error before retrying.", "failed"],
    uncertain: ["Outcome unknown", "Reconcile the earlier attempt before trying again.", "unknown"],
    cancelled: ["Review dismissed", "No action was confirmed through this draft.", "recorded"],
  } as const;
  const [title, detail, state] = current[proposal.status];
  steps.push({ id: "current", title, detail, state });
  return steps;
}
