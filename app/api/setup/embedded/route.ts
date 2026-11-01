import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {KeyPair} from 'near-api-js';
import {requireOperatorSession,requireSameOrigin} from '@/services/server/operator-session';
import {createNearReader,NearRpcError} from '@/services/near/rpc';
import {getNearNetwork} from '@/services/near/network';

export const runtime='nodejs';
import {readNearTreasuryIdentity} from '@/services/server/near-treasury-config';
import {implicitAccountId} from '@/services/near/account-id';
const entries=[['treasury','5','5000000000000000000000000'],['gifts','3','3000000000000000000000000'],['executor','0.25','250000000000000000000000']] as const;
function authorize(request:Request){
 const url=new URL(request.url);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||getNearNetwork().networkId!=='testnet')throw new Error('Setup is restricted to local testnet');
 if(requireOperatorSession(request).role!=='OWNER')throw new Error('Workspace owner sign-in required');
}
export async function POST(request:Request){
 try{
  authorize(request);requireSameOrigin(request);
  const reader=createNearReader();await reader.verifyNetwork();
  const parent=readNearTreasuryIdentity().accountId;
  const directory=resolve(dirname(process.env.SETTLBOX_NEAR_TREASURY_CONFIG || '.data/near-treasury.json'),'embedded-deployment');mkdirSync(directory,{recursive:true});
  const accounts=[];
  for(const [kind,near,deposit] of entries){
   const file=resolve(directory,`${kind}.json`);
   try{const key=KeyPair.fromRandom('ed25519');writeFileSync(file,JSON.stringify({account_id:implicitAccountId(key.getPublicKey().data),public_key:key.getPublicKey().toString(),private_key:key.toString()}),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
   const saved=JSON.parse(readFileSync(file,'utf8'));
   const accountId=implicitAccountId(KeyPair.fromString(saved.private_key).getPublicKey().data);
   if(saved.account_id!==accountId||KeyPair.fromString(saved.private_key).getPublicKey().toString()!==saved.public_key)throw new Error('Local deployment key identity mismatch');
   let exists=false;
   try{
    await reader.rpc('query',{request_type:'view_account',account_id:accountId,finality:'final'});exists=true;
   }catch(error){
    if(!(error instanceof NearRpcError)||!/(UNKNOWN_ACCOUNT|does not exist)/i.test(JSON.stringify(error.detail)))throw error;
   }
   if(exists){
    const key=await reader.rpc<{permission:unknown}>('query',{request_type:'view_access_key',account_id:accountId,public_key:saved.public_key,finality:'final'});
    if(key.permission!=='FullAccess')throw new Error('Existing setup account has different authority');
   }
   accounts.push({kind,accountId,near,deposit,publicKey:saved.public_key,exists});
  }
  return Response.json({networkId:'testnet',parent,accounts},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'Setup unavailable';return Response.json({error:message},{status:/(Authentication required|Workspace owner sign-in required)/.test(message)?401:409});}
}
