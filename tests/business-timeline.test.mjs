import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessRecordRepository } from '../services/server/business-records.ts';
import { PaymentLinkRepository } from '../services/server/payment-links.ts';
import { encodeBase58 } from '../services/near/base58.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bill = { kind: 'bill', title: 'Materials', counterparty: 'Supplier', recipient: 'supplier.testnet',
  amount: '1', dueDate: '2026-11-20', description: '',
  supplierQuote: { reference: 'Q-1', amount: '1', receivedDate: '2026-11-04' } };

test('business timeline persists real record and approval changes by company', () => {
  const records = new BusinessRecordRepository(':memory:');
  try {
    const created = records.create('company-a', bill);
    assert.deepEqual(records.timeline('company-a', created.id).map(event => event.type), ['created']);
    assert.throws(() => records.timeline('company-b', created.id), /not found/);
    records.approveSupplierQuote('company-a', created.id, 'owner');
    records.transition('company-a', created.id, 'awaiting_approval', ['draft']);
    assert.deepEqual(records.timeline('company-a', created.id).map(event => event.type),
      ['created', 'supplier_quote_approved', 'status_changed']);
    assert.equal(records.timeline('company-a', created.id).every(event => event.transactionHash === null), true);
  } finally { records.close(); }
});

test('a sale proof appears only after exact verified collection evidence is saved', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-timeline-'));
  const path = join(directory, 'business.sqlite');
  const records = new BusinessRecordRepository(path), links = new PaymentLinkRepository(path);
  try {
    const details = { kind: 'invoice', title: 'Service', counterparty: 'Customer', recipient: 'merchant.testnet',
      amount: '1', dueDate: '2026-11-20', description: '' };
    const invoice = records.create('company-a', details);
    const link = links.create({ ...details, paymentWalletAddress: details.recipient }, invoice.id);
    records.transition('company-a', invoice.id, 'issued', ['draft'], { paymentLinkCode: link.code });
    assert.equal(records.timeline('company-a', invoice.id).some(event => event.type === 'sale_verified'), false);
    const hash = encodeBase58(new Uint8Array(32).fill(23));
    links.record(link.code, hash, 'payer.testnet', details.amount);
    records.settleVerifiedInvoice('company-a', invoice.id, hash);
    const proof = records.timeline('company-a', invoice.id).find(event => event.type === 'sale_verified');
    assert.equal(proof.transactionHash, hash);
    assert.equal(proof.status, 'paid');
  } finally { links.close(); records.close(); rmSync(directory, { recursive: true, force: true }); }
});
