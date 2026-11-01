import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {nativeOwnershipCall} from '../services/near/ownership.ts';
import {commitNativeVaultOwner} from '../services/server/near-ownership-config.ts';
const binding={networkId:'testnet',expectedRpcChainId:'testnet',accountId:'vault.testnet',codeHash:'B'.repeat(43),tokenId:'usdc.testnet',ownerId:'owner.testnet',executorId:'executor.testnet'};
const state={owner:binding.ownerId,pending_owner:'new-admin.testnet',paused:true,in_flight:0};
test('native ownership requires paused, idle vault and two distinct human signatures',()=>{
 const proposal=nativeOwnershipCall(binding,state,'owner.testnet','propose_owner','new-admin.testnet');
 assert.deepEqual(proposal.args,{owner:'new-admin.testnet'});assert.equal(proposal.deposit,'1');
 const acceptance=nativeOwnershipCall(binding,state,'new-admin.testnet','accept_ownership','new-admin.testnet');assert.deepEqual(acceptance.args,{});
 for(const change of [{...state,paused:false},{...state,in_flight:1},{...state,pending_owner:'other.testnet'}])assert.throws(()=>nativeOwnershipCall(binding,change,'new-admin.testnet','accept_ownership','new-admin.testnet'));
 assert.throws(()=>nativeOwnershipCall(binding,state,'owner.testnet','accept_ownership','new-admin.testnet'));
 assert.throws(()=>nativeOwnershipCall(binding,state,'new-admin.testnet','propose_owner','another.testnet'));
 assert.throws(()=>nativeOwnershipCall(binding,state,'owner.testnet','propose_owner','executor.testnet'));
});
test('verified ownership configuration update is atomic, idempotent and preserves collection settings',()=>{
 const directory=mkdtempSync(join(tmpdir(),'near-ownership-')),path=join(directory,'contracts.json'),previous=process.env.SETTLBOX_NEAR_CONTRACT_CONFIG;
 const config={companyId:'company',networkId:'testnet',tokenId:binding.tokenId,treasury:{accountId:binding.accountId,codeHash:binding.codeHash,ownerId:binding.ownerId,executorId:binding.executorId},gifts:{accountId:'gifts.testnet',codeHash:'C'.repeat(43)}};
 process.env.SETTLBOX_NEAR_CONTRACT_CONFIG=path;
 try {
  writeFileSync(path,JSON.stringify(config));assert.throws(()=>commitNativeVaultOwner('other',binding,'new-admin.testnet'),/changed/);
  assert.equal(JSON.parse(readFileSync(path,'utf8')).treasury.ownerId,binding.ownerId);
  commitNativeVaultOwner('company',binding,'new-admin.testnet');commitNativeVaultOwner('company',binding,'new-admin.testnet');
  const result=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(result,{...config,treasury:{...config.treasury,ownerId:'new-admin.testnet'}});
 }finally{if(previous===undefined)delete process.env.SETTLBOX_NEAR_CONTRACT_CONFIG;else process.env.SETTLBOX_NEAR_CONTRACT_CONFIG=previous;rmSync(directory,{recursive:true});}
});
