import {requireOperatorSession,requireSameOrigin} from '@/services/server/operator-session';
import {createNativeTransfer} from '@/services/server/near-treasury-service';
export const runtime='nodejs';
export async function POST(request:Request){
 let principal;try{principal=requireOperatorSession(request);requireSameOrigin(request);}catch{return Response.json({error:'Workspace authorization is required'},{status:401});}
 try{
  const body=await request.json(),id=request.headers.get('Idempotency-Key');
  if(!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || typeof body.recipient!=='string' || typeof body.amount!=='string')throw new Error('A UUID v4 idempotency key, NEAR recipient and exact decimal USDC amount are required');
  const payment=await createNativeTransfer(id,body.recipient,body.amount,principal.id);
  return Response.json(payment,{status:payment.execution.status==='confirmed'?200:202});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Native payment is unresolved; refresh its original saved identity before retrying'},{status:409});}
}
