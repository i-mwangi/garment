import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OneClickOrderStore } from '../services/intents/order-store.ts';
import { PaymentLinkRepository } from '../services/server/payment-links.ts';
import { reconcileOneClickOrder } from '../services/intents/reconcile-order.ts';

test('a saved Base checkout progresses to a verified NEAR link payment and replays safely', async () => {
  const previous = { network: process.env.NEXT_PUBLIC_NEAR_NETWORK, database: process.env.SETTLBOX_BUSINESS_DATABASE };
  process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-intents-reconcile-'));
  const path = join(directory, 'business.sqlite');
  process.env.SETTLBOX_BUSINESS_DATABASE = path;
  const orders = new OneClickOrderStore(path), links = new PaymentLinkRepository(path);
  const code = 'invoice-1', hash = '11111111111111111111111111111111';
  try {
    const link = links.create({ title: 'Invoice', description: '', amount: '0.001', paymentWalletAddress: 'merchant.near' }, code, { singleUse: true });
    const order = { id: `${code}:quote-1`, companyId: 'company-1', correlationId: 'corr-1', originAsset: 'nep141:base-usdc.omft.near',
      destinationAsset: `nep141:${link.acceptedTokens[0].address}`, inputUnits: '1010', minimumOutputUnits: '1000',
      recipient: 'merchant.near', refundTo: `0x${'a'.repeat(40)}`, deadline: '2026-11-05T12:00:00Z',
      depositAddress: `0x${'b'.repeat(40)}`, depositMemo: null, signedQuote: {} };
    orders.create(order);
    const progress = { progress: 'provider_success_unverified', amountOutUnits: '1000', destinationHashes: [hash] };
    const outcome = { final_execution_status: 'FINAL', status: { SuccessValue: '' },
      transaction: { hash, signer_id: 'solver.near', receiver_id: link.acceptedTokens[0].address, actions: [] },
      transaction_outcome: { id: hash, outcome: { executor_id: 'solver.near', status: {}, logs: [] } },
      receipts_outcome: [{ id: hash, outcome: { executor_id: link.acceptedTokens[0].address, status: { SuccessValue: '' }, logs: [
        `EVENT_JSON:${JSON.stringify({ standard: 'nep141', event: 'ft_transfer', data: [{ old_owner_id: 'solver.near', new_owner_id: 'merchant.near', amount: '1000' }] })}`,
      ] } }],
    };
    const input = { companyId: 'company-1', orderId: order.id, code, indexerKey: 'test-key', orders, links,
      client: { status: async () => progress }, destinationReader: async () => outcome };
    const saved = await reconcileOneClickOrder(input);
    assert.equal(saved.verifiedDestination.transactionHash, hash);
    assert.ok(saved.bookedAt);
    assert.equal(orders.pending('company-1').length, 0);
    assert.deepEqual(orders.timeline('company-1', order.id).map(item => item.status), ['awaiting_deposit', 'provider_success_unverified', 'confirmed', 'sale_recorded']);
    assert.equal(links.get(code).status, 'DEACTIVATED');
    assert.deepEqual(await reconcileOneClickOrder(input), saved);
  } finally {
    orders.close(); links.close(); rmSync(directory, { recursive: true, force: true });
    if (previous.network === undefined) delete process.env.NEXT_PUBLIC_NEAR_NETWORK; else process.env.NEXT_PUBLIC_NEAR_NETWORK = previous.network;
    if (previous.database === undefined) delete process.env.SETTLBOX_BUSINESS_DATABASE; else process.env.SETTLBOX_BUSINESS_DATABASE = previous.database;
  }
});
