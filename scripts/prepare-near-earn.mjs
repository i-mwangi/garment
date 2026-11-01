import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {openNativeEarn} from '../services/server/near-earn.ts';
const args=process.argv.slice(2);
if(args.some(arg=>!arg.startsWith('--approve-code=')))throw new Error('Usage: node --env-file-if-exists=.env.local --experimental-strip-types scripts/prepare-near-earn.mjs [--approve-code=OBSERVED_BASE58_HASH]');
const {data}=await openNativeEarn();
const approval=args.find(arg=>arg.startsWith('--approve-code='))?.slice(15);
if(approval){
 if(approval!==data.codeHash)throw new Error('Approval must match the observed provider code hash');
 if(!data.supported)throw new Error('The provider does not list the configured native USDC token on this network');
 const path=resolve(process.env.SETTLBOX_NEAR_EARN_CONFIG||'.data/near-earn.json');
 const binding={networkId:data.networkId,accountId:data.providerId,codeHash:data.codeHash};
 if(existsSync(path)){
  const previous=JSON.parse(readFileSync(path,'utf8'));
  if(previous.networkId!==binding.networkId||previous.accountId!==binding.accountId||previous.codeHash!==binding.codeHash)throw new Error('Existing Earn binding differs; review and archive it before approving another provider');
 }else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(binding,null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify({approved:binding,path,transactionsSubmitted:false},null,2));
}else console.log(JSON.stringify({observation:data,transactionsSubmitted:false,nextStep:data.supported?'Review the provider source and observed code hash, then pass --approve-code=HASH to save the local binding.':'This provider does not support the configured native USDC token; do not enable supply or substitute another asset.'},null,2));
