import test from "node:test";
import assert from "node:assert/strict";
import { runBusinessCycle } from "../services/server/business-cycle.ts";

test("the business cycle preserves settlement, sale, finance and notification causality", async () => {
  const order = [];
  const result = await runBusinessCycle("company", {
    intents: async company => { order.push(`intents:${company}`); return { checked: 1 }; },
    sales: company => { order.push(`sales:${company}`); return { reconciled: 1, revenueSharesPrepared: 1 }; },
    finance: async company => { order.push(`finance:${company}`); return { state: "completed", actions: 1 }; },
    notifications: async company => { order.push(`notifications:${company}`); return { delivered: 1 }; },
  });
  assert.deepEqual(order, ["intents:company", "sales:company", "finance:company", "notifications:company"]);
  assert.deepEqual(result.sales, { reconciled: 1, revenueSharesPrepared: 1 });
  assert.deepEqual(result.intents, { checked: 1 });
  assert.deepEqual(result.notifications, { delivered: 1 });
});

test("non-finance integrations retry later while a finance failure stops the cycle", async () => {
  const tolerated = await runBusinessCycle("company", {
    intents: async () => { throw new Error("provider unavailable"); },
    sales: () => { throw new Error("database busy"); },
    finance: async () => ({ state: "idle" }),
    notifications: async () => { throw new Error("delivery unavailable"); },
  });
  assert.match(tolerated.intents.error, /Intents reconciliation failed/);
  assert.match(tolerated.sales.error, /Sales reconciliation failed/);
  assert.match(tolerated.notifications.error, /Notification cycle failed/);
  await assert.rejects(() => runBusinessCycle("company", {
    intents: async () => ({}), sales: () => ({ reconciled: 0, revenueSharesPrepared: 0 }),
    finance: async () => { throw new Error("finance stopped"); }, notifications: async () => ({}),
  }), /finance stopped/);
});
