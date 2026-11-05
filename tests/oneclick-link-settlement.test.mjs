import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OneClickOrderStore } from '../services/intents/order-store.ts';
import { PaymentLinkRepository } from '../services/server/payment-links.ts';

test('a mainnet payment link records only durable verified Intents evidence', () => {
  const previous = process.env.NEXT_PUBLIC_NEAR_NETWORK;
  process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-intents-link-'));
  const path = join(directory, 'business.sqlite');
  const orders = new OneClickOrderStore(path);
  const links = new PaymentLinkRepository(path);
  const hash = '11111111111111111111111111111111';
  const code = 'invoice-1';
  const orderId = `${code}:quote-1`;
  try {
    const link = links.create({ title: 'Invoice', description: '', amount: '0.001', paymentWalletAddress: 'merchant.near' }, code, { singleUse: true });
    assert.equal(link.acceptedChains[0].networkId, 'mainnet');
    const order = { id: orderId, companyId: 'company-1', correlationId: 'corr-1', originAsset: 'nep141:base-usdc.omft.near',
      destinationAsset: `nep141:${link.acceptedTokens[0].address}`, inputUnits: '1010', minimumOutputUnits: '1000',
      recipient: 'merchant.near', refundTo: `0x${'a'.repeat(40)}`, deadline: '2026-11-05T12:00:00Z',
      depositAddress: `0x${'b'.repeat(40)}`, depositMemo: null, signedQuote: {} };
    orders.create(order);
    assert.throws(() => links.recordVerifiedIntent(code, orderId, hash), /Verified Intents settlement/);
    orders.update('company-1', orderId, { progress: 'provider_success_unverified', amountOutUnits: '1000', destinationHashes: [hash] });
    orders.recordVerifiedDestination('company-1', orderId, { transactionHash: hash, amountUnits: '1000', recipient: 'merchant.near' });
    const settled = links.recordVerifiedIntent(code, orderId, hash);
    assert.equal(settled.records[0].txid, hash);
    assert.equal(settled.records[0].payer, `base:0x${'a'.repeat(40)}`);
    assert.equal(settled.status, 'DEACTIVATED');
    assert.deepEqual(links.recordVerifiedIntent(code, orderId, hash), settled);
  } finally {
    orders.close(); links.close(); rmSync(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.NEXT_PUBLIC_NEAR_NETWORK; else process.env.NEXT_PUBLIC_NEAR_NETWORK = previous;
  }
});

test('quote attempt limit is durable across store instances', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-intents-rate-'));
  const path = join(directory, 'orders.sqlite');
  const first = new OneClickOrderStore(path), second = new OneClickOrderStore(path);
  try {
    for (let i = 0; i < 5; i++) first.reserveQuoteAttempt('company-1', 'link-1', 100_000 + i);
    assert.throws(() => second.reserveQuoteAttempt('company-1', 'link-1', 100_005), /Too many/);
    second.reserveQuoteAttempt('company-1', 'link-1', 160_005);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});
