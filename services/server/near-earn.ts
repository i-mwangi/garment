import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getNearNetwork } from "../near/network.ts";
import { createNearReader } from "../near/rpc.ts";
import { contractSnapshot, unsigned, record } from "../near/contract-snapshot.ts";
import { assertNearAccountId, isNearTransactionHash } from "../near/account-id.ts";
import { decodeRheaPosition, rheaCall } from "../near/rhea.ts";
import { formatAmount, parseAmount } from "../near/amount.ts";
import { readNearTreasuryIdentity } from "./near-treasury-config.ts";

export async function openNativeEarn() {
 const network=getNearNetwork(),workspace=readNearTreasuryIdentity();
 const path=resolve(process.env.SETTLBOX_NEAR_EARN_CONFIG || ".data/near-earn.json");
 const approved=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):null;
 const providerId=approved?.accountId || (network.networkId==="mainnet"?"contract.main.burrow.near":"burrow.services.ref-labs.testnet");
 assertNearAccountId(providerId);
 if(approved && (approved.networkId!==network.networkId || !isNearTransactionHash(approved.codeHash)))throw new Error("Native Earn provider network or code approval is invalid");
 const rpc=createNearReader();await rpc.verifyNetwork();
 const account=await rpc.rpc<{code_hash:string}>("query",{request_type:"view_account",account_id:providerId,finality:"final"});
 const codeHash=approved?.codeHash || account.code_hash;
 const snapshot=await contractSnapshot({networkId:network.networkId,expectedRpcChainId:network.networkId,accountId:providerId,codeHash,tokenId:network.usdcContractId});
 const [asset,position,poolBalance,walletBalance,storage,tokenStorage]=await Promise.all([
  snapshot.read("get_asset",{token_id:network.usdcContractId}),snapshot.read("get_account",{account_id:workspace.accountId}),
  snapshot.view<string>(network.usdcContractId,"ft_balance_of",{account_id:providerId}),snapshot.view<string>(network.usdcContractId,"ft_balance_of",{account_id:workspace.accountId}),snapshot.read("storage_balance_of",{account_id:workspace.accountId}),snapshot.view(network.usdcContractId,"storage_balance_of",{account_id:workspace.accountId}),
 ]);
 if(position!==null && record(position,"Rhea account").account_id!==workspace.accountId)throw new Error("Rhea returned a different reserve account");
 if(asset!==null && record(asset,"Rhea asset").token_id!==undefined && record(asset,"Rhea asset").token_id!==network.usdcContractId)throw new Error("Rhea returned a different USDC asset");
 const decoded=decodeRheaPosition(asset,position,network.usdcContractId,poolBalance);
 const data={...decoded,provider:"Rhea Finance",providerId,codeHash,codeApproved:!!approved,networkId:network.networkId,wallet:workspace.accountId,tokenId:network.usdcContractId,walletBaseUnits:unsigned(walletBalance,"reserve wallet USDC"),poolSuppliedUsdc:formatAmount(BigInt(decoded.poolSuppliedBaseUnits)),suppliedUsdc:formatAmount(BigInt(decoded.suppliedBaseUnits)),withdrawableUsdc:formatAmount(BigInt(decoded.withdrawableBaseUnits)),walletUsdc:formatAmount(BigInt(walletBalance)),registered:storage!==null,tokenRegistered:tokenStorage!==null,blockNumber:String(snapshot.blockHeight),observedAt:new Date(Number(BigInt(snapshot.timestampNs)/1000000n)).toISOString()};
 async function prepare(action:"supply"|"withdraw",amount:string,reference:string) {
  if(!approved)throw new Error("Approve the observed native Earn contract code hash before enabling reserve transactions");
  if(!decoded.supported)throw new Error("Rhea does not list this network's configured native USDC token");
  if(action!=="supply" && action!=="withdraw")throw new Error("Choose supply or withdrawal");
  const units=parseAmount(amount);if(units<=0n)throw new Error("Enter a positive six-decimal USDC amount");
  if(action==="supply" && (!decoded.canSupply || units>BigInt(walletBalance)))throw new Error("Supply is disabled or the reserve wallet has insufficient USDC");
  if(action==="withdraw" && (!decoded.canWithdraw || units>BigInt(decoded.withdrawableBaseUnits)))throw new Error("Withdrawal exceeds the supplied USDC or current pool liquidity");
  let call;
  if(!storage){const bounds=await snapshot.read<{min:string}>("storage_balance_bounds");call={contractId:providerId,methodName:"storage_deposit",args:{account_id:workspace.accountId},deposit:unsigned(bounds.min,"Rhea storage minimum"),gas:"50000000000000"};}
  else if(action==="withdraw" && !tokenStorage){const bounds=await snapshot.view<{min:string}>(network.usdcContractId,"storage_balance_bounds",{});call={contractId:network.usdcContractId,methodName:"storage_deposit",args:{account_id:workspace.accountId,registration_only:true},deposit:unsigned(bounds.min,"USDC storage minimum"),gas:"50000000000000"};}
  else call=rheaCall(providerId,network.usdcContractId,action,amount,decoded.extraDecimals,reference);
  return {call,...data,action,amount};
 }
 return {data,prepare};
}
