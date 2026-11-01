import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyVaultSettlement,verifyExecutorCall,verifyVaultFunding} from '../services/near/vault-settlement.ts';
import {vaultPaymentCall,vaultFundingCall} from '../services/near/contract-actions.ts';
import {encodeBase58} from '../services/near/base58.ts';
const payment={id:'payment_one',recipient:'recipient.testnet',amount:'1.000001'},call=vaultPaymentCall('vault.testnet',payment.id,'execute');
const expected={hash:encodeBase58(new Uint8Array(32).fill(8)),executorId:'executor.testnet',tokenId:'usdc.testnet'};
function fixture(){const event=(executor,standard,name,item)=>({id:executor,outcome:{executor_id:executor,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard,event:name,data:[item]})]}});return {final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash:expected.hash,signer_id:expected.executorId,receiver_id:call.contractId,actions:[{FunctionCall:{method_name:call.methodName,deposit:'0',args:Buffer.from(JSON.stringify(call.args)).toString('base64')}}]},receipts_outcome:[event(expected.tokenId,'nep141','ft_transfer',{old_owner_id:call.contractId,new_owner_id:payment.recipient,amount:'1000001',memo:`settlbox-vault:${payment.id}`}),event(call.contractId,'settlbox_vault','payment_executed',{payment_id:payment.id,recipient:payment.recipient,amount:'1000001'})]};}
test('native treasury settlement requires exact method, signer, USDC event and private callback completion',()=>{
 verifyVaultSettlement(fixture(),call,payment,expected);
 for(const mutate of [o=>o.transaction.signer_id='owner.testnet',o=>o.transaction.receiver_id='other.testnet',o=>o.receipts_outcome[0].outcome.executor_id='fake.testnet',o=>o.receipts_outcome[1].outcome.logs=[],o=>o.receipts_outcome[0].outcome.status={Failure:{}},o=>o.final_execution_status='EXECUTED',o=>o.transaction.actions[0].FunctionCall.method_name='recover']){const outcome=fixture();mutate(outcome);assert.throws(()=>verifyVaultSettlement(outcome,call,payment,expected));}
 assert.throws(()=>verifyVaultSettlement(fixture(),call,{...payment,amount:'1'},expected));
 assert.throws(()=>verifyVaultSettlement(fixture(),call,{...payment,id:'other'},expected));
 const bad=fixture();bad.transaction.actions[0].FunctionCall.args=Buffer.from(JSON.stringify({payment_id:'other'})).toString('base64');assert.throws(()=>verifyExecutorCall(bad,call,expected),/terms differ/);
});

test('native vault funding is credited only after the token transfer and deposit callback',()=>{
 const funding=vaultFundingCall(expected.tokenId,'vault.testnet','1.000001','funding_one');
 const outcome=fixture();outcome.transaction.receiver_id=expected.tokenId;
 outcome.transaction.actions=[{FunctionCall:{method_name:funding.methodName,deposit:'1',args:Buffer.from(JSON.stringify(funding.args)).toString('base64')}}];
 outcome.receipts_outcome[0].outcome.logs=['EVENT_JSON:'+JSON.stringify({standard:'nep141',event:'ft_transfer',data:[{old_owner_id:expected.executorId,new_owner_id:'vault.testnet',amount:'1000001'}]})];
 outcome.receipts_outcome[1].outcome.logs=['EVENT_JSON:'+JSON.stringify({standard:'settlbox_vault',event:'deposited',data:[{sender_id:expected.executorId,amount:'1000001'}]})];
 verifyVaultFunding(outcome,funding,'vault.testnet',{hash:expected.hash,signerId:expected.executorId});
 outcome.receipts_outcome[1].outcome.logs=[];
 assert.throws(()=>verifyVaultFunding(outcome,funding,'vault.testnet',{hash:expected.hash,signerId:expected.executorId}),/funded USDC ledger/);
});
