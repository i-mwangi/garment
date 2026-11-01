import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeRheaPosition,rheaCall,verifyRheaAction} from '../services/near/rhea.ts';
import {canonicalJson,sameJson} from '../services/near/json.ts';
const tokenId='usdc.testnet',providerId='lending.testnet',signerId='reserve.testnet';
const asset={config:{extra_decimals:12,can_deposit:true,can_withdraw:true},supplied:{balance:'100000000000000000000'},borrowed:{balance:'10000000000000000000'},reserved:'0',prot_fee:'0',supply_apr:'0.045'};
const account={supplied:[{token_id:tokenId,balance:'1000001000000000000'}],collateral:[],borrowed:[]};
test('Rhea uses exact internal precision while preserving six-decimal USDC amounts',()=>{
 const value=decodeRheaPosition(asset,account,tokenId,'90000000');assert.equal(value.suppliedBaseUnits,'1000001');assert.equal(value.withdrawableBaseUnits,'1000001');assert.equal(value.apr,'0.045');
 assert.equal(decodeRheaPosition(asset,account,tokenId,'5').withdrawableBaseUnits,'5');
 assert.equal(decodeRheaPosition({...asset,borrowed:{balance:'200000000000000000000'}},account,tokenId,'90000000').withdrawableBaseUnits,'0');
 assert.equal(decodeRheaPosition(null,null,tokenId,'0').supported,false);
 assert.throws(()=>decodeRheaPosition(null,account,tokenId,'0'),/metadata is missing/);
 assert.equal(decodeRheaPosition(asset,{...account,supplied:[],collateral:account.supplied},tokenId,'90000000').suppliedBaseUnits,'0');
 assert.throws(()=>decodeRheaPosition({...asset,config:{...asset.config,extra_decimals:-1}},account,tokenId,'1'));
 const supply=rheaCall(providerId,tokenId,'supply','1.000001',12,'request');assert.equal(supply.args.amount,'1000001');assert.equal(supply.args.msg,'');
 const withdrawal=rheaCall(providerId,tokenId,'withdraw','1.000001',12,'request');assert.equal(withdrawal.args.actions[0].Withdraw.max_amount,'1000001000000000000');assert.equal(withdrawal.deposit,'1');
 assert.throws(()=>rheaCall(providerId,tokenId,'withdraw','0.0000001',12,'request'));
});
test('native action comparisons preserve nested enum structure and reject added instructions',()=>{
 assert.ok(sameJson({actions:[{Withdraw:{token_id:tokenId,max_amount:'1'}}]},{actions:[{Withdraw:{max_amount:'1',token_id:tokenId}}]}));
 assert.equal(sameJson({actions:[{Withdraw:{token_id:tokenId,max_amount:'1'}}]},{actions:[{Borrow:{token_id:tokenId,max_amount:'1'}}]}),false);
 assert.throws(()=>canonicalJson({value:Infinity}));
});
test('Rhea confirmations require authoritative token and provider completion events',()=>{
 for(const action of ['supply','withdraw']){
  const call=rheaCall(providerId,tokenId,action,'1.000001',12,'reference'),hash='B'.repeat(43);
  const event=(executor,standard,event,data)=>({id:executor,outcome:{executor_id:executor,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard,event,data:[data]})]}});
  const outcome={final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash,signer_id:signerId,receiver_id:call.contractId,actions:[{FunctionCall:{method_name:call.methodName,deposit:call.deposit,args:Buffer.from(JSON.stringify(call.args)).toString('base64')}}]},receipts_outcome:[event(tokenId,'nep141','ft_transfer',{old_owner_id:action==='supply'?signerId:providerId,new_owner_id:action==='supply'?providerId:signerId,amount:'1000001'}),event(providerId,'burrow',action==='supply'?'deposit':'withdraw_succeeded',{account_id:signerId,token_id:tokenId,amount:'1000001000000000000'})]};
  const expected={hash,signerId,providerId,tokenId,amount:'1.000001',extraDecimals:12,action};verifyRheaAction(outcome,call,expected);
  outcome.receipts_outcome[1].outcome.logs=[];assert.throws(()=>verifyRheaAction(outcome,call,expected),/completion/);
 }
});
