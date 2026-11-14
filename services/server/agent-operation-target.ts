import type { AgentOperation } from "../../types/agent-operation.ts";

export function savedBusinessOperationTarget(operation: AgentOperation, records: { id: string }[] | undefined) {
  if (operation.tool === "payment.review") return records?.find(item => item.id === operation.arguments.recordId);
  if (operation.tool.startsWith("business.") && operation.tool !== "business.create") return records?.find(item => item.id === operation.arguments.id);
  return null;
}
