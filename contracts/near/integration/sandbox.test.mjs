import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'near-workspaces';
import {KeyPair,transactions} from 'near-api-js';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const wasm=resolve(project,process.env.SETTLBOX_APPROVED_WASM_DIR || 'contracts/near/target/wasm32-unknown-unknown/release');
const fixture=resolve(project,'contracts/near/target/integration-token/wasm32-unknown-unknown/release/settlbox_near_integration_token.wasm');
const GAS=150000000000000n,NEAR=10n**24n;
const policy={payment_limit:'2000000',daily_limit:'5000000',lifetime_limit:'20000000',approval_threshold:'0',liquidity_floor:'1000000',required_approvals:2};
const report={scope:'Ephemeral NEAR sandbox only; official-standard six-decimal fixture token, not real USDC.',startedAt:new Date().toISOString(),transactionsOnPublicNetworks:false,scenarios:[]};
const reportPath=resolve(project,'docs/NEAR-SANDBOX-RESULT.json');
const record=()=>{mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');};
async function now(worker){const block=await worker.provider.block({finality:'final'});return BigInt(block.header.timestamp_nanosec??block.header.timestamp)/1000000000n;}
async function fixtureSetup(){
 if(process.platform==='win32')throw new Error('NEAR sandbox requires a supported Linux/macOS runner; no tests were executed');
 if(process.env.NEAR_WORKSPACES_NETWORK && process.env.NEAR_WORKSPACES_NETWORK!=='sandbox')throw new Error('This suite refuses public-network execution');
 const worker=await Worker.init({network:'sandbox'});
 try{
  const status=await worker.provider.status();assert.ok(!['mainnet','testnet'].includes(status.chain_id));assert.ok(status.protocol_version>=84,'Sandbox protocol must support the pinned SDK (84+)');
  report.sandbox={chainId:status.chain_id,protocolVersion:status.protocol_version,minimumProtocolVersion:84};
  const root=worker.rootAccount,accounts={};
  for(const name of ['owner','executor','approver','recipient','unregistered','outsider','nominee'])accounts[name]=await root.createSubAccount(name,{initialBalance:100n*NEAR});
  const token=await root.devDeploy(fixture,{method:'new',args:{owner_id:accounts.owner.accountId,total_supply:'1000000000000'},initialBalance:100n*NEAR,gas:GAS});
  const vault=await root.devDeploy(resolve(wasm,'settlbox_near_treasury_vault.wasm'),{method:'new',args:{owner:accounts.owner.accountId,executor:accounts.executor.accountId,token_id:token.accountId,policy},initialBalance:100n*NEAR,gas:GAS});
  const gifts=await root.devDeploy(resolve(wasm,'settlbox_near_gift_escrow.wasm'),{method:'new',args:{token_id:token.accountId},initialBalance:100n*NEAR,gas:GAS});
  const view=(contract,method,args={})=>contract.view(method,args);
  const call=(signer,contract,method,args={},deposit=0n)=>signer.call(contract,method,args,{gas:GAS,attachedDeposit:deposit});
  const raw=(signer,contract,method,args={},deposit=0n,key)=>signer.callRaw(contract,method,args,{gas:GAS,attachedDeposit:deposit,...(key?{signWithKey:key}:{})});
  async function register(account){const bounds=await view(token,'storage_balance_bounds');await call(accounts.owner,token,'storage_deposit',{account_id:account.accountId,registration_only:true},BigInt(bounds.min));}
  for(const account of [vault,gifts,accounts.recipient])await register(account);
  for(const recipient of [accounts.recipient,accounts.unregistered])await call(accounts.owner,vault,'set_recipient',{recipient:recipient.accountId,allowed:true},1n);
  for(const approver of [accounts.owner,accounts.approver])await call(accounts.owner,vault,'set_approver',{approver:approver.accountId,allowed:true},1n);
  await call(accounts.owner,vault,'set_paused',{paused:false},1n);
  await call(accounts.owner,token,'ft_transfer_call',{receiver_id:vault.accountId,amount:'10000000',msg:'deposit'},1n);
  const balance=account=>view(token,'ft_balance_of',{account_id:account.accountId});
  const config=()=>view(vault,'get_config');
  async function queue(id,recipient=accounts.recipient,amount='1000000',key){const args={payment_id:id,recipient:recipient.accountId,amount,expires_at_sec:String(await now(worker)+86400n)};if(key){const result=await raw(accounts.executor,vault,'queue_payment',args,0n,key);assert.equal(result.failed,false,result.summary());}else await call(accounts.executor,vault,'queue_payment',args);}
  async function approve(id){for(const account of [accounts.owner,accounts.approver])await call(account,vault,'approve_payment',{payment_id:id},1n);}
  return {worker,root,...accounts,token,vault,gifts,view,call,raw,register,balance,config,queue,approve};
 }catch(error){await worker.tearDown();throw error;}
}
async function scenario(t,name,run){
 await t.test(name,async()=>{const start=Date.now();try{const evidence=await run();report.scenarios.push({name,passed:true,durationMs:Date.now()-start,...evidence});}catch(error){report.scenarios.push({name,passed:false,error:error.message});throw error;}finally{record();}});
}

test('native asynchronous treasury and gift settlement',{timeout:1800000},async t=>{
 let f;
 try{
  f=await fixtureSetup();
  for(const name of ['treasury-vault','gift-escrow']){const filename=`settlbox_near_${name.replaceAll('-','_')}.wasm`;const bytes=readFileSync(resolve(wasm,filename));const approved=JSON.parse(readFileSync(resolve(project,'docs/NEAR-CONTRACT-ARTIFACTS.json'))).artifacts.find(item=>item.name===name);assert.equal(createHash('sha256').update(bytes).digest('hex'),approved.sha256,'Sandbox must test approved production WASM');}
  await scenario(t,'quorum, restricted executor and exact finalized token settlement',async()=>{
   await f.queue('payment-1');
   await assert.rejects(f.call(f.executor,f.vault,'execute_payment',{payment_id:'payment-1'}));
   await f.call(f.owner,f.vault,'approve_payment',{payment_id:'payment-1'},1n);
   await assert.rejects(f.call(f.owner,f.vault,'approve_payment',{payment_id:'payment-1'},1n));
   await f.call(f.approver,f.vault,'approve_payment',{payment_id:'payment-1'},1n);
   const key=KeyPair.fromRandom('ed25519');
   await f.executor.batch(f.executor).addKey(key.getPublicKey(),transactions.functionCallAccessKey(f.vault.accountId,['queue_payment','execute_payment'],NEAR)).transact();
   const permission=await f.worker.provider.viewAccessKey(f.executor.accountId,key.getPublicKey());
   assert.equal(permission.permission.FunctionCall.receiver_id,f.vault.accountId);assert.deepEqual(permission.permission.FunctionCall.method_names,['queue_payment','execute_payment']);assert.ok(BigInt(permission.permission.FunctionCall.allowance)>0n);
   await assert.rejects(f.executor.call(f.vault,'set_paused',{paused:true},{gas:GAS,attachedDeposit:0n,signWithKey:key}));
   const before=BigInt(await f.balance(f.recipient));
   const paid=await f.raw(f.executor,f.vault,'execute_payment',{payment_id:'payment-1'},0n,key);
   assert.equal(paid.failed,false,paid.summary());assert.deepEqual(paid.receiptFailures,[]);
   assert.equal(BigInt(await f.balance(f.recipient))-before,1000000n);assert.equal((await f.view(f.vault,'get_payment',{payment_id:'payment-1'})).status,'paid');assert.equal((await f.config()).liquid,'9000000');assert.ok(paid.logsContain('payment_executed'));assert.ok(paid.logsContain('ft_transfer'));
   await assert.rejects(f.raw(f.executor,f.vault,'execute_payment',{payment_id:'payment-1'},0n,key).then(result=>{if(result.failed)throw new Error('Replay rejected');}));
   return {gasBurnt:paid.gas_burnt,receiptCount:paid.result.receipts_outcome.length};
  });
  await scenario(t,'failed recipient transfer restores liquidity and retry pays exactly once',async()=>{
   await f.queue('payment-failed',f.unregistered);await f.approve('payment-failed');const before=await f.config();
   const failed=await f.raw(f.executor,f.vault,'execute_payment',{payment_id:'payment-failed'});assert.ok(failed.receiptFailures.length>0);
   const restored=await f.config();assert.equal(restored.liquid,before.liquid);assert.equal(restored.lifetime_committed,before.lifetime_committed);assert.equal(restored.in_flight,0);assert.equal((await f.view(f.vault,'get_payment',{payment_id:'payment-failed'})).status,'queued');
   await f.register(f.unregistered);const paid=await f.raw(f.executor,f.vault,'execute_payment',{payment_id:'payment-failed'});assert.deepEqual(paid.receiptFailures,[]);assert.equal(await f.balance(f.unregistered),'1000000');assert.equal((await f.view(f.vault,'get_payment',{payment_id:'payment-failed'})).status,'paid');
   return {failedChildReceipts:failed.receiptFailures.length,retryGasBurnt:paid.gas_burnt};
  });
  await scenario(t,'gifts reject unauthorized claims, refund duplicate funding, and settle claim once',async()=>{
   const expiry=String(await now(f.worker)+3600n),msg=JSON.stringify({gift_id:'gift-claim',recipient:f.recipient.accountId,expires_at_sec:expiry});
   await f.call(f.owner,f.token,'ft_transfer_call',{receiver_id:f.gifts.accountId,amount:'1000000',msg},1n);
   const before=await f.balance(f.owner);await f.raw(f.owner,f.token,'ft_transfer_call',{receiver_id:f.gifts.accountId,amount:'1000000',msg},1n);assert.equal(await f.balance(f.owner),before);
   await assert.rejects(f.call(f.outsider,f.gifts,'claim_gift',{gift_id:'gift-claim'},1n));
   await assert.rejects(f.call(f.outsider,f.gifts,'on_transfer',{gift_id:'gift-claim',attempt:'1'}));
   const recipientBefore=BigInt(await f.balance(f.recipient)),claim=await f.raw(f.recipient,f.gifts,'claim_gift',{gift_id:'gift-claim'},1n);assert.deepEqual(claim.receiptFailures,[]);assert.equal(BigInt(await f.balance(f.recipient))-recipientBefore,1000000n);assert.equal((await f.view(f.gifts,'get_gift',{gift_id:'gift-claim'})).status,'claimed');
   await assert.rejects(f.call(f.recipient,f.gifts,'claim_gift',{gift_id:'gift-claim'},1n));return {claimGasBurnt:claim.gas_burnt};
  });
  await scenario(t,'expired gift refunds only its sender after the asynchronous token callback',async()=>{
   const expires=String(await now(f.worker)+30n);await f.call(f.owner,f.token,'ft_transfer_call',{receiver_id:f.gifts.accountId,amount:'1000000',msg:JSON.stringify({gift_id:'gift-refund',recipient:f.recipient.accountId,expires_at_sec:expires})},1n);
   await assert.rejects(f.call(f.owner,f.gifts,'refund_gift',{gift_id:'gift-refund'},1n));await f.worker.provider.fastForward(300);for(let attempt=0;attempt<45 && await now(f.worker)<BigInt(expires);attempt++)await new Promise(done=>setTimeout(done,1000));assert.ok(await now(f.worker)>=BigInt(expires));
   await assert.rejects(f.call(f.recipient,f.gifts,'claim_gift',{gift_id:'gift-refund'},1n));await assert.rejects(f.call(f.outsider,f.gifts,'refund_gift',{gift_id:'gift-refund'},1n));
   const before=BigInt(await f.balance(f.owner)),refund=await f.raw(f.owner,f.gifts,'refund_gift',{gift_id:'gift-refund'},1n);assert.deepEqual(refund.receiptFailures,[]);assert.equal(BigInt(await f.balance(f.owner))-before,1000000n);assert.equal((await f.view(f.gifts,'get_gift',{gift_id:'gift-refund'})).status,'refunded');return {refundGasBurnt:refund.gas_burnt};
  });
  await scenario(t,'policy invalidation, paused recovery and two-person owner handover enforce authority',async()=>{
   await f.queue('payment-old-policy');await f.approve('payment-old-policy');await f.call(f.owner,f.vault,'set_policy',{policy:{...policy,payment_limit:'1900000'}},1n);await assert.rejects(f.call(f.executor,f.vault,'execute_payment',{payment_id:'payment-old-policy'}));
   await f.call(f.owner,f.vault,'set_paused',{paused:true},1n);const recovery=await f.raw(f.owner,f.vault,'recover',{recovery_id:'recovery-1',recipient:f.recipient.accountId,amount:'500000'},1n);assert.deepEqual(recovery.receiptFailures,[]);assert.equal((await f.view(f.vault,'get_payment',{payment_id:'recovery-1'})).status,'recovered');
   await f.call(f.owner,f.vault,'propose_owner',{owner:f.nominee.accountId},1n);await assert.rejects(f.call(f.outsider,f.vault,'accept_ownership',{},1n));await f.call(f.nominee,f.vault,'accept_ownership',{},1n);assert.equal((await f.config()).owner,f.nominee.accountId);await assert.rejects(f.call(f.owner,f.vault,'set_paused',{paused:false},1n));return {recoveryGasBurnt:recovery.gas_burnt};
  });
  await scenario(t,'maximum recipient and request capacity retain bounded execution gas',async()=>{
   const c=await fixtureSetup();try{
    for(let offset=0;offset<498;offset+=8){const batch=c.owner.batch(c.vault);for(let i=offset;i<Math.min(498,offset+8);i++)batch.functionCall('set_recipient',{recipient:`capacity-${i}.${c.root.accountId}`,allowed:true},{gas:30000000000000n,attachedDeposit:1n});const result=await batch.transact();assert.deepEqual(result.receiptFailures,[]);}
    await assert.rejects(c.call(c.owner,c.vault,'set_recipient',{recipient:`overflow.${c.root.accountId}`,allowed:true},1n));
    const expiry=String(await now(c.worker)+86400n);
    for(let offset=0;offset<1000;offset+=4){const batch=c.executor.batch(c.vault);for(let i=offset;i<Math.min(1000,offset+4);i++)batch.functionCall('queue_payment',{payment_id:`capacity-${i}`,recipient:c.recipient.accountId,amount:'1000000',expires_at_sec:expiry},{gas:60000000000000n,attachedDeposit:0n});const result=await batch.transact();assert.deepEqual(result.receiptFailures,[]);}
    await assert.rejects(c.queue('capacity-overflow'));await c.approve('capacity-999');const execution=await c.raw(c.executor,c.vault,'execute_payment',{payment_id:'capacity-999'});assert.deepEqual(execution.receiptFailures,[]);assert.equal((await c.view(c.vault,'get_payment',{payment_id:'capacity-999'})).status,'paid');assert.ok(BigInt(execution.gas_burnt)<GAS);const storage=await c.vault.accountView();return {recipients:500,requests:1000,executionGasBurnt:execution.gas_burnt,vaultStorageBytes:storage.storage_usage};
   }finally{await c.worker.tearDown();}
  });
 }catch(error){report.setupOrExecutionError=error.message;throw error;}finally{if(f)await f.worker.tearDown();report.finishedAt=new Date().toISOString();report.passed=!report.setupOrExecutionError&&report.scenarios.length===6&&report.scenarios.every(item=>item.passed);record();}
});
