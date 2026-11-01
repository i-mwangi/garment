import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGiftFunding,verifyGiftAction} from '../services/near/gift-settlement.ts';
import {encodeBase58} from '../services/near/base58.ts';
const hash=encodeBase58(new Uint8Array(32).fill(7));
const gift={id:'Gift_One',networkId:'testnet',escrowId:'gifts.testnet',sender:'sender.testnet',recipient:'recipient.testnet',amount:'1.000001',expiresAt:2000000000,status:'active'};
const expected={hash,signerId:gift.sender,tokenId:'usdc.testnet'};
function fixture(){
 const amount='1000001';
 const event=(executor,standard,event,data)=>({id:executor,outcome:{executor_id:executor,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard,event,data:[data]})]}});
 return {final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash,signer_id:gift.sender,receiver_id:expected.tokenId,actions:[{FunctionCall:{method_name:'ft_transfer_call',deposit:'1',args:Buffer.from(JSON.stringify({receiver_id:gift.escrowId,amount,memo:`settlbox-gift:${gift.id}`,msg:JSON.stringify({gift_id:gift.id,recipient:gift.recipient,expires_at_sec:String(gift.expiresAt)})})).toString('base64')}}]},receipts_outcome:[event(expected.tokenId,'nep141','ft_transfer',{old_owner_id:gift.sender,new_owner_id:gift.escrowId,amount}),event(gift.escrowId,'settlbox_gift','gift_created',{gift_id:gift.id,sender:gift.sender,recipient:gift.recipient,amount,expires_at_sec:String(gift.expiresAt)})]};
}
test('native gift funding requires the exact signed terms and both authoritative events',()=>{
 assert.equal(verifyGiftFunding(gift,fixture(),expected).transactionHash,hash);
 for(const field of ['id','recipient','sender','amount','expiresAt','escrowId']) {
  const changed={...gift,[field]:field==='expiresAt'?gift.expiresAt+1:field==='amount'?'1':'other.testnet'};
  assert.throws(()=>verifyGiftFunding(changed,fixture(),expected));
 }
 for(const mutate of [o=>o.transaction.signer_id='other.testnet',o=>o.transaction.receiver_id='fake.testnet',o=>o.final_execution_status='EXECUTED',o=>o.receipts_outcome[0].outcome.status={Failure:{}},o=>o.receipts_outcome[1].outcome.executor_id='fake.testnet',o=>o.receipts_outcome.pop(),o=>o.transaction.actions[0].FunctionCall.method_name='ft_transfer']) {
  const outcome=fixture();mutate(outcome);assert.throws(()=>verifyGiftFunding(gift,outcome,expected));
 }
});

test('native gift claim and refund confirmations bind the gift, signer and direct method',()=>{
 const outcome=fixture();outcome.transaction.receiver_id=gift.escrowId;outcome.transaction.signer_id=gift.recipient;
 const call=outcome.transaction.actions[0].FunctionCall;call.method_name='claim_gift';call.args=Buffer.from(JSON.stringify({gift_id:gift.id})).toString('base64');
 assert.equal(verifyGiftAction(gift,outcome,{hash,signerId:gift.recipient}),'claimed');
 assert.throws(()=>verifyGiftAction({...gift,id:'AnotherGift'},outcome,{hash,signerId:gift.recipient}));
 assert.throws(()=>verifyGiftAction(gift,outcome,{hash,signerId:gift.sender}));
 call.method_name='refund_gift';outcome.transaction.signer_id=gift.sender;
 assert.equal(verifyGiftAction(gift,outcome,{hash,signerId:gift.sender}),'refunded');
});
