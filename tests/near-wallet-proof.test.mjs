import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyNearWalletProof } from '../services/server/near-wallet-proof.ts';
import { encodeBase58 } from '../services/near/base58.ts';
import { implicitAccountId } from '../services/near/account-id.ts';
import { NearRpcError } from '../services/near/rpc.ts';
const {publicKey, privateKey}=generateKeyPairSync('ed25519');
const bytes=new Uint8Array(publicKey.export({format:'der',type:'spki'}).subarray(-32));
const accountId=implicitAccountId(bytes);
const message=`Settlbox workspace authorization\nOrigin: http://localhost:3000\nNetwork: testnet\nWallet: ${accountId}\nNonce: unique`;
const proof=JSON.stringify({accountId,publicKey:'ed25519:'+encodeBase58(bytes),signature:encodeBase58(sign(null,Buffer.from(message),privateKey))});
const reader={verifyNetwork:async()=>{},rpc:async()=>({permission:'FullAccess'})};
test('native ownership proof binds the exact signed challenge and on-chain full access key',async()=>{
  await assert.doesNotReject(verifyNearWalletProof(accountId,message,proof,reader));
  await assert.rejects(verifyNearWalletProof(accountId,message+'tampered',proof,reader),/signature/);
  await assert.rejects(verifyNearWalletProof(accountId,message,proof,{...reader,rpc:async()=>({permission:{FunctionCall:{}}})}),/full-access/);
  await assert.rejects(verifyNearWalletProof('a'.repeat(64),message,proof,reader),/identity/);
});
test('unfunded implicit accounts can prove ownership, while revoked keys cannot',async()=>{
  const missing={...reader,rpc:async()=>{throw new NearRpcError(-32000,`account ${accountId} does not exist while viewing`);}};
  await assert.doesNotReject(verifyNearWalletProof(accountId,message,proof,missing));
  let calls=0;
  const revoked={...reader,rpc:async()=>{if(++calls===1)throw new NearRpcError(-32000,'access key is missing');return {amount:'1'};}};
  await assert.rejects(verifyNearWalletProof(accountId,message,proof,revoked),/RPC/);
  await assert.rejects(verifyNearWalletProof(accountId,message,proof,{...reader,rpc:async()=>{throw new Error('network failure');}}),/network failure/);
});
