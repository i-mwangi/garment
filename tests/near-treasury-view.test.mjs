import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePaymentView} from '../services/server/near-treasury-service.ts';
const payment={id:'a'.repeat(64),companyId:'company',recordId:'record',runId:'run',recipient:'recipient.testnet',amount:'9007199254.740993',networkId:'testnet',vaultId:'vault.testnet',codeHash:'A'.repeat(44),expiresAt:'1900000000',createdAt:'2026-10-28T00:00:00Z',requestedBy:'owner',status:'paid',transactionHash:'B'.repeat(43)};
test('native treasury presentation retains exact money, record identity and case-sensitive settlement hashes',()=>{
 const view=nativePaymentView(payment,{kind:'payroll',title:'October payroll'});
 assert.equal(view.intent.amount.baseUnits,'9007199254740993');assert.equal(view.intent.amount.decimals,6);
 assert.equal(view.intent.id,'record');assert.equal(view.intent.walletId,'vault.testnet');assert.equal(view.intent.recipient,'recipient.testnet');
 assert.equal(view.execution.transactionHash,payment.transactionHash);assert.equal(view.execution.status,'confirmed');assert.equal(view.intent.purpose,'payroll');
});
test('pending and failed-review journal entries never present a confirmed payment',()=>{
 for(const status of ['queue_pending','awaiting_approval','executing','execute_review_required']){
  const view=nativePaymentView({...payment,status,transactionHash:undefined});assert.notEqual(view.execution.status,'confirmed');assert.equal(view.execution.transactionHash,undefined);
  if(status.endsWith('review_required'))assert.match(view.execution.failureReason,/no replacement/);
 }
});
