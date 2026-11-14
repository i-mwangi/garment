import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { readNearDeployment } from "@/services/server/near-contract-config";
import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { verifiedVault } from "@/services/near/contract-state";
import { vaultAdministrationCall, verifyVaultAdministration } from "@/services/near/vault-admin";
import { nativeOwnershipCall } from "@/services/near/ownership";
import { commitNativeVaultOwner } from "@/services/server/near-ownership-config";
import { createNearReader } from "@/services/near/rpc";
import { isNearTransactionHash, assertNearAccountId } from "@/services/near/account-id";
import { openTeamMembers } from "@/services/server/team-members";
import { openAgentProposals } from "@/services/server/agent-proposals";
import type { NearContractCall, NearVaultBinding } from "@/types/near-contracts";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request) {
 try{requireOperatorSession(request);}catch{return Response.json({error:"Workspace authorization is required"},{status:401,headers});}
 try {
  const deployment=readNearDeployment(),vault=await verifiedVault(deployment.treasury);
  return Response.json({configured:true,networkId:deployment.treasury.networkId,accountId:deployment.treasury.accountId,ownerId:vault.config.owner,pendingOwnerId:vault.config.pending_owner,executionWallet:vault.config.executor,paused:vault.config.paused,inFlight:vault.config.in_flight},{headers});
 }catch{return Response.json({error:"Native approval vault is not configured or could not be verified"},{status:503,headers});}
}
export async function POST(request:Request) {
 let principal;
 try{principal=requireOperatorSession(request);requireSameOrigin(request);if(!["OWNER","ADMIN"].includes(principal.role))throw new Error();}
 catch{return Response.json({error:"Workspace administrator authorization is required"},{status:403,headers});}
 const store=openAgentProposals();
 try {
  const body=await request.json(),deployment=readNearDeployment(),binding=deployment.treasury,company=deployment.companyId;
  const signer=principal.member?principal.member.walletAddress:readNearTreasuryIdentity().accountId;
  assertNearAccountId(signer);
  if(body.action==="verify_ownership") {
   if(typeof body.proposalId!=="string" || !isNearTransactionHash(body.transactionHash))throw new Error("Saved native ownership review and transaction are required");
   const proposal=store.get(company,principal.id,body.proposalId);
   if(!proposal || proposal.operation.tool!=="vault.ownership")throw new Error("Ownership review not found");
   if(proposal.status==="completed")return Response.json(proposal,{headers});
   if(proposal.status!=="awaiting_signature")throw new Error("Ownership review has no pending signature");
   const saved=proposal.result as {call:NearContractCall;binding:NearVaultBinding;signer:string;target:string};
   if(saved.signer!==signer || saved.binding.accountId!==binding.accountId || saved.binding.codeHash!==binding.codeHash || saved.binding.networkId!==binding.networkId || saved.binding.executorId!==binding.executorId || ![saved.binding.ownerId,saved.target].includes(binding.ownerId))throw new Error("Native ownership review identity changed");
   const reader=createNearReader(),outcome=await reader.getReceipt(body.transactionHash,signer);
   const receipt=outcome.receipts_outcome.find(item=>item.outcome.executor_id===binding.accountId);
   if(!isNearTransactionHash(receipt?.block_hash))throw new Error("Ownership execution block is unavailable");
   const block=await reader.rpc<{header:{timestamp_nanosec:string}}>("block",{block_id:receipt.block_hash});
   verifyVaultAdministration(saved.call,outcome,{hash:body.transactionHash,ownerId:signer,blockTimestampNs:block.header.timestamp_nanosec,reviewCreatedAt:proposal.createdAt});
   const accepted=saved.call.methodName==="accept_ownership";
   const observed=await verifiedVault({...saved.binding,ownerId:accepted?saved.target:saved.binding.ownerId});
   if(accepted) {
    if(observed.config.pending_owner!==null)throw new Error("Native ownership acceptance is not final");
    commitNativeVaultOwner(company,saved.binding,saved.target);
   } else if(observed.config.pending_owner!==saved.target)throw new Error("Native owner nomination is not current");
   return Response.json(store.finish(company,principal.id,proposal.id,"completed",{...saved,transactionHash:body.transactionHash}),{headers});
  }
  if(typeof body.requestId!=="string" || !/^[0-9a-f-]{36}$/i.test(body.requestId))throw new Error("A native review request UUID is required");
  const vault=await verifiedVault(binding);
  if(body.action==="propose_owner" || body.action==="accept_ownership") {
   assertNearAccountId(body.address);
   if(body.address===deployment.gifts.accountId)throw new Error("A gift contract cannot administer the treasury vault");
   const members=openTeamMembers();try{if(!members.list(company).some(member=>member.status==="ACTIVE" && ["OWNER","ADMIN"].includes(member.role) && member.walletAddress===body.address))throw new Error("Add the new administrator as an active workspace admin before nominating their NEAR account");}finally{members.close();}
   const call=nativeOwnershipCall(binding,vault.config,signer,body.action,body.address);
   let proposal=store.prepare(company,principal.id,`near-ownership:${body.requestId}`,{tool:"vault.ownership",arguments:{action:body.action,address:body.address}});
   if(proposal.status==="pending"){store.claim(company,principal.id,proposal.id);proposal=store.finish(company,principal.id,proposal.id,"awaiting_signature",{call,binding,signer,target:body.address});}
   if(proposal.status!=="awaiting_signature" || Date.parse(proposal.expiresAt)<=Date.now())throw new Error("Ownership review expired or was already handled; check its submitted transaction");
   return Response.json({proposal,...proposal.result as object},{headers});
  }
  if(signer!==binding.ownerId)throw new Error("Sign in with the current native vault owner before changing permissions");
  vaultAdministrationCall(binding,body.action,body.address);
  const proposal=store.prepare(company,principal.id,`near-human:${body.requestId}`,{tool:"vault.authorize",arguments:{action:body.action,...(body.action!=="configure_executor"&&body.address?{address:body.address}:{})}});
  return Response.json({proposal},{headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Native wallet action could not be prepared"},{status:409,headers});}
 finally{store.close();}
}
