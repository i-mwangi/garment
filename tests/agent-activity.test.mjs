import test from "node:test";
import assert from "node:assert/strict";
import { agentActivity } from "../app/agent/agent-activity.ts";

const run = {
  createdAt: "2026-11-03T12:00:00.000Z",
  request: { throughDate: "2026-12-03" },
  fundingSource: "treasury_vault",
  balanceUsdc: "25",
  obligationsUsdc: "10",
  cashPosition: { protectedUsdc: "5" },
};
const turn = { createdAt: "2026-11-03T12:00:02.000Z", run };
const proposal = { createdAt: "2026-11-03T12:00:01.000Z", operation: { tool: "business.create" }, status: "pending" };

test("activity shows saved checks and a pending draft without claiming execution", () => {
  const steps = agentActivity({ ...turn, proposal });
  assert.deepEqual(steps.map(step => step.id), ["balance", "obligations", "protected", "draft", "current"]);
  assert.equal(steps.at(-1).state, "waiting");
  assert.match(steps.at(-1).detail, /No action has been confirmed/);
});

test("blocked treasury does not display a fabricated balance", () => {
  const steps = agentActivity({ ...turn, run: { ...run, planningUnavailableReason: "Treasury is not deployed" }, proposal });
  assert.deepEqual(steps.map(step => step.id), ["treasury", "draft", "current"]);
  assert.equal(steps[0].state, "blocked");
  assert.ok(!JSON.stringify(steps).includes("25 USDC"));
});

test("latest saved proposal state replaces its stale conversation snapshot", () => {
  const steps = agentActivity({ ...turn, proposal }, { ...proposal, status: "uncertain" });
  assert.equal(steps.at(-1).state, "unknown");
  assert.match(steps.at(-1).detail, /Reconcile/);
  assert.equal(steps.at(-1).at, undefined);
});

test("activity shows only persisted proposal transitions with their recorded times", () => {
  const timeline = [
    { status: "pending", at: "2026-11-03T12:00:01.000Z" },
    { status: "running", at: "2026-11-03T12:00:03.000Z" },
    { status: "uncertain", at: "2026-11-03T12:00:05.000Z" },
  ];
  const steps = agentActivity({ ...turn, proposal }, { ...proposal, status: "uncertain", timeline });
  assert.deepEqual(steps.slice(-3).map(step => step.state), ["waiting", "active", "unknown"]);
  assert.deepEqual(steps.slice(-3).map(step => step.at), timeline.map(event => event.at));
  assert.equal(steps.some(step => step.title.includes("completed")), false);
});
