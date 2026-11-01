import {requireOperatorSession,requireSameOrigin} from '@/services/server/operator-session';
import {readNearTreasuryIdentity} from '@/services/server/near-treasury-config';
import {openNativeEarn} from '@/services/server/near-earn';
import {openAgentProposals} from '@/services/server/agent-proposals';
import {isNearTransactionHash} from '@/services/near/account-id';
import {parseAmount} from '@/services/near/amount';
import {createNearReader} from '@/services/near/rpc';
import {verifyVaultAdministration} from '@/services/near/vault-admin';
import {verifyRheaAction} from '@/services/near/rhea';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 let principal;try{principal=requireOperatorSession(request);}catch{return Response.json({error:'Sign in to the workspace'},{status:401,headers});}
 const store=openAgentProposals();try{
  const workspace=readNearTreasuryIdentity(),data=(await openNativeEarn()).data;
  const activity=store.list(workspace.companyId,principal.id).filter(row=>row.operation.tool==='earn.reserve' && row.status==='completed' && !(row.result as {registrationOnly?:boolean})?.registrationOnly).map(row=>({id:row.id,type:row.operation.arguments.action==='supply'?'deposit':'withdraw',amount:Number(row.operation.arguments.amount),date:(row.result as {observedAt?:string})?.observedAt || row.createdAt,wallet:data.wallet,status:'Confirmed on NEAR'}));
  return Response.json({...data,activity},{headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Native Earn provider data is unavailable'},{status:503,headers});}finally{store.close();}
}
export async function POST(request:Request){
 let principal;try{principal=requireOperatorSession(request);requireSameOrigin(request);if(principal.role!=='OWNER')throw new Error();}catch{return Response.json({error:'Reserve owner authorization is required'},{status:403,headers});}
 const store=openAgentProposals();
 try{
  const workspace=readNearTreasuryIdentity(),signer=principal.member?principal.member.walletAddress:workspace.accountId;
  if(signer!==workspace.accountId)throw new Error('Sign in with the company collection/reserve account; payment-vault funds cannot be invested');
  const body=await request.json();
  if(body.action==='verify') {
   if(typeof body.id!=='string' || !isNearTransactionHash(body.transactionHash))throw new Error('A saved Earn review and native transaction hash are required');
   const proposal=store.get(workspace.companyId,principal.id,body.id);
   if(!proposal || proposal.operation.tool!=='earn.reserve')throw new Error('Earn review not found');
   if(proposal.status==='completed')return Response.json(proposal.result,{headers});
   if(proposal.status!=='awaiting_signature')throw new Error('No native Earn signature is pending');
   const saved=proposal.result as Awaited<ReturnType<Awaited<ReturnType<typeof openNativeEarn>>['prepare']>>;
   const current=await openNativeEarn();
   if(!current.data.codeApproved || saved.wallet!==signer || saved.providerId!==current.data.providerId || saved.codeHash!==current.data.codeHash || saved.networkId!==current.data.networkId || saved.tokenId!==current.data.tokenId)throw new Error('Native Earn identity changed since review');
   const reader=createNearReader(),outcome=await reader.getReceipt(body.transactionHash,signer);
   const receipt=outcome.receipts_outcome.find(item=>item.outcome.executor_id===saved.call.contractId);
   if(!isNearTransactionHash(receipt?.block_hash))throw new Error('Earn execution block is unavailable');
   const block=await reader.rpc<{header:{timestamp_nanosec:string}}>('block',{block_id:receipt.block_hash});
   verifyVaultAdministration(saved.call,outcome,{hash:body.transactionHash,ownerId:signer,blockTimestampNs:block.header.timestamp_nanosec,reviewCreatedAt:proposal.createdAt});
   const registrationOnly=saved.call.methodName==='storage_deposit';
   if(registrationOnly){if(!(saved.call.contractId===saved.providerId?current.data.registered:current.data.tokenRegistered))throw new Error('Native provider storage registration is not confirmed');}
   else verifyRheaAction(outcome,saved.call,{hash:body.transactionHash,signerId:signer,providerId:saved.providerId,tokenId:saved.tokenId,amount:saved.amount,extraDecimals:saved.extraDecimals,action:saved.action});
   const result={...current.data,registrationOnly,transactionHash:body.transactionHash};
   store.finish(workspace.companyId,principal.id,proposal.id,'completed',result);return Response.json(result,{headers});
  }
  if(!['supply','withdraw'].includes(body.action) || typeof body.amount!=='string' || parseAmount(body.amount)<=0n || typeof body.requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.requestId))throw new Error('An exact six-decimal USDC amount, action and request UUID are required');
  let proposal=store.prepare(workspace.companyId,principal.id,`near-earn:${body.requestId}`,{tool:'earn.reserve',arguments:{action:body.action,amount:body.amount}});
  if(proposal.status==='pending') {
   const quote=await (await openNativeEarn()).prepare(body.action,body.amount,body.requestId);
   store.claim(workspace.companyId,principal.id,proposal.id);proposal=store.finish(workspace.companyId,principal.id,proposal.id,'awaiting_signature',quote);
  }
  if(proposal.status!=='awaiting_signature' || Date.parse(proposal.expiresAt)<=Date.now())throw new Error('This Earn review expired or was handled; verify any submitted transaction before another review');
  return Response.json({proposal,...proposal.result as object},{headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Native Earn action could not be verified'},{status:409,headers});}finally{store.close();}
}
