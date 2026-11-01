import { record, unsigned, count, assertRequestId } from "./contract-snapshot.ts";
import { assertNearAccountId } from "./account-id.ts";
import { parseAmount, formatAmount } from "./amount.ts";
import { verifyExecutorCall } from "./vault-settlement.ts";
import type { NearExecutionOutcome } from "./rpc.ts";
import type { NearContractCall } from "../../types/near-contracts.ts";

export interface RheaPosition {
 supported:boolean;poolSuppliedBaseUnits:string;extraDecimals:number;suppliedBaseUnits:string;withdrawableBaseUnits:string;
 canSupply:boolean;canWithdraw:boolean;apr:string|null;
}
export function decodeRheaPosition(assetValue:unknown,accountValue:unknown,tokenId:string,poolTokenBalance:string):RheaPosition {
 assertNearAccountId(tokenId);unsigned(poolTokenBalance,"provider USDC balance");
 if(assetValue===null && accountValue!==null) {const account=record(accountValue,"Rhea account");if(!Array.isArray(account.supplied))throw new Error("Invalid Rhea supplied positions");if(account.supplied.some((item:unknown)=>{const row=record(item,"supplied asset");return row.token_id===tokenId && unsigned(row.balance,"supplied account balance")!=="0";}))throw new Error("Rhea asset metadata is missing for an existing position");}
 if(assetValue===null)return {supported:false,poolSuppliedBaseUnits:"0",extraDecimals:0,suppliedBaseUnits:"0",withdrawableBaseUnits:"0",canSupply:false,canWithdraw:false,apr:null};
 const asset=record(assetValue,"Rhea asset"),config=record(asset.config,"Rhea asset configuration");
 const extraDecimals=count(config.extra_decimals,"provider extra decimals",24),scale=10n**BigInt(extraDecimals);
 if(typeof config.can_deposit!=="boolean" || typeof config.can_withdraw!=="boolean")throw new Error("Invalid Rhea asset capabilities");
 const supplied=record(asset.supplied,"Rhea supply pool"),borrowed=record(asset.borrowed,"Rhea borrow pool");
 const total=BigInt(unsigned(supplied.balance,"pool supplied balance"))+BigInt(unsigned(asset.reserved,"pool reserve"))+BigInt(unsigned(asset.prot_fee??"0","pool fees"));
 const debt=BigInt(unsigned(borrowed.balance,"pool borrowed balance"));
 let accountBalance=0n;
 if(accountValue!==null) {
  const account=record(accountValue,"Rhea account");
  if(!Array.isArray(account.supplied) || account.supplied.length>500)throw new Error("Invalid Rhea supplied positions");
  const matches=account.supplied.filter((item:unknown)=>record(item,"supplied asset").token_id===tokenId);
  if(matches.length>1)throw new Error("Duplicate Rhea asset position");
  if(matches.length)accountBalance=BigInt(unsigned(record(matches[0],"supplied asset").balance,"supplied account balance"))/scale;
 }
 const liquid=total>debt?(total-debt)/scale:0n;
 const available=liquid<BigInt(poolTokenBalance)?liquid:BigInt(poolTokenBalance);
 const withdrawable=accountBalance<available?accountBalance:available;
 const rawApr=String(asset.supply_apr??"");
 const apr=/^(0|[1-9]\d*)(\.\d{1,38})?$/.test(rawApr)?rawApr:null;
 return {supported:true,poolSuppliedBaseUnits:(total/scale).toString(),extraDecimals,suppliedBaseUnits:accountBalance.toString(),withdrawableBaseUnits:withdrawable.toString(),canSupply:config.can_deposit,canWithdraw:config.can_withdraw,apr};
}
export function rheaCall(providerId:string,tokenId:string,action:"supply"|"withdraw",amount:string,extraDecimals:number,reference:string):NearContractCall {
 assertNearAccountId(providerId);assertNearAccountId(tokenId);assertRequestId(reference);count(extraDecimals,"provider extra decimals",24);
 const units=parseAmount(amount);if(units<=0n || units*(10n**BigInt(extraDecimals))>(1n<<128n)-1n)throw new Error("Invalid Rhea USDC amount");
 if(action==="supply")return {contractId:tokenId,methodName:"ft_transfer_call",args:{receiver_id:providerId,amount:units.toString(),msg:"",memo:`settlbox-earn:${reference}`},deposit:"1",gas:"150000000000000"};
 if(action!=="withdraw")throw new Error("Unsupported Rhea action");
 return {contractId:providerId,methodName:"execute",args:{actions:[{Withdraw:{token_id:tokenId,max_amount:(units*(10n**BigInt(extraDecimals))).toString()}}]},deposit:"1",gas:"150000000000000"};
}
export function verifyRheaAction(outcome:NearExecutionOutcome,call:NearContractCall,input:{hash:string;signerId:string;providerId:string;tokenId:string;amount:string;extraDecimals:number;action:"supply"|"withdraw"}) {
 verifyExecutorCall(outcome,call,{hash:input.hash,executorId:input.signerId});
 const units=parseAmount(input.amount),scaled=(units*(10n**BigInt(input.extraDecimals))).toString();
 function emitted(executor:string,standard:string,name:string,check:(item:Record<string,unknown>)=>boolean){return outcome.receipts_outcome.some(receipt=>receipt.outcome.executor_id===executor && receipt.outcome.logs.some(log=>{
  if(!log.startsWith("EVENT_JSON:"))return false;
  try{const event=JSON.parse(log.slice(11));return event.standard===standard && event.event===name && Array.isArray(event.data) && event.data.some(check);}catch{return false;}
 }));}
 const incoming=input.action==="supply";
 if(!emitted(input.tokenId,"nep141","ft_transfer",item=>item.old_owner_id===(incoming?input.signerId:input.providerId) && item.new_owner_id===(incoming?input.providerId:input.signerId) && item.amount===units.toString()))throw new Error("Rhea USDC token transfer is not verified");
 if(!emitted(input.providerId,"burrow",incoming?"deposit":"withdraw_succeeded",item=>item.account_id===input.signerId && item.token_id===input.tokenId && item.amount===scaled))throw new Error("Rhea completion callback is not verified");
}
