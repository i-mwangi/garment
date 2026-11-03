import { readNearDeployment } from "./near-contract-config.ts";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { FinanceWorkerStore } from "./finance-worker-store";
import { financeWorkerCycle } from "../near/finance-worker-cycle";
import { openVaultPayments, executeVaultPayment, queueVaultPayment, reconcileVaultPayment, vaultPaymentContext } from "./vault-payments";
import { parseAmount } from "../near/amount";
import { openBusinessRecords } from "./business-records";
import { openAgentRuns } from "./agent-runs";
import { vaultPlanningContext } from "./vault-planning";
import { planBusinessActions } from "../near/agent-planner";
import { reviewAgentPlan } from "./azure-agent";
import { openBusinessPolicy } from "./business-policy";

export function openFinanceWorker() { return new FinanceWorkerStore(resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite")); }
export async function runFinanceWorker(companyId: string) {
  const store = openFinanceWorker(); const lease = store.acquire(companyId);
  if (!lease) { store.close(); return { status: "disabled_or_busy", submitted: 0 }; }
  const active = () => store.active(companyId, lease.token, lease.config.revision);
  const audit = (message: string) => { store.renew(companyId, lease.token); store.event(companyId, lease.token, message); };
  let businessPolicy: ReturnType<typeof openBusinessPolicy> | undefined;
  try {
    businessPolicy = openBusinessPolicy();
    const policyRevision = businessPolicy.get(companyId).revision;
    const canSubmit = () => {
      if (!active()) return false;
      const current = businessPolicy!.get(companyId);
      return current.revision === policyRevision && !current.stopped && current.allowAutonomousPayments;
    };
    const result = await financeWorkerCycle(lease.config, {
      active, canSubmit, audit,
      list: () => { const journal = openVaultPayments(); try { return journal.list(companyId); } finally { journal.close(); } },
      reconcile: recordId => reconcileVaultPayment(companyId, recordId),
      execute: async recordId => {
        const context = await vaultPaymentContext(companyId);
        const journal = openVaultPayments();
        try {
          const payment = journal.get(companyId, recordId);
          if (!payment || !canSubmit()) throw new Error("Worker stopped or payment unavailable");
          if (parseAmount(context.vault.balanceUsdc) < parseAmount(payment.amount) + parseAmount(context.vault.policy.liquidityFloorUsdc) + parseAmount(lease.config.reserveUsdc)) throw new Error("Worker liquidity reserve prevents execution");
          businessPolicy!.reserve(companyId, payment.recordId, "treasury", payment.amount, policyRevision);
        } finally { journal.close(); }
        return executeVaultPayment(companyId, recordId, { active: canSubmit, reserveUsdc: lease.config.reserveUsdc });
      },
      queue: async (runId, recordId) => {
        if (!canSubmit()) throw new Error("Business policy stopped before queueing");
        const records = openBusinessRecords();
        try {
          const record = records.get(companyId, recordId);
          if (!record) throw new Error("Saved obligation is unavailable");
          const singleLimit = businessPolicy!.get(companyId).maxSinglePaymentUsdc;
          if (parseAmount(record.amount) > parseAmount(singleLimit)) throw new Error("Business policy single-payment limit prevents queueing");
        } finally { records.close(); }
        return queueVaultPayment(companyId, "finance-worker", runId, recordId, canSubmit);
      },
      candidates: async () => {
        const records = openBusinessRecords(); const runs = openAgentRuns();
        try {
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          const request = { requestId: randomUUID(), throughDate: today, reserveUsdc: lease.config.reserveUsdc };
          const context = await vaultPlanningContext(companyId, records.list(companyId));
          const plan = planBusinessActions(request, context);
          const eligible = plan.actions.filter(action => action.tool === "review_payment" && action.disposition === "review");
          if (!eligible.length) return { runId: request.requestId, recordIds: [] };
          const reviewed = await reviewAgentPlan(plan);
          const binding = readNearDeployment().treasury;
          const saved = runs.save(companyId, "finance-worker", request, { ...reviewed, fundingSource: "treasury_vault", networkId: binding.networkId as "testnet" | "mainnet", vaultId: binding.accountId });
          return { runId: saved.id, recordIds: eligible.map(action => action.recordId) };
        } finally { records.close(); runs.close(); }
      },
    });
    audit(`Cycle finished: ${result.submitted} submission attempts`); return { status: canSubmit() ? "complete" : "policy_stopped", ...result };
  } catch { audit("Cycle stopped after an upstream or policy error; no bypass was attempted"); return { status: "review_required", submitted: 0 }; }
  finally { businessPolicy?.close(); store.release(companyId, lease.token); store.close(); }
}
