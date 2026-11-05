import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptOneClickQuote, mainnetUsdcAsset } from '../services/intents/oneclick.ts';
import { OneClickOrderStore } from '../services/intents/order-store.ts';

const signed = { correlationId: 'corr-1', quoteRequest: {
  dry: false, swapType: 'EXACT_INPUT', depositType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN', refundType: 'ORIGIN_CHAIN',
  originAsset: 'nep141:source.near', destinationAsset: mainnetUsdcAsset(), amount: '1000', recipient: 'merchant.near', refundTo: 'payer.near', deadline: '2026-11-03T12:10:00Z',
}, quote: { amountOut: '999', minAmountOut: '990', depositAddress: 'deposit.near', deadline: '2026-11-03T12:05:00Z' } };
const order = acceptOneClickQuote(signed, { id: 'sale-1', companyId: 'company-1', originAsset: 'nep141:source.near', inputUnits: '1000', recipient: 'merchant.near', refundTo: 'payer.near', minimumOutputUnits: '990', now: new Date('2026-11-03T12:00:00Z') }, () => true);

test('quote identity and provider progress persist once without becoming verified settlement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-intents-order-'));
  const path = join(directory, 'orders.sqlite');
  const first = new OneClickOrderStore(path);
  const second = new OneClickOrderStore(path);
  try {
    assert.equal(first.create(order).progress, 'awaiting_deposit');
    assert.deepEqual(second.create(order), first.get('company-1', 'sale-1'));
    assert.equal(second.get('other-company', 'sale-1'), undefined);
    assert.throws(() => second.create({ ...order, inputUnits: '1001' }), /different quote/);
    assert.throws(() => second.create({ ...order, id: 'sale-2' }), /UNIQUE/);
    assert.equal(first.update('company-1', 'sale-1', { progress: 'deposit_seen', amountOutUnits: null, destinationHashes: [] }).progress, 'deposit_seen');
    assert.throws(() => second.update('company-1', 'sale-1', { progress: 'awaiting_deposit', amountOutUnits: null, destinationHashes: [] }), /later/);
    const success = { progress: 'provider_success_unverified', amountOutUnits: '990', destinationHashes: ['tx-hash'] };
    assert.throws(() => second.update('company-1', 'sale-1', { ...success, destinationHashes: [] }), /evidence/);
    assert.equal(second.update('company-1', 'sale-1', success).progress, 'provider_success_unverified');
    assert.deepEqual(first.update('company-1', 'sale-1', success), second.get('company-1', 'sale-1'));
    const proofHash = '11111111111111111111111111111111';
    const realSuccess = { ...success, destinationHashes: [proofHash] };
    assert.throws(() => first.recordVerifiedDestination('company-1', 'sale-1', { transactionHash: proofHash, amountUnits: '990', recipient: 'merchant.near' }), /does not match/);
    // A separate order with an actual NEAR destination hash can be verified exactly once.
    const another = { ...order, id: 'sale-3', correlationId: 'corr-3', depositAddress: 'another.near' };
    first.create(another);
    first.update('company-1', 'sale-3', realSuccess);
    const proof = { transactionHash: proofHash, amountUnits: '990', recipient: 'merchant.near' };
    const recorded = first.recordVerifiedDestination('company-1', 'sale-3', proof);
    assert.equal(recorded.verifiedDestination.transactionHash, proofHash);
    assert.deepEqual(second.recordVerifiedDestination('company-1', 'sale-3', proof), recorded);
    assert.throws(() => first.recordVerifiedDestination('company-1', 'sale-3', { ...proof, amountUnits: '991' }), /different destination proof/);
    first.create({ ...another, id: 'sale-4', correlationId: 'corr-4', depositAddress: 'third.near' });
    first.update('company-1', 'sale-4', realSuccess);
    assert.throws(() => first.recordVerifiedDestination('company-1', 'sale-4', proof), /UNIQUE/);
    assert.throws(() => first.update('company-1', 'sale-1', { progress: 'refunded', amountOutUnits: null, destinationHashes: [] }), /terminal/);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});
