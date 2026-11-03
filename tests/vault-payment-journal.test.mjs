import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BusinessRecordRepository } from '../services/server/business-records.ts';
import { VaultPaymentJournal, vaultPaymentId, vaultProviderKey } from '../services/server/vault-payment-journal.ts';
const recipient = 'vendor.testnet';
const vaultId='vault.testnet', codeHash='B'.repeat(43), txHash='C'.repeat(43), secondHash='D'.repeat(43);
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(),'settlbox-vault-test-')); const path = join(dir,'business.sqlite');
  const records = new BusinessRecordRepository(path); const journal = new VaultPaymentJournal(path);
  try { return fn(records,journal,path); } finally { journal.close(); records.close(); rmSync(dir,{recursive:true,force:true}); }
}
function create(records, company='company') { return records.create(company,{kind:'bill',title:'Vendor payment',counterparty:'Vendor',recipient,amount:'0.001',dueDate:'2026-10-11',description:'Services'}); }
function payment(record) { return {id:vaultPaymentId(record.companyId,vaultId,record.id),companyId:record.companyId,recordId:record.id,runId:'run',networkId:'testnet',vaultId,codeHash,recipient,amount:'0.001',expiresAt:'1800000000',createdAt:new Date().toISOString(),requestedBy:'owner',status:'queue_pending'}; }
test('vault reservation freezes a saved draft and survives reopening without duplicate allocation',()=>fixture((records,journal)=>{
  const record=create(records);const first=journal.reserve(payment(record));
  assert.equal(records.get('company',record.id).status,'awaiting_approval');
  assert.deepEqual(journal.reserve({...payment(record),runId:'another-run'}),first);
  assert.equal(journal.list('company').length,1);
  assert.throws(()=>records.updateDraft('company',record.id,{...record,amount:'0.002'}),/draft/);
  assert.throws(()=>records.claimPaymentRoute('company',record.id,'treasury'),/different/);
}));
test('a direct treasury route prevents a second vault settlement',()=>fixture((records,journal)=>{
  const record=create(records);records.claimPaymentRoute('company',record.id,'treasury');
  assert.throws(()=>journal.reserve(payment(record)),/another payment route/);
  assert.equal(records.get('company',record.id).status,'draft');assert.equal(journal.list('company').length,0);
}));
test('a quoted bill needs owner approval bound to its current terms before vault reservation',()=>fixture((records,journal)=>{
  const record=records.create('company',{kind:'bill',title:'Vendor payment',counterparty:'Vendor',recipient,amount:'0.001',dueDate:'2026-10-11',description:'Services',supplierQuote:{reference:'Q-1',amount:'0.001',receivedDate:'2026-10-10'}});
  assert.throws(()=>journal.reserve(payment(record)),/owner approval/);
  assert.equal(records.get('company',record.id).status,'draft');
  const approved=records.approveSupplierQuote('company',record.id,'owner');
  assert.equal(journal.reserve(payment(approved)).recordId,record.id);
}));
test('reservations enforce aggregate liquidity rather than accepting each payment independently',()=>fixture((records,journal)=>{
  const first=create(records);const second=create(records);
  journal.reserve(payment(first),1000n);
  assert.throws(()=>journal.reserve(payment(second),1000n),/reserved liquidity/);
  assert.equal(records.get('company',second.id).status,'draft');
  assert.equal(journal.reserved('company'),1000n);
}));
test('reservation rejects changed terms, historical paid records and company spoofing',()=>fixture((records,journal)=>{
  const record=create(records);
  assert.throws(()=>journal.reserve({...payment(record),amount:'0.002'}),/changed/);
  assert.throws(()=>journal.reserve({...payment(record),companyId:'other'}),/deployment|changed/);
  records.transition('company',record.id,'paid',['draft']);
  assert.throws(()=>journal.reserve(payment(record)),/already/);
}));
test('provider requests and audit history are company-scoped and stage-specific',()=>fixture((records,journal)=>{
  const record=create(records);const saved=journal.reserve(payment(record));
  journal.patch(saved,{queueTransactionHash:txHash},'Queue accepted');
  assert.equal(journal.get('company',record.id).queueTransactionHash,txHash);
  assert.equal(journal.get('other',record.id),undefined);assert.equal(journal.events('other').length,0);
  assert.equal(journal.events('company').length,2);
  assert.equal(vaultProviderKey(saved.id,'queue'),vaultProviderKey(saved.id,'queue'));
  assert.notEqual(vaultProviderKey(saved.id,'queue'),vaultProviderKey(saved.id,'execute'));
  assert.notEqual(vaultPaymentId('other',recipient,record.id),saved.id);
}));

test('stale provider results cannot regress terminal state or replace payment identity',()=>fixture((records,journal)=>{
  const saved=journal.reserve(payment(create(records)));
  const pending=journal.patch(saved,{executeTransactionHash:txHash,status:'execution_pending'},'Submitted');
  assert.throws(()=>journal.patch(saved,{status:'ready'},'Stale response'),/changed/);
  assert.throws(()=>journal.patch(pending,{executeTransactionHash:secondHash},'Replacement'),/identity/);
  assert.throws(()=>journal.patch(pending,{amount:'10'},'Changed terms'),/instructions/);
  const paid=journal.patch(pending,{status:'paid',transactionHash:txHash},'Settled');
  assert.throws(()=>journal.patch(paid,{status:'ready'},'Late response'),/Terminal/);
  assert.equal(journal.get('company',paid.recordId).status,'paid');
  assert.equal(journal.events('company').length,3);
}));

test('verified vault payout evidence is exact, private, and idempotent',()=>fixture((records,journal)=>{
  const record=create(records);
  const saved=journal.reserve(payment(record));
  journal.patch(saved,{executeTransactionHash:txHash,status:'execution_pending'},'Execution submitted');
  assert.equal(records.hasVerifiedPayout('company',record.id),false);
  assert.throws(()=>records.recordVerifiedVaultPayout('company',record.id,saved.id,secondHash,'usdc.testnet'),/journal/);
  assert.equal(records.get('company',record.id).status,'awaiting_approval');
  const paid=records.recordVerifiedVaultPayout('company',record.id,saved.id,txHash,'usdc.testnet');
  assert.equal(paid.status,'paid');
  assert.equal(paid.transactionHash,txHash);
  const evidence=records.listVerifiedPayouts('company')[0];
  assert.equal(evidence.amountUnits,'1000');
  assert.equal(evidence.transactionHash,txHash);
  assert.equal(records.hasVerifiedPayout('company',record.id),true);
  assert.equal(records.hasVerifiedPayout('another',record.id),false);
  assert.deepEqual(records.listVerifiedPayouts('another'),[]);
  assert.ok(!JSON.stringify(evidence).includes(recipient));
  assert.ok(!JSON.stringify(evidence).includes(record.counterparty));
  assert.deepEqual(records.recordVerifiedVaultPayout('company',record.id,saved.id,txHash,'usdc.testnet'),paid);
  assert.deepEqual(records.listVerifiedPayouts('company'),[evidence]);
}));

test('pending execution survives a separate process restart without allocating a second payment',()=>fixture((records,journal,path)=>{
  const saved=journal.reserve(payment(create(records)));
  const pending=journal.patch(saved,{status:'execution_pending',executeTransactionHash:txHash},'Submitted');
  const script = `import {VaultPaymentJournal,vaultProviderKey} from './services/server/vault-payment-journal.ts';
    const journal=new VaultPaymentJournal(process.argv[1]);
    const payment=journal.get('company',process.argv[2]);
    const retry=journal.reserve({...payment,runId:'retry-after-restart'});
    console.log(JSON.stringify({payment:retry,count:journal.list('company').length,key:vaultProviderKey(retry.id,'execute')}));
    journal.close();`;
  const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script,path,pending.recordId],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const recovered=JSON.parse(child.stdout);
  assert.deepEqual(recovered.payment,pending);
  assert.equal(recovered.count,1);
  assert.equal(recovered.key,vaultProviderKey(pending.id,'execute'));
}));
