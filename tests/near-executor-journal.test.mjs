import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NearSubmissionJournal} from '../services/server/near-submission-journal.ts';
import {verifyExecutorPermission} from '../services/near/executor-permission.ts';
import {encodeBase58} from '../services/near/base58.ts';
const hash=encodeBase58(new Uint8Array(32).fill(11));
const input={id:'one',scope:'testnet',executor:'executor.testnet',fingerprint:'queue-payment-one'};
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'near-submission-'));const path=join(dir,'journal.sqlite');const a=new NearSubmissionJournal(path),b=new NearSubmissionJournal(path);try{fn(a,b,path);}finally{a.close();b.close();rmSync(dir,{recursive:true});}}
test('native signing lease fences competing workers and expired signatures',()=>fixture((a,b)=>{
 const first=a.begin(input,1000);assert.throws(()=>b.begin(input,1001),/already/);
 const replacement=b.begin(input,62000);assert.notEqual(first.token,replacement.token);
 assert.throws(()=>a.signed(first,hash,'AQID',62001),/expired or was replaced/);
 const saved=b.signed(replacement,hash,'AQID',62001);assert.equal(saved.hash,hash);
 assert.throws(()=>a.begin({...input,id:'another'},62002),/outstanding/);
 assert.deepEqual(a.begin(input,62002),saved);
 assert.throws(()=>a.begin({...input,fingerprint:'changed'},62002),/different/);
}));
test('native signed bytes survive reopening and retries cannot allocate another nonce',()=>fixture((a,b,path)=>{
 const prepared=a.begin(input,1000),saved=a.signed(prepared,hash,'AQID',1001);
 const reopened=new NearSubmissionJournal(path);try{assert.deepEqual(reopened.begin(input,999999),saved);}finally{reopened.close();}
 assert.throws(()=>b.resolve(input.id,encodeBase58(new Uint8Array(32).fill(12))),/does not match/);
 b.resolve(input.id,hash);assert.equal(a.begin(input,999999).state,'resolved');
 assert.equal(a.begin({...input,id:'next'},999999).state,'preparing');
}));
test('executor access keys cannot own, approve, call another contract or have unlimited allowance',()=>{
 const permission={permission:{FunctionCall:{receiver_id:'vault.testnet',allowance:'1000000000000000000000',method_names:['queue_payment','execute_payment']}}};
 verifyExecutorPermission(permission,'vault.testnet','queue_payment');
 for(const value of [{permission:'FullAccess'},{permission:{FunctionCall:{...permission.permission.FunctionCall,allowance:null}}},{permission:{FunctionCall:{...permission.permission.FunctionCall,receiver_id:'other.testnet'}}},{permission:{FunctionCall:{...permission.permission.FunctionCall,method_names:[]}}},{permission:{FunctionCall:{...permission.permission.FunctionCall,method_names:['approve_payment','queue_payment']}}}])assert.throws(()=>verifyExecutorPermission(value,'vault.testnet','queue_payment'));
 assert.throws(()=>verifyExecutorPermission(permission,'vault.testnet','approve_payment'));
});
