import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const suites={
 gifts:['near-gift-settlement','gift-records','near-contracts'],
 treasury:['near-executor-journal','vault-payment-journal','near-vault-settlement','near-vault-admin','near-ownership','agent-planner','finance-worker'],
 business:['business-records','workspace-records','payroll-contracts','reimbursements','payment-schedules','near-invoice-total'],
 workspace:['seeded-workspace','team-members','workspace-records','near-wallet-proof'],
 links:['payment-links','near-link-settlement','group-collections'],
};
export async function runNativeVerification(group='treasury'){
 if(!suites[group])throw new Error('Choose a native verification suite');
 const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...suites[group].map(name=>`tests/${name}.test.mjs`)],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)throw new Error(`Native ${group} tests failed`);
 let contractTests=false,networkChecked=false,deployedContractsChecked=false;
 if(process.argv.includes('--contracts')){
  const command=process.platform==='win32'?'powershell.exe':'cargo';
  const args=process.platform==='win32'?['-NoProfile','-File',resolve('scripts/near-contracts.ps1'),'-Action','test']:['+1.93.0','test','--workspace','--locked','--manifest-path',resolve('contracts/near/Cargo.toml')];
  const contracts=spawnSync(command,args,{stdio:'inherit'});if(contracts.error)throw contracts.error;if(contracts.status!==0)throw new Error('Native Rust contract tests failed');contractTests=true;
 }
 if(process.argv.includes('--network') || process.argv.includes('--deployed')){
  const {createNearReader}=await import('../services/near/rpc.ts');const reader=createNearReader();await reader.verifyNetwork();
  const metadata=await reader.view(reader.network.usdcContractId,'ft_metadata',{});if(metadata.symbol!=='USDC' || metadata.decimals!==6)throw new Error('Native USDC identity mismatch');await reader.getBlockNumber();networkChecked=true;
 }
 if(process.argv.includes('--deployed')){
  const {readNearDeployment}=await import('../services/server/near-contract-config.ts');const {verifiedVault,verifiedGiftEscrow}=await import('../services/near/contract-state.ts');const config=readNearDeployment();await verifiedVault(config.treasury);await verifiedGiftEscrow(config.gifts);deployedContractsChecked=true;
 }
 console.log(JSON.stringify({suite:group,localTestsPassed:true,contractTests,networkChecked,deployedContractsChecked,liveTransactionsSubmitted:false}));
}
