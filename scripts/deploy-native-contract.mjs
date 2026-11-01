import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {Account,JsonRpcProvider,KeyPair,KeyPairSigner,SignedTransaction,actions} from 'near-api-js';
import {readNearDeployment} from '../services/server/near-contract-config.ts';
import {NearSubmissionJournal} from '../services/server/near-submission-journal.ts';
import {encodeBase58} from '../services/near/base58.ts';
import {createNearReader,assertFinalSuccess} from '../services/near/rpc.ts';
import {verifiedVault,verifiedGiftEscrow,validateNativeVaultPolicy} from '../services/near/contract-state.ts';
import {MINIMUM_CONTRACT_PROTOCOL} from '../services/near/contract-snapshot.ts';

export async function deployNativeContract(kind,{broadcast=false,requestId='initial'}={}) {
 if(!['treasury','gifts'].includes(kind) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId))throw new Error('Choose a native contract and a valid deployment request ID');
 const deployment=readNearDeployment(),binding=deployment[kind];
 if(binding.networkId!=='testnet')throw new Error('This deployment command is restricted to NEAR testnet');
 const file=kind==='treasury'?'settlbox_near_treasury_vault.wasm':'settlbox_near_gift_escrow.wasm';
 const code=readFileSync(resolve('contracts/near/target/wasm32-unknown-unknown/release',file));
 if(encodeBase58(createHash('sha256').update(code).digest())!==binding.codeHash)throw new Error('Built WASM differs from the approved deployment binding');
 const args=kind==='treasury'?{owner:binding.ownerId,executor:binding.executorId,token_id:binding.tokenId,policy:validateNativeVaultPolicy(JSON.parse(readFileSync(resolve(process.env.SETTLBOX_NEAR_VAULT_POLICY || '.data/near-vault-policy.json'),'utf8')))}:{token_id:binding.tokenId};
 const plan={networkId:binding.networkId,accountId:binding.accountId,codeHash:binding.codeHash,bytes:code.length,method:'new',args,gas:'200000000000000',requestId};
 if(!broadcast)return {broadcast:false,plan};
 const reader=createNearReader();await reader.verifyNetwork();
 const status=await reader.rpc('status',[]);if(!Number.isSafeInteger(status.protocol_version) || status.protocol_version<MINIMUM_CONTRACT_PROTOCOL)throw new Error('NEAR protocol cannot execute the approved contract build');
 const metadata=await reader.view(binding.tokenId,'ft_metadata',{});if(metadata.symbol!=='USDC' || metadata.decimals!==6)throw new Error('Deployment token must be the configured six-decimal USDC');
 const observed=await reader.rpc('query',{request_type:'view_account',account_id:binding.accountId,finality:'final'});
 const verify=()=>kind==='treasury'?verifiedVault(binding):verifiedGiftEscrow(binding);
 if(observed.code_hash===binding.codeHash){await verify();return {verified:true,alreadyDeployed:true,plan};}
 if(observed.code_hash!=='1'.repeat(32))throw new Error('Deployment target already has different code; no overwrite was attempted');
 const keyFile=process.env[kind==='treasury'?'SETTLBOX_NEAR_VAULT_DEPLOYER_KEY_FILE':'SETTLBOX_NEAR_GIFT_DEPLOYER_KEY_FILE'];
 if(!keyFile)throw new Error('Configure the contract account deployment key file separately from the restricted server executor');
 let credential,key;
 try{credential=JSON.parse(readFileSync(resolve(keyFile),'utf8'));key=KeyPair.fromString(credential.private_key);}catch{throw new Error('The local deployment credential could not be read');}
 if(credential.account_id!==binding.accountId)throw new Error('Deployment key must belong to the contract account itself');
 const publicKey=key.getPublicKey().toString();
 const access=await reader.rpc('query',{request_type:'view_access_key',account_id:binding.accountId,public_key:publicKey,finality:'final'});
 if(access.permission!=='FullAccess')throw new Error('Contract deployment requires the contract account deployment authority');
 const path=resolve(process.env.SETTLBOX_NEAR_DEPLOYMENT_DATABASE || '.data/near-deployment.sqlite');mkdirSync(dirname(path),{recursive:true});
 const journal=new NearSubmissionJournal(path);
 try {
  const fingerprint=JSON.stringify(plan),id=createHash('sha256').update(fingerprint).digest('hex');
  let job=journal.begin({id,scope:binding.networkId,executor:binding.accountId,fingerprint});
  const provider=new JsonRpcProvider({url:reader.network.rpcUrl});
  if(job.state==='preparing') {
   const tx=await new Account(binding.accountId,provider).createTransaction({receiverId:binding.accountId,publicKey,actions:[actions.deployContract(code),actions.functionCall('new',args,200000000000000n,0n)]});
   const signed=await new KeyPairSigner(key).signTransaction(tx);
   job=journal.signed(job,encodeBase58(signed.txHash),Buffer.from(signed.signedTransaction.encode()).toString('base64'));
  }
  const signed=SignedTransaction.decode(Buffer.from(job.signedBytes,'base64')),tx=signed.transaction;
  const deploy=tx.actions[0]?.deployContract,initialize=tx.actions[1]?.functionCall;
  if(encodeBase58(createHash('sha256').update(tx.encode()).digest())!==job.hash || tx.signerId!==binding.accountId || tx.receiverId!==binding.accountId || tx.actions.length!==2 || !deploy || encodeBase58(createHash('sha256').update(deploy.code).digest())!==binding.codeHash || initialize?.methodName!=='new' || initialize.deposit!==0n || initialize.gas!==200000000000000n || JSON.stringify(JSON.parse(new TextDecoder().decode(initialize.args)))!==JSON.stringify(args))throw new Error('Saved native deployment transaction differs from the reviewed plan');
  if(job.state!=='resolved'){try{await provider.sendTransaction(signed);}catch{/* Preserve original hash and signed bytes on transport uncertainty. */}}
  const outcome=await reader.getReceipt(job.hash,binding.accountId);
  if(outcome.final_execution_status==='FINAL' && ('Failure' in outcome.status || outcome.receipts_outcome.some(receipt=>'Failure' in receipt.outcome.status))){journal.resolve(id,job.hash);throw new Error(`Native deployment failed: ${job.hash}. Review funding and the original result before explicitly choosing a new request ID.`);}
  assertFinalSuccess(outcome);await verify();journal.resolve(id,job.hash);
  return {verified:true,transactionHash:job.hash,plan};
 }finally{journal.close();}
}
