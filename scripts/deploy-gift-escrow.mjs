import {deployNativeContract} from './deploy-native-contract.mjs';
const index=process.argv.indexOf('--request-id');
try{console.log(JSON.stringify(await deployNativeContract('gifts',{broadcast:process.argv.includes('--broadcast'),requestId:index<0?'initial':process.argv[index+1]}),null,2));}catch(error){console.error(error instanceof Error?error.message:'Native deployment failed');process.exitCode=1;}
