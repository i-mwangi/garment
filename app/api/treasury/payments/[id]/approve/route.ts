import {confirmNativeTreasuryApproval} from "@/services/server/near-treasury-service";
import {requireOperatorSession,requireSameOrigin} from '@/services/server/operator-session';
import {readNearTreasuryIdentity} from '@/services/server/near-treasury-config';
import {prepareVaultApproval} from '@/services/server/vault-payments';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
 let principal;try{principal=requireOperatorSession(request,'profile');requireSameOrigin(request);if(!['OWNER','ADMIN','REVIEWER'].includes(principal.role))throw new Error();}catch{return Response.json({error:'Human approver authorization is required'},{status:403});}
 try{const {id}=await context.params,workspace=readNearTreasuryIdentity(),signer=principal.member?principal.member.walletAddress:workspace.accountId;if(!signer)throw new Error('Sign in with the allowed NEAR approver wallet');const raw=await request.text(),body=raw?JSON.parse(raw):{};if(Object.keys(body).some(key=>key!=="transactionHash"))throw new Error("Approval terms cannot be changed");const result=body.transactionHash?await confirmNativeTreasuryApproval(workspace.companyId,id,signer,body.transactionHash,principal.id):await prepareVaultApproval(workspace.companyId,id,signer);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Native approval review could not be prepared'},{status:409});}
}
