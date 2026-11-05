import { requireOperatorSession } from "@/services/server/operator-session";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { openBusinessRecords } from "@/services/server/business-records";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireOperatorSession(request); }
  catch { return Response.json({ error: "Workspace authorization is required" }, { status: 401 }); }
  const records = openBusinessRecords();
  try {
    const companyId = readNearTreasuryIdentity().companyId;
    const { id } = await context.params;
    if (!records.get(companyId, id)) return Response.json({ error: "Business record not found" }, { status: 404 });
    return Response.json({ events: records.timeline(companyId, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Timeline is unavailable" }, { status: 503 }); }
  finally { records.close(); }
}
