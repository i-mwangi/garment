import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmount } from '../services/near/amount.ts';
import { isNearAccountId, implicitAccountId, isNearTransactionHash } from '../services/near/account-id.ts';
import { createNearReader, assertFinalSuccess } from '../services/near/rpc.ts';
import { encodeBase58, decodeBase58 } from '../services/near/base58.ts';

test('USDC and NEAR use distinct exact scales and reject rounded payments', () => {
  assert.equal(parseAmount('1.000001'),1000001n);
  assert.equal(parseAmount('0.000000000000000000000001',24),1n);
  assert.equal(formatAmount(1000001n),'1.000001');
  assert.throws(()=>parseAmount('0.0000001'));
  assert.throws(()=>parseAmount('1e6'));
  assert.throws(()=>parseAmount('-1'));
  assert.equal(formatAmount(123456789012345678901234567890n,24),'123456.78901234567890123456789');
});
test('native account IDs reject EVM addresses and malformed separators', () => {
  for(const id of ['alice.near','team.testnet','a'.repeat(64)]) assert.ok(isNearAccountId(id));
  for(const id of ['0x123ABC','0x'+'a'.repeat(40),'Alice.near','a..near','a_-b','a','-abc','abc.']) assert.equal(isNearAccountId(id),false);
  assert.equal(implicitAccountId(new Uint8Array(32).fill(1)),'01'.repeat(32));
  assert.equal(isNearTransactionHash('0x'+'a'.repeat(64)),false);
  for(const bytes of [new Uint8Array(32),new Uint8Array([...new Uint8Array(3),...new Uint8Array(29).fill(1)])]) {
    assert.equal(isNearTransactionHash(encodeBase58(bytes)),true);
  }
  assert.equal(isNearTransactionHash(encodeBase58(new Uint8Array(31))),false);
});
test('base58 preserves leading zero bytes and rejects invalid alphabet',()=>{
  for (const bytes of [new Uint8Array(),new Uint8Array(32),new Uint8Array([0,0,255,10,123])]) assert.deepEqual(decodeBase58(encodeBase58(bytes)),bytes);
  assert.throws(()=>decodeBase58('0OIl'));
});
const network={networkId:'testnet',name:'NEAR Testnet',rpcUrl:'https://rpc.testnet.near.org',usdcContractId:'token.testnet',usdcDecimals:6,explorerUrl:'https://testnet.nearblocks.io'};
test('legacy query result errors cannot masquerade as account or access-key data',async()=>{
  const reader=createNearReader(network,async()=>Response.json({result:{error:'account alice.testnet does not exist while viewing',logs:[]}}));
  await assert.rejects(reader.rpc('query',{}),error=>error.detail==='account alice.testnet does not exist while viewing');
});
test('RPC network mismatch prevents token reads', async()=>{
  let calls=0;
  const reader=createNearReader(network,async()=>{calls++;return Response.json({result:{chain_id:'mainnet'}})});
  await assert.rejects(reader.getUsdcBalance('alice.testnet'),/network/);
  assert.equal(calls,1);
});
test('token metadata mismatch prevents a misleading balance',async()=>{
  const reader=createNearReader(network,async(_url,options)=>{
    const call=JSON.parse(options.body);
    return Response.json({result:call.method==='status'?{chain_id:'testnet'}:{result:[...new TextEncoder().encode(JSON.stringify({symbol:'USDC',decimals:18}))]}});
  });
  await assert.rejects(reader.getUsdcBalance('alice.testnet'),/metadata/);
});
test('outer success cannot hide failed child receipts or non-final execution',()=>{
  const result={final_execution_status:'FINAL',status:{SuccessValue:''},receipts_outcome:[{outcome:{status:{Failure:{}}}}]};
  assert.throws(()=>assertFinalSuccess(result),/receipt/);
  assert.throws(()=>assertFinalSuccess({...result,final_execution_status:'EXECUTED',receipts_outcome:[]}),/finally/);
  assert.doesNotThrow(()=>assertFinalSuccess({...result,receipts_outcome:[]}));
});
