import test from 'node:test';
import assert from 'node:assert/strict';
import {vaultAdministrationCall,verifyVaultAdministration} from '../services/near/vault-admin.ts';
import {validateAgentOperation} from '../services/server/agent-tools.ts';
const binding={accountId:'vault.testnet',ownerId:'owner.testnet',executorId:'executor.testnet'};
const expected={hash:'hash',ownerId:binding.ownerId,blockTimestampNs:'1800000000000000000',reviewCreatedAt:'2026-10-27T00:00:00Z'};
function outcome(call){return {final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash:expected.hash,signer_id:expected.ownerId,receiver_id:call.contractId,actions:[{FunctionCall:{method_name:call.methodName,deposit:call.deposit,args:Buffer.from(JSON.stringify(call.args)).toString('base64')}}]},receipts_outcome:[]};}
test('native treasury administration uses NEAR authority and exact owner deposits',()=>{
 for(const action of ['allow_recipient','allow_approver','pause','unpause','configure_executor']) {
  const call=vaultAdministrationCall(binding,action,'recipient.testnet');assert.equal(call.deposit,'1');
  verifyVaultAdministration(call,outcome(call),expected);
  const changed=outcome(call);changed.transaction.signer_id='executor.testnet';assert.throws(()=>verifyVaultAdministration(call,changed,expected));
  assert.throws(()=>verifyVaultAdministration(call,outcome(call),{...expected,blockTimestampNs:'1'}),/predates/);
 }
 assert.throws(()=>vaultAdministrationCall(binding,'allow_approver','executor.testnet'));
 assert.throws(()=>vaultAdministrationCall(binding,'allow_recipient','0x'+'1'.repeat(40)));
 assert.throws(()=>vaultAdministrationCall(binding,'setPolicy'));
 const call=vaultAdministrationCall(binding,'pause'),changed=outcome(call);
 changed.transaction.actions[0].FunctionCall.args=Buffer.from(JSON.stringify({paused:false})).toString('base64');
 assert.throws(()=>verifyVaultAdministration(call,changed,expected),/arguments differ/);
});
test('agent authorization proposals accept native account IDs and reject EVM addresses',()=>{
 assert.equal(validateAgentOperation({tool:'vault.authorize',arguments:{action:'allow_recipient',address:'recipient.testnet'}}).arguments.address,'recipient.testnet');
 assert.throws(()=>validateAgentOperation({tool:'vault.authorize',arguments:{action:'allow_recipient',address:'0x'+'1'.repeat(40)}}));
});
