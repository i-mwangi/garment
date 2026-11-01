import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {deployNativeContract} from './deploy-native-contract.mjs';
try {
 const prepared=await deployNativeContract('treasury');
 const path='.data/near-vault-deployment-plan.json',encoded=JSON.stringify(prepared.plan,null,2)+'\n';
 mkdirSync('.data',{recursive:true});
 if(existsSync(path)){if(readFileSync(path,'utf8')!==encoded)throw new Error('Saved native deployment plan differs; review the existing plan before replacing it');}
 else writeFileSync(path,encoded,{flag:'wx'});
 console.log(JSON.stringify({prepared:true,path,plan:prepared.plan,broadcast:false},null,2));
}catch(error){console.error(error instanceof Error?error.message:'Native deployment planning failed');process.exitCode=1;}
