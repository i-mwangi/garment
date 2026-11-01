import {requireOperatorSession} from '@/services/server/operator-session';
import {readNativeTreasury} from '@/services/server/near-treasury-service';
export const runtime='nodejs';
export async function GET(request:Request){
 try{requireOperatorSession(request);}catch{return Response.json({error:'Authentication required'},{status:401});}
 try{return Response.json(await readNativeTreasury(),{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Native treasury is unavailable'},{status:503});}
}
