import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaymentLinkRepository, validatePaymentLink, publicPaymentLink } from "../services/server/payment-links.ts";

const details = { title: "Consulting", description: "Monthly invoice", amount: "0.001", paymentWalletAddress: "company.testnet" };
const payer = "payer.testnet";
const hash = "A".repeat(44);

test("paid single-use checkout exposes a receipt after reload without exposing payer history", () => {
  const repository = new PaymentLinkRepository(":memory:");
  try {
    const link = repository.create(details, "invoice-receipt", { singleUse: true });
    assert.equal(publicPaymentLink(link).settlement, null);
    repository.record(link.code, hash, payer, link.amount);
    const checkout = publicPaymentLink(repository.get(link.code));
    assert.equal(checkout.status, "DEACTIVATED");
    assert.equal(checkout.settlement.status, "confirmed");
    assert.equal(checkout.settlement.transactionHash, hash);
    assert.deepEqual(checkout.records, []);
    assert.equal(JSON.stringify(checkout).includes(payer), false);
    assert.throws(() => repository.record(link.code, "B".repeat(44), payer, link.amount), /inactive/);
    const disabled = repository.create(details);
    repository.update(disabled.code, { status: "DEACTIVATED" });
    assert.equal(publicPaymentLink(repository.get(disabled.code)).settlement, null);
  } finally { repository.close(); }
});

test("payment links and verified receipts survive restart without duplicate settlement", () => {
  const directory = mkdtempSync(join(tmpdir(), "settlbox-links-"));
  const path = join(directory, "business.sqlite");
  let repository = new PaymentLinkRepository(path);
  try {
    const first = repository.create(details);
    const second = repository.create(details);
    repository.record(first.code, hash, payer, first.amount);
    repository.close();
    repository = new PaymentLinkRepository(path);
    assert.equal(repository.record(first.code, hash, payer, first.amount).records.length, 1);
    assert.throws(() => repository.record(second.code, hash, payer, second.amount), /another payment link/);
    assert.throws(() => repository.update(first.code, { amount: "2" }), /cannot be changed/);
    assert.throws(() => repository.delete([first.code]), /history/);
    assert.equal(repository.get(first.code).records.length, 1);
  } finally { repository.close(); rmSync(directory, { recursive: true }); }
});

test("native settlement hashes retain their case and token/network metadata is native", () => {
  const repository = new PaymentLinkRepository(":memory:");
  try {
    const link = repository.create(details);
    repository.record(link.code, "A".repeat(43), payer, link.amount);
    repository.record(link.code, "a".repeat(43), payer, link.amount);
    const saved = repository.get(link.code);
    assert.deepEqual(new Set(saved.records.map(item => item.txid)), new Set(["A".repeat(43), "a".repeat(43)]));
    assert.equal(saved.acceptedChains[0].networkId, "testnet");
    assert.equal(saved.acceptedTokens[0].decimals, 6);
    assert.throws(() => validatePaymentLink({ ...details, acceptedChains: [{ name: "Arc", chainId: 5042002 }] }), /NEAR/);
  } finally { repository.close(); }
});

test("payment link validation rejects invalid recipients and nonpositive amounts", () => {
  assert.throws(() => validatePaymentLink({ ...details, paymentWalletAddress: "0x1234" }));
  assert.throws(() => validatePaymentLink({ ...details, amount: "0" }));
  assert.throws(() => validatePaymentLink({ ...details, amount: "NaN" }));
  assert.throws(() => validatePaymentLink({ ...details, paymentWalletAddress: `0x${"0".repeat(40)}` }));
});

test("inactive or changed links cannot accept a newly verified receipt", () => {
  const repository = new PaymentLinkRepository(":memory:");
  try {
    const link = repository.create(details);
    repository.update(link.code, { amount: "3" });
    assert.throws(() => repository.record(link.code, hash, payer, link.amount), /changed/);
    repository.update(link.code, { status: "DEACTIVATED" });
    assert.throws(() => repository.record(link.code, hash, payer, "3"), /inactive/);
    assert.equal(repository.get(link.code).records.length, 0);
  } finally { repository.close(); }
});
