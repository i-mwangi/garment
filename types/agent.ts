import type { BusinessRecord, BusinessRecordKind } from "./business";


export interface AgentPlanRequest {
  requestId: string;
  throughDate: string;
  reserveUsdc: string;
}

export interface AgentAction {
  recipient?: string;
  recordId: string;
  kind: BusinessRecordKind;
  title: string;
  amountUsdc: string;
  dueDate: string;
  tool: "review_payment" | "review_receivable";
  disposition: "review" | "blocked";
  reasons: string[];
}

export interface AgentPlan {
  planningUnavailableReason?: string;
  networkId?: "testnet" | "mainnet";
  vaultId?: string;
  cashPosition?: {
    protectedUsdc: string;
    availableBeforePaymentsUsdc: string;
    reviewablePaymentsUsdc: string;
    blockedPaymentsUsdc: string;
    receivablesUsdc: string;
    priorityRule: "earliest_due_first";
  };
  fundingSource?: "treasury_vault";
  mode: "proposal_only";
  engine: "deterministic";
  balanceUsdc: string;
  reserveUsdc: string;
  obligationsUsdc: string;
  unallocatedUsdc: string;
  actions: AgentAction[];
  aiReview?: {
    provider: "azure" | "near_ai";
    model: string;
    responseId: string;
    summary: string;
    createdAt: string;
  };
}

export interface AgentRun extends AgentPlan {
  id: string;
  companyId: string;
  requestedBy: string;
  request: AgentPlanRequest;
  createdAt: string;
}

export interface AgentPlanningContext {
  companyId: string;
  balanceBaseUnits: string;
  reservedBaseUnits: string;
  committedTodayBaseUnits: string;
  policy: { allowedRecipients: readonly string[]; maxPaymentBaseUnits: string; dailyLimitBaseUnits: string; approvalThresholdBaseUnits: string; requiredApprovals: number };
  records: readonly BusinessRecord[];
}
