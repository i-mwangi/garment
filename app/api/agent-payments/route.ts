import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { openVaultPayments, queueVaultPayment, executeVaultPayment, reconcileVaultPayment, prepareVaultApproval } from "@/services/server/vault-payments";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try { requireOperatorSession(request); } catch { return Response.json({ error: "Workspace authorization is required" }, { status: 401, headers }); }
  const journal = openVaultPayments();
  try { const company = readNearTreasuryIdentity().companyId; return Response.json({ payments: journal.list(company), events: journal.events(company) }, { headers }); } finally { journal.close(); }
}
export async function POST(request: Request) {
  let principal;
  try { principal = requireOperatorSession(request,"profile"); requireSameOrigin(request); } catch { return Response.json({ error: "Workspace authorization is required" }, { status: 401, headers }); }
  try {
    const { action, recordId, runId } = await request.json();
    if (typeof recordId !== "string" || recordId.length > 100) throw new Error("Saved obligation ID is required");
    const company = readNearTreasuryIdentity().companyId;
    if(action==="prepare_approval" && ["OWNER","ADMIN","REVIEWER"].includes(principal.role)) {
      const signerId=principal.member?principal.member.walletAddress:readNearTreasuryIdentity().accountId;
      if(!signerId)throw new Error("Sign in with a verified native approver wallet");
      return Response.json(await prepareVaultApproval(company,recordId,signerId),{headers});
    }
    if(action==="reconcile" && ["OWNER","ADMIN","REVIEWER"].includes(principal.role))return Response.json(await reconcileVaultPayment(company,recordId),{headers});
    if(principal.role!=="OWNER")return Response.json({error:"Owner authorization is required"},{status:403,headers});
    if (action === "queue" && typeof runId === "string") return Response.json(await queueVaultPayment(company, principal.id, runId, recordId), { headers });
    if (action === "execute") return Response.json(await executeVaultPayment(company, recordId), { headers });
    if (action === "reconcile") return Response.json(await reconcileVaultPayment(company, recordId), { headers });
    throw new Error("Unsupported payment action");
  } catch(error) { return Response.json({ error: error instanceof Error ? error.message : "Vault payment failed" }, { status: 409, headers }); }
}
