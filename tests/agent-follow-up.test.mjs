import test from "node:test";
import assert from "node:assert/strict";
import { followUpSuggestions } from "../app/agent/follow-up.ts";

const receivable = (title, id = title) => ({ recordId: id, kind: "invoice", title, amountUsdc: "0.5", dueDate: "2026-11-20", tool: "review_receivable", disposition: "review", reasons: [] });
const turn = (actions, extra = {}) => ({ id: "1", message: "What needs my attention?", answer: "Receivables need review.", createdAt: "2026-11-12T12:00:00.000Z", run: { id: "1", companyId: "c", requestedBy: "o", request: { throughDate: "2026-12-12", reserveUsdc: "0" }, balanceUsdc: "0", reserveUsdc: "0", obligationsUsdc: "0", unallocatedUsdc: "0", actions, mode: "proposal_only", engine: "deterministic", ...extra } });

test("follow-ups offer to help collect each receivable on screen", () => {
  assert.deepEqual(followUpSuggestions(turn([receivable("NEAR-LIVE-002"), receivable("NEAR-LIVE-001")])), [
    "Can I help collect NEAR-LIVE-002?",
    "Can I help collect NEAR-LIVE-001 instead?",
  ]);
});

test("empty chat offers two starter follow-ups", () => {
  assert.equal(followUpSuggestions().length, 2);
});
