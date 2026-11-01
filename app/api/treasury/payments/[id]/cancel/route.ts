import {requireOperatorSession,requireSameOrigin} from '@/services/server/operator-session';
import {readNearTreasuryIdentity} from '@/services/server/near-treasury-config';
import {nativeCancellation} from '@/services/server/near-treasury-service';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 let principal;try{principal=requireOperatorSession(request);requireSameOrigin(request);}catch{return Response.json({error:'Workspace authorization is required'},{status:401});}
 try{const {id}=await context.params,identity=readNearTreasuryIdentity(),signer=principal.member?principal.member.walletAddress:identity.accountId;if(!signer)throw new Error('Sign in with the native vault owner');const raw=await request.text(),body=raw?JSON.parse(raw):{};if(Object.keys(body).some(key=>key!=='transactionHash'))throw new Error('Cancellation terms cannot be changed');return Response.json(await nativeCancellation(identity.companyId,id,signer,body.transactionHash),{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Cancellation could not be verified'},{status:409});}
}
