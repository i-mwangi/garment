import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const contracts=[
  {name:'treasury-vault',file:'settlbox_near_treasury_vault.wasm',methods:['new','get_config','get_payment','is_recipient','is_approver','daily_committed','set_policy','set_executor','set_recipient','set_approver','set_paused','propose_owner','accept_ownership','ft_on_transfer','queue_payment','approve_payment','cancel_payment','execute_payment','recover','on_transfer']},
  {name:'gift-escrow',file:'settlbox_near_gift_escrow.wasm',methods:['new','get_token_id','get_gift','ft_on_transfer','claim_gift','refund_gift','on_transfer']},
];
const artifacts=contracts.map(contract=>{
  const path=resolve(root,'contracts/near/target/wasm32-unknown-unknown/release',contract.file);
  const bytes=readFileSync(path);
  const module=new WebAssembly.Module(bytes);
  const exports=WebAssembly.Module.exports(module);
  const imports=WebAssembly.Module.imports(module);
  for(const name of contract.methods) if(!exports.some(entry=>entry.kind==='function'&&entry.name===name)) throw new Error(`${contract.name}: missing contract method ${name}`);
  if(imports.some(entry=>entry.module!=='env')) throw new Error(`${contract.name}: unexpected non-NEAR host imports`);
  for(const name of ['input','storage_write','promise_result']) if(!imports.some(entry=>entry.module==='env'&&entry.name===name)) throw new Error(`${contract.name}: missing NEAR runtime import ${name}`);
  return {name:contract.name,file:contract.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),exports,imports};
});
const report={sdkDeclaredMinimumNearProtocolVersion:84,verification:'WebAssembly format, expected exported methods and NEAR runtime imports. This does not validate NEAR execution, gas, storage or financial readiness.',artifacts};
writeFileSync(resolve(root,'docs/NEAR-CONTRACT-ARTIFACTS.json'),JSON.stringify(report,null,2)+'\n');
for(const artifact of artifacts) console.log(`${artifact.name}: valid WebAssembly, ${artifact.bytes} bytes, SHA-256 ${artifact.sha256}`);
