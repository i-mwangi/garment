import test from "node:test";
import assert from "node:assert/strict";
import { savedBusinessOperationTarget } from "../services/server/agent-operation-target.ts";

test("chat and MCP payment reviews bind the exact saved payable record", () => {
  const records = [{ id: "bill-a", amount: "1" }, { id: "share-a", kind: "revenue_share", amount: "0.1" }];
  assert.equal(savedBusinessOperationTarget({ tool: "payment.review", arguments: { recordId: "bill-a" } }, records), records[0]);
  assert.equal(savedBusinessOperationTarget({ tool: "payment.review", arguments: { recordId: "share-a" } }, records), records[1]);
  assert.equal(savedBusinessOperationTarget({ tool: "payment.review", arguments: { recordId: "missing" } }, records), undefined);
});

test("business edits bind by id while create operations have no saved target", () => {
  const records = [{ id: "bill-a" }];
  assert.equal(savedBusinessOperationTarget({ tool: "business.edit", arguments: { id: "bill-a", data: {} } }, records), records[0]);
  assert.equal(savedBusinessOperationTarget({ tool: "business.create", arguments: {} }, records), null);
});
