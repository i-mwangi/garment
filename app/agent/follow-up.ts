import type { AgentAction } from "../../types/agent";
import type { AgentChatTurn } from "../../types/agent-chat";

function listed(turn: AgentChatTurn): AgentAction[] {
  return turn.run.actions.filter(action => !turn.recordIds?.length || turn.recordIds.includes(action.recordId));
}

export function followUpSuggestions(turn?: AgentChatTurn | null): string[] {
  if (!turn) return ["Can I help collect outstanding invoices?", "What needs my attention?"];
  const actions = listed(turn);
  const receivables = actions.filter(action => action.tool === "review_receivable");
  const payable = actions.filter(action => action.tool === "review_payment" && action.disposition === "review");
  const blocked = actions.filter(action => action.tool === "review_payment" && action.disposition === "blocked");
  const next: string[] = [];
  if (turn.run.planningUnavailableReason) next.push("Can I help prepare this without sending a payment?");
  if (receivables.length === 1) next.push(`Can I help collect ${receivables[0].title}?`);
  if (receivables.length > 1) {
    next.push(`Can I help collect ${receivables[0].title}?`);
    next.push(`Can I help collect ${receivables[1].title} instead?`);
  }
  for (const action of payable.slice(0, 2)) next.push(`Can I help review payment for ${action.title}?`);
  for (const action of blocked.slice(0, 2)) next.push(`Can I help unblock ${action.title}?`);
  if (Number(turn.run.balanceUsdc) === 0) next.push("Can I help add USDC so we can pay from the vault?");
  if (!next.length) next.push("What should we do next?");
  return [...new Set(next)].slice(0, 2);
}
