import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNearDeployment} from '../services/server/near-contract-config.ts';
import {encodeBase58} from '../services/near/base58.ts';

const hash='ab'.repeat(32),codeHash=encodeBase58(Buffer.from(hash,'hex'));
const artifacts=[{name:'treasury-vault',sha256:hash},{name:'gift-escrow',sha256:hash}];
const workspace={companyId:'company',accountId:'owner.testnet',networkId:'testnet'};
function config(){return {companyId:'company',networkId:'testnet',tokenId:'usdc.testnet',treasury:{accountId:'vault.testnet',codeHash,ownerId:'owner.testnet',executorId:'executor.testnet'},gifts:{accountId:'gifts.testnet',codeHash}};}
test('deployment binds workspace and both native artifacts without accepting arbitrary code',()=>{
 const value=config();assert.equal(validateNearDeployment(value,workspace,'usdc.testnet',artifacts).treasury.codeHash,codeHash);
 value.gifts.codeHash=encodeBase58(new Uint8Array(32).fill(1));
 assert.throws(()=>validateNearDeployment(value,workspace,'usdc.testnet',artifacts),/approved native artifact/);
});
test('deployment rejects cross-company, cross-network and shared signing authority',()=>{
 for(const change of [v=>v.companyId='other',v=>v.networkId='mainnet',v=>v.tokenId='other.testnet',v=>v.treasury.ownerId='executor.testnet',v=>v.treasury.executorId='owner.testnet',v=>v.gifts.accountId='vault.testnet']) {
  const value=config();change(value);assert.throws(()=>validateNearDeployment(value,workspace,'usdc.testnet',artifacts));
 }
});

test('vault administration can move without changing the workspace collection wallet',()=>{
 const value=config();value.treasury.ownerId='new-admin.testnet';
 const deployment=validateNearDeployment(value,workspace,'usdc.testnet',artifacts);
 assert.equal(deployment.treasury.ownerId,'new-admin.testnet');assert.equal(workspace.accountId,'owner.testnet');
});
