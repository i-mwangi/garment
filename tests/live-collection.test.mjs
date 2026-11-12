import test from "node:test";
import assert from "node:assert/strict";
import { assembleLiveCollection } from "../services/server/live-collection.ts";

test("live collection shows the NEAR wallet balance and inbound USDC, not historical bank totals", () => {
  const now = new Date().toISOString();
  const view = assembleLiveCollection({
    accountId: "a".repeat(64),
    balanceUsdc: "20",
    networkName: "NEAR Testnet",
    usdcContractId: "usdc.testnet",
    explorerUrl: "https://testnet.nearblocks.io",
    deposits: [
      { id: "B".repeat(43), currency: "USDC", method: "Payment link", amount: 0.5, sender: "payer.testnet", date: now, status: "completed" },
      { id: "old", currency: "USDC", method: "Invoice", amount: 8, sender: "old", date: "2020-01-01T00:00:00.000Z", status: "completed" },
    ],
  });
  assert.equal(view.accounts.length, 1);
  assert.equal(view.accounts[0].currency, "USDC");
  assert.equal(view.accounts[0].details.find(row => row.label === "NEAR account")?.value, "a".repeat(64));
  assert.equal(view.balanceUsdc, "20");
  assert.equal(view.received30dUsdc, "0.5");
  assert.equal(view.deposits[0].amount, 0.5);
  assert.doesNotMatch(JSON.stringify(view), /296100|Lead Bank/);
});
