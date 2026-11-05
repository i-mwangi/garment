import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessRecordRepository, isOwnerApprovedProcurementBill } from '../services/server/business-records.ts';
import { ProcurementQuoteStore } from '../services/server/procurement-quotes.ts';

test('supplier options compare without authorization, and owner selection invalidates old approval', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-procurement-'));
  const path = join(directory, 'business.sqlite');
  const records = new BusinessRecordRepository(path), quotes = new ProcurementQuoteStore(path);
  try {
    const bill = records.create('company-1', { kind: 'bill', title: 'Supplies', counterparty: 'Vendor A',
      recipient: 'vendor-a.near', amount: '1', dueDate: '2026-11-10', description: '',
      supplierQuote: { reference: 'A-1', amount: '1', receivedDate: '2026-11-05' } });
    const approved = records.approveSupplierQuote('company-1', bill.id, 'owner');
    assert.equal(isOwnerApprovedProcurementBill(approved), true);
    const option = quotes.add('company-1', bill.id, { supplier: 'Vendor B', reference: 'B-1', recipient: 'vendor-b.near',
      amount: '0.9', receivedDate: '2026-11-05' }, 'admin');
    assert.equal(quotes.list('company-1', bill.id).length, 1);
    assert.equal(quotes.list('other', bill.id).length, 0);
    assert.equal(quotes.add('company-1', bill.id, { supplier: 'Vendor B', reference: 'B-1', recipient: 'vendor-b.near',
      amount: '0.9', receivedDate: '2026-11-05' }, 'admin').id, option.id);
    assert.throws(() => quotes.add('company-1', bill.id, { supplier: 'Vendor C', reference: 'B-1', recipient: 'vendor-c.near',
      amount: '0.8', receivedDate: '2026-11-05' }, 'admin'), /different terms/);
    const selected = quotes.select('company-1', bill.id, option.id);
    assert.equal(selected.counterparty, 'Vendor B');
    assert.equal(selected.amount, '0.9');
    assert.equal(selected.recipient, 'vendor-b.near');
    assert.equal(isOwnerApprovedProcurementBill(selected), false);
    assert.equal(isOwnerApprovedProcurementBill(records.approveSupplierQuote('company-1', bill.id, 'owner')), true);
  } finally { quotes.close(); records.close(); rmSync(directory, { recursive: true, force: true }); }
});
