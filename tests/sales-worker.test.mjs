import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeBase58 } from '../services/near/base58.ts';
import { openBusinessRecords } from '../services/server/business-records.ts';
import { openPaymentLinks } from '../services/server/payment-links.ts';
import { runSalesReconciliation } from '../services/server/sales-worker.ts';
import { BusinessPolicyStore } from '../services/server/business-policy.ts';

test('worker records a previously verified native sale once while spending stays disabled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-sales-worker-'));
  const previous = process.env.SETTLBOX_BUSINESS_DATABASE;
  process.env.SETTLBOX_BUSINESS_DATABASE = join(directory, 'business.sqlite');
  const records = openBusinessRecords();
  const links = openPaymentLinks();
  try {
    const details = { kind: 'invoice', title: 'Design work', counterparty: 'Customer', recipient: 'alice.testnet',
      amount: '1', dueDate: '2026-11-20', description: '' };
    const invoice = records.create('company', details);
    const link = links.create({ ...details, paymentWalletAddress: details.recipient }, invoice.id);
    records.transition('company', invoice.id, 'issued', ['draft'], { paymentLinkCode: link.code });
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 0, revenueSharesPrepared: 0 });
    links.record(link.code, encodeBase58(new Uint8Array(32).fill(21)), details.recipient, details.amount);
    assert.deepEqual(runSalesReconciliation('other'), { reconciled: 0, revenueSharesPrepared: 0 });
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 1, revenueSharesPrepared: 0 });
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 0, revenueSharesPrepared: 0 });
    assert.equal(records.listVerifiedSales('company').length, 1);
    assert.equal(records.get('company', invoice.id).status, 'paid');
  } finally {
    links.close(); records.close();
    if (previous === undefined) delete process.env.SETTLBOX_BUSINESS_DATABASE;
    else process.env.SETTLBOX_BUSINESS_DATABASE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verified sales create exact, durable revenue-share payables through the normal treasury workflow', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-revenue-share-'));
  const previous = process.env.SETTLBOX_BUSINESS_DATABASE;
  const path = join(directory, 'business.sqlite');
  process.env.SETTLBOX_BUSINESS_DATABASE = path;
  const records = openBusinessRecords();
  const links = openPaymentLinks();
  const policy = new BusinessPolicyStore(path);
  try {
    policy.update('company', { stopped: true, allowAutonomousDrafts: false, allowAutonomousPayments: false,
      maxSinglePaymentUsdc: '0', maxDailyTreasuryUsdc: '0', maxDailyInferenceUsd: '0',
      revenueSharingEnabled: true, revenueShareRecipients: [
        { accountId: 'writer.testnet', label: 'Writer', basisPoints: 1250 },
        { accountId: 'reviewer.testnet', label: 'Reviewer', basisPoints: 250 },
      ] }, 0, 'owner');
    const details = { kind: 'invoice', title: 'Report', counterparty: 'Customer', recipient: 'company.testnet', amount: '10.000001', dueDate: '2026-11-20', description: '' };
    assert.throws(() => records.create('company', { ...details, kind: 'revenue_share' }), /verified sale and owner policy/);
    const invoice = records.create('company', details);
    const link = links.create({ ...details, paymentWalletAddress: details.recipient }, invoice.id);
    records.transition('company', invoice.id, 'issued', ['draft'], { paymentLinkCode: link.code });
    links.record(link.code, encodeBase58(new Uint8Array(32).fill(22)), 'payer.testnet', details.amount);
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 1, revenueSharesPrepared: 2 });
    const allocation = records.listRevenueShareAllocations('company')[0];
    assert.equal(allocation.policy.enabled, true);
    assert.deepEqual(allocation.records.map(record => [record.kind, record.recipient, record.amount, record.status]), [
      ['revenue_share', 'writer.testnet', '1.25', 'draft'],
      ['revenue_share', 'reviewer.testnet', '0.25', 'draft'],
    ]);
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 0, revenueSharesPrepared: 0 });
    assert.equal(records.list('company').filter(record => record.kind === 'revenue_share').length, 2);
  } finally {
    policy.close(); links.close(); records.close();
    if (previous === undefined) delete process.env.SETTLBOX_BUSINESS_DATABASE;
    else process.env.SETTLBOX_BUSINESS_DATABASE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
