import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {getNearNetwork} from '../services/near/network.ts';
import {createNearReader} from '../services/near/rpc.ts';
import {contractSnapshot} from '../services/near/contract-snapshot.ts';
const observations=[];
for(const networkId of ['testnet','mainnet']){
 const network={...getNearNetwork(networkId),rpcUrl:`https://rpc.${networkId}.near.org`,backupRpcUrl:undefined};
 const rpc=createNearReader(network),providerId=networkId==='mainnet'?'contract.main.burrow.near':'burrow.services.ref-labs.testnet';
 try{
  await rpc.verifyNetwork();const account=await rpc.rpc('query',{request_type:'view_account',account_id:providerId,finality:'final'});
  const snapshot=await contractSnapshot({networkId,expectedRpcChainId:networkId,accountId:providerId,codeHash:account.code_hash,tokenId:network.usdcContractId},rpc.rpc);
  const asset=await snapshot.read('get_asset',{token_id:network.usdcContractId});
  observations.push({networkId,providerId,tokenId:network.usdcContractId,codeHash:account.code_hash,blockHeight:snapshot.blockHeight,blockHash:snapshot.blockHash,observedAt:new Date(Number(BigInt(snapshot.timestampNs)/1000000n)).toISOString(),supported:asset!==null,asset,configurationApproved:false,transactionsSubmitted:false});
 }catch(error){observations.push({networkId,providerId,tokenId:network.usdcContractId,verified:false,error:error.message,detail:error.detail,configurationApproved:false,transactionsSubmitted:false});}
}
const output=resolve('docs/NEAR-EARN-PROVIDER-OBSERVATION.json');mkdirSync(resolve('docs'),{recursive:true});writeFileSync(output,JSON.stringify({observations,scope:'Public read-only RPC observation. Does not approve code, change network, connect an account or authorize any deposit.'},null,2)+'\n');
console.log(JSON.stringify(observations.map(({asset,...item})=>item),null,2));
