import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceTotals} from '../services/near/invoice-total.ts';
test('native invoices preserve exact line amounts, tax and discounts',()=>{
  assert.equal(invoiceTotals([{quantity:'1',unitPrice:'0.1'},{quantity:'1',unitPrice:'0.2'}]).total,'0.3');
  assert.deepEqual(invoiceTotals([{quantity:'3',unitPrice:'0.1'}],'10','0.01'),{subtotal:'0.3',tax:'0.03',total:'0.32',lines:['0.3']});
  assert.equal(invoiceTotals([{quantity:'1',unitPrice:'9007199254.740993'}]).total,'9007199254.740993');
});
test('native invoices reject inexact charges, fractional quantities and negative totals',()=>{
  assert.throws(()=>invoiceTotals([{quantity:'1',unitPrice:'0.000001'}],'10'),/micro-unit/);
  assert.throws(()=>invoiceTotals([{quantity:'1.5',unitPrice:'1'}]),/whole/);
  assert.throws(()=>invoiceTotals([{quantity:'1',unitPrice:'1.0000001'}]),/precision/);
  assert.throws(()=>invoiceTotals([{quantity:'1',unitPrice:'1'}],'101'),/percent/);
  assert.throws(()=>invoiceTotals([{quantity:'1',unitPrice:'1'}],'0','2'),/Discount/);
});
