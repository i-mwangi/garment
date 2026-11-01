import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GiftRepository } from "../services/server/gift-escrow.ts";
import {encodeBase58} from '../services/near/base58.ts';
test("native gift history preserves case, funding uniqueness, deployment and company scope",()=>{
 const directory=mkdtempSync(join(tmpdir(),'settlbox-near-gifts-')),path=join(directory,'gifts.sqlite');
 let repository=new GiftRepository(path);
 const gift={id:'Gift_One',networkId:'testnet',escrowId:'gifts.testnet',sender:'sender.testnet',recipient:'recipient.testnet',amount:'0.000001',expiresAt:2000000000,status:'active',transactionHash:encodeBase58(new Uint8Array(32).fill(9))};
 try {
  repository.save('company',gift);repository.save('company',gift);
  assert.deepEqual(repository.list('company','testnet',gift.escrowId),[gift]);
  assert.deepEqual(repository.list('other','testnet',gift.escrowId),[]);
  assert.deepEqual(repository.list('company','mainnet',gift.escrowId),[]);
  assert.deepEqual(repository.list('company','testnet','other.testnet'),[]);
  assert.throws(()=>repository.save('other',gift),/another record/);
  assert.throws(()=>repository.save('company',{...gift,id:'AnotherGift'}),/another record/);
  assert.throws(()=>repository.save('company',{...gift,amount:'1'}),/terms differ/);
  assert.throws(()=>repository.save('company',{...gift,transactionHash:undefined}),/funding/);
  repository.close();repository=new GiftRepository(path);
  assert.equal(repository.list('company','testnet',gift.escrowId)[0].id,'Gift_One');
  assert.equal(repository.list('company','testnet',gift.escrowId)[0].transactionHash,gift.transactionHash);
 }finally{repository.close();rmSync(directory,{recursive:true});}
});
