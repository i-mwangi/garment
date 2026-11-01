import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNearLinkSettlement } from '../services/near/link-settlement.ts';
const hash='B'.repeat(44);
const link={code:'invoice-one',paymentWalletAddress:'business.testnet',amount:'1.000001',createdAt:'2026-10-27T00:00:00Z'};
const expected={tokenId:'usdc.testnet',signerId:'payer.testnet',hash,blockTimestampNs:String(BigInt(Date.parse(link.createdAt)+1000)*1000000n)};
const args={receiver_id:link.paymentWalletAddress,amount:'1000001',memo:'settlbox-link:'+link.code};
function outcome(overrides={}) { return {
  final_execution_status:'FINAL',status:{SuccessValue:''},
  transaction:{hash,signer_id:expected.signerId,receiver_id:expected.tokenId,actions:[{FunctionCall:{method_name:'ft_transfer',deposit:'1',args:Buffer.from(JSON.stringify(args)).toString('base64')}}]},
  receipts_outcome:[{id:'receipt',outcome:{executor_id:expected.tokenId,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard:'nep141',event:'ft_transfer',data:[{old_owner_id:expected.signerId,new_owner_id:link.paymentWalletAddress,amount:args.amount}]})]}}],
  ...overrides,
}; }
test('native checkout requires exact signed terms, native token event and final successful receipts',()=>{
  assert.equal(verifyNearLinkSettlement(link,outcome(),expected),expected.signerId);
  assert.throws(()=>verifyNearLinkSettlement({...link,code:'another-link'},outcome(),expected),/match/);
  assert.throws(()=>verifyNearLinkSettlement({...link,amount:'1'},outcome(),expected),/match/);
  assert.throws(()=>verifyNearLinkSettlement(link,outcome(),{...expected,tokenId:'fake.testnet'}),/identity/);
  assert.throws(()=>verifyNearLinkSettlement(link,outcome(),{...expected,signerId:'another.testnet'}),/identity/);
  assert.throws(()=>verifyNearLinkSettlement(link,outcome(),{...expected,blockTimestampNs:'1'}),/predates/);
  const fakeEvent=outcome();fakeEvent.receipts_outcome[0].outcome.executor_id='fake.testnet';
  assert.throws(()=>verifyNearLinkSettlement(link,fakeEvent,expected),/event/);
  const childFailure=outcome();childFailure.receipts_outcome[0].outcome.status={Failure:{}};
  assert.throws(()=>verifyNearLinkSettlement(link,childFailure,expected),/receipt/);
});
