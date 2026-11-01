import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeBase58} from '../services/near/base58.ts';
import {contractSnapshot} from '../services/near/contract-snapshot.ts';
import {verifiedVault,verifiedGiftEscrow} from '../services/near/contract-state.ts';
import {giftFundingCall,giftActionCall,vaultQueueCall,vaultPaymentCall} from '../services/near/contract-actions.ts';

const codeHash=encodeBase58(new Uint8Array(32).fill(1)),blockHash=encodeBase58(new Uint8Array(32).fill(2));
export function contractFixture() {
  const binding={networkId:'testnet',expectedRpcChainId:'testnet',accountId:'vault.testnet',codeHash,tokenId:'usdc.testnet',ownerId:'owner.testnet',executorId:'executor.testnet'};
  const config={owner:binding.ownerId,pending_owner:null,executor:binding.executorId,token_id:binding.tokenId,policy:{payment_limit:'20000000',daily_limit:'30000000',lifetime_limit:'100000000',approval_threshold:'10000000',liquidity_floor:'5000000',required_approvals:2},policy_version:'1',paused:false,liquid:'100000000',lifetime_committed:'0',in_flight:0,approver_count:2};
  const state={chainId:'testnet',protocol:84,codeHash,metadata:{symbol:'USDC',decimals:6},config,balance:'100000000',gift:{sender:'sender.testnet',recipient:'recipient.testnet',amount:'1000000',expires_at_sec:'1900000000',status:'active',attempt:'0'},payment:null};
  const calls=[];
  async function rpc(method,params) {
    calls.push({method,params});
    if(method==='status')return {chain_id:state.chainId,protocol_version:state.protocol};
    if(method==='block')return {header:{hash:blockHash,height:100,timestamp_nanosec:'1800000000000000000'}};
    assert.equal(method,'query');assert.equal(params.block_id,blockHash);assert.equal(params.finality,undefined);
    if(params.request_type==='view_account')return {code_hash:state.codeHash};
    const values={ft_metadata:state.metadata,ft_balance_of:state.balance,get_config:state.config,get_token_id:binding.tokenId,get_gift:state.gift,get_payment:state.payment};
    assert.ok(Object.hasOwn(values,params.method_name));
    return {result:[...new TextEncoder().encode(JSON.stringify(values[params.method_name]))]};
  }
  return {binding,state,calls,rpc};
}
test('contract identity, policy and token observations share one final block',async()=>{
  const f=contractFixture(),vault=await verifiedVault(f.binding,f.rpc);
  assert.equal(vault.config.policy.required_approvals,2);assert.equal(vault.blockHash,blockHash);
  assert.equal(vault.tokenBalance,'100000000');assert.equal(await vault.payment('pending_1'),null);
  assert.equal(f.calls.filter(call=>call.method==='block').length,1);
  assert.ok(f.calls.filter(call=>call.method==='query').every(call=>call.params.block_id===blockHash));
});
test('native contract reads reject wrong chain, unsupported protocol, code and token',async()=>{
  for(const change of [s=>s.chainId='mainnet',s=>s.protocol=83,s=>s.codeHash=blockHash,s=>s.metadata.decimals=18,s=>s.metadata.symbol='FAKE']) {
    const f=contractFixture();change(f.state);await assert.rejects(contractSnapshot(f.binding,f.rpc));
  }
  const f=contractFixture();await assert.rejects(contractSnapshot({...f.binding,expectedRpcChainId:'mainnet'},f.rpc),/network/);
  await assert.rejects(contractSnapshot({...f.binding,codeHash:'1'.repeat(32)},f.rpc),/identity/);
});
test('vault authority and accounting cannot be substituted by a matching API shape',async()=>{
  for(const change of [s=>s.config.owner='attacker.testnet',s=>s.config.executor='attacker.testnet',s=>s.config.token_id='fake.testnet',s=>s.config.policy_version='0',s=>s.balance='99999999',s=>s.config.policy.payment_limit='3e6',s=>s.config.policy.required_approvals=0]) {
    const f=contractFixture();change(f.state);await assert.rejects(verifiedVault(f.binding,f.rpc));
  }
});
test('readers preserve in-flight gift states and reject malformed payment approvals',async()=>{
  const f=contractFixture();f.state.gift.status='claiming';
  const gift=await verifiedGiftEscrow(f.binding,f.rpc);assert.equal((await gift.gift('gift_1')).status,'claiming');
  f.state.payment={recipient:'recipient.testnet',amount:'1000000',expires_at_sec:'1900000000',policy_version:'1',approved_by:['owner.testnet','owner.testnet'],status:'queued',dispatch_day:'0',attempt:'0'};
  const vault=await verifiedVault(f.binding,f.rpc);await assert.rejects(vault.payment('payment_1'),/state/);
  await assert.rejects(gift.gift('../invalid'),/request ID/);
});
test('sandbox bindings cannot silently target public chains',async()=>{
  const f=contractFixture();await assert.rejects(contractSnapshot({...f.binding,networkId:'sandbox'},f.rpc),/isolated/);
  const sandbox={...f.binding,networkId:'sandbox',expectedRpcChainId:'localnet'};
  await assert.rejects(contractSnapshot(sandbox,f.rpc),/identity/);
  f.state.chainId='localnet';assert.equal((await contractSnapshot(sandbox,f.rpc)).binding.networkId,'sandbox');
});
test('contract actions encode exact native arguments and enough cross-contract gas',()=>{
  const funding=giftFundingCall('usdc.testnet','gifts.testnet',{id:'gift_1',recipient:'recipient.testnet',amount:'1.000001',expiresAt:'1900000000'});
  assert.equal(funding.methodName,'ft_transfer_call');assert.equal(funding.deposit,'1');assert.equal(funding.args.amount,'1000001');
  assert.deepEqual(JSON.parse(funding.args.msg),{gift_id:'gift_1',recipient:'recipient.testnet',expires_at_sec:'1900000000'});
  assert.ok(BigInt(funding.gas)>=100000000000000n);
  assert.equal(giftActionCall('gifts.testnet','gift_1','refund').methodName,'refund_gift');
  const queue=vaultQueueCall('vault.testnet',{id:'payment_1',recipient:'recipient.testnet',amount:'0.000001',expiresAt:'1900000000'});
  assert.equal(queue.args.amount,'1');assert.equal(queue.deposit,'0');
  assert.equal(vaultPaymentCall('vault.testnet','payment_1','approve').deposit,'1');
  assert.equal(vaultPaymentCall('vault.testnet','payment_1','execute').deposit,'0');
  assert.throws(()=>giftActionCall('gifts.testnet','gift_1','unknown'));
  assert.throws(()=>giftFundingCall('usdc.testnet','gifts.testnet',{id:'gift_1',recipient:'0x'+'1'.repeat(40),amount:'1',expiresAt:'1900000000'}));
  assert.throws(()=>vaultQueueCall('vault.testnet',{id:'payment_1',recipient:'recipient.testnet',amount:'0.0000001',expiresAt:'1900000000'}));
});
