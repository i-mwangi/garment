import { assertNearAccountId } from '../services/near/account-id.ts';
import { createNearReader, NearRpcError } from '../services/near/rpc.ts';
const accountId=process.argv[2];
assertNearAccountId(accountId);
const reader=createNearReader();
await reader.verifyNetwork();
const report={accountId,network:reader.network.networkId,tokenId:reader.network.usdcContractId,usdcBaseUnits:(await reader.getUsdcBalance(accountId)).toString()};
try { report.nearBaseUnits=(await reader.getNativeBalance(accountId)).toString();report.accountState='activated'; }
catch(error) {
  const detail=error instanceof NearRpcError?JSON.stringify(error.detail):'';
  if(error instanceof NearRpcError && (detail.includes('UNKNOWN_ACCOUNT') || detail.includes(`account ${accountId} does not exist while viewing`))) report.accountState='not_activated';
  else throw error;
}
console.log(JSON.stringify(report,null,2));
