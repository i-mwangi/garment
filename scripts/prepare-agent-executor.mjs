import { KeyPair } from 'near-api-js';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {readNearDeployment} from '../services/server/near-contract-config.ts';
import {createNearReader} from '../services/near/rpc.ts';
import {verifyExecutorPermission} from '../services/near/executor-permission.ts';
const {companyId,treasury}=readNearDeployment();
const path=resolve(process.env.SETTLBOX_NEAR_EXECUTOR_KEY_FILE || '.data/near-executor-key.json');
let credential;
if(existsSync(path))credential=JSON.parse(readFileSync(path,'utf8'));
else {
 const key=KeyPair.fromRandom('ed25519');
 credential={account_id:treasury.executorId,public_key:key.getPublicKey().toString(),private_key:key.toString()};
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(credential,null,2)+'\n',{flag:'wx',mode:0o600});
}
let key;try{key=KeyPair.fromString(credential.private_key);}catch{throw new Error("The local executor credential is invalid");}
const publicKey=key.getPublicKey().toString();
if(credential.account_id!==treasury.executorId || credential.public_key!==publicKey)throw new Error('Executor credential belongs to another account or public key');
const permission={receiver_id:treasury.accountId,method_names:['queue_payment','execute_payment'],allowance:'100000000000000000000000'};
let registered=false;
const reader=createNearReader();await reader.verifyNetwork();
try {
 const access=await reader.rpc('query',{request_type:'view_access_key',account_id:treasury.executorId,public_key:publicKey,finality:'final'});
 verifyExecutorPermission(access,treasury.accountId,'queue_payment');verifyExecutorPermission(access,treasury.accountId,'execute_payment');registered=true;
}catch(error){
 if(error?.message!=='NEAR RPC request failed')throw error;
 if(!JSON.stringify(error.detail).includes('UNKNOWN_ACCESS_KEY') && !JSON.stringify(error.detail).includes('does not exist'))throw error;
}
console.log(JSON.stringify({companyId,networkId:treasury.networkId,executorId:treasury.executorId,publicKey,permission,registered,keyFile:path,fundsMoved:false,nextStep:registered?'Set SETTLBOX_NEAR_EXECUTOR_KEY_FILE to this local file.':'The executor account owner must register this public key with exactly the restricted function-call permission shown here. Do not grant FullAccess.'},null,2));
