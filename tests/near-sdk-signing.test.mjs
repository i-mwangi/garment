import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getED25519Key } from '@web3auth/modal';
import { KeyPair, KeyPairSigner, createTransaction, actions } from 'near-api-js';
import { encodeBase58 } from '../services/near/base58.ts';
import { implicitAccountId } from '../services/near/account-id.ts';

test('Web3Auth derivation signs the exact native NEAR transaction digest',async()=>{
  // Public deterministic test fixture. Never use this key for a real account.
  const derived=getED25519Key('11'.repeat(32));
  const again=getED25519Key('11'.repeat(32));
  try {
    assert.deepEqual(derived.pk,again.pk);
    const key=KeyPair.fromString('ed25519:'+encodeBase58(derived.sk));
    assert.equal(key.getPublicKey().data.length,32);
    const accountId=implicitAccountId(key.getPublicKey().data);
    assert.equal(implicitAccountId(derived.pk),accountId);
    const tx=createTransaction(accountId,key.getPublicKey(),'token.testnet',1n,[actions.functionCall('ft_transfer',{receiver_id:'recipient.testnet',amount:'1000001'},30000000000000n,1n)],new Uint8Array(32).fill(2));
    const signed=await new KeyPairSigner(key).signTransaction(tx);
    assert.deepEqual(Buffer.from(signed.txHash),createHash('sha256').update(tx.encode()).digest());
    assert.ok(key.verify(signed.txHash,signed.signedTransaction.signature.data));
    assert.equal(signed.signedTransaction.transaction.signerId,accountId);
    assert.equal(signed.signedTransaction.transaction.receiverId,'token.testnet');
  } finally { derived.sk.fill(0);again.sk.fill(0); }
});

test('embedded native funding signs one exact Transfer to the derived deployment account',async()=>{
 const derived=getED25519Key('22'.repeat(32));
 try{
  const key=KeyPair.fromString('ed25519:'+encodeBase58(derived.sk));
  const receiver=implicitAccountId(new Uint8Array(32).fill(3));
  const amount=5000000000000000000000000n;
  const tx=createTransaction(implicitAccountId(key.getPublicKey().data),key.getPublicKey(),receiver,2n,[actions.transfer(amount)],new Uint8Array(32).fill(4));
  const signed=await new KeyPairSigner(key).signTransaction(tx);
  assert.equal(tx.actions.length,1);assert.equal(tx.actions[0].transfer.deposit,amount);
  assert.equal(tx.receiverId,receiver);assert.equal(tx.actions[0].functionCall,undefined);
  assert.ok(key.verify(signed.txHash,signed.signedTransaction.signature.data));
 }finally{derived.sk.fill(0);}
});
