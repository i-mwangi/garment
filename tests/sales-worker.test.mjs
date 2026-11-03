import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeBase58 } from '../services/near/base58.ts';
import { openBusinessRecords } from '../services/server/business-records.ts';
import { openPaymentLinks } from '../services/server/payment-links.ts';
import { runSalesReconciliation } from '../services/server/sales-worker.ts';

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
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 0 });
    links.record(link.code, encodeBase58(new Uint8Array(32).fill(21)), details.recipient, details.amount);
    assert.deepEqual(runSalesReconciliation('other'), { reconciled: 0 });
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 1 });
    assert.deepEqual(runSalesReconciliation('company'), { reconciled: 0 });
    assert.equal(records.listVerifiedSales('company').length, 1);
    assert.equal(records.get('company', invoice.id).status, 'paid');
  } finally {
    links.close(); records.close();
    if (previous === undefined) delete process.env.SETTLBOX_BUSINESS_DATABASE;
    else process.env.SETTLBOX_BUSINESS_DATABASE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
