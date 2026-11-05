import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { openProcurementQuotes } from "@/services/server/procurement-quotes";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    requireOperatorSession(request);
    const { id } = await context.params;
    const store = openProcurementQuotes();
    try { return Response.json({ quotes: store.list(readNearTreasuryIdentity().companyId, id) }, { headers }); }
    finally { store.close(); }
  } catch { return Response.json({ error: "Supplier options are unavailable" }, { status: 401, headers }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const principal = requireOperatorSession(request); requireSameOrigin(request);
    if (principal.role !== "OWNER" && principal.role !== "ADMIN") return Response.json({ error: "Owner or admin access is required" }, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 3000) throw new Error("Supplier option is too large");
    const { id } = await context.params;
    const store = openProcurementQuotes();
    try { return Response.json(store.add(readNearTreasuryIdentity().companyId, id, JSON.parse(raw), principal.id), { headers }); }
    finally { store.close(); }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Supplier option could not be saved" }, { status: 409, headers }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const principal = requireOperatorSession(request); requireSameOrigin(request);
    if (principal.role !== "OWNER") return Response.json({ error: "Company owner selection is required" }, { status: 403, headers });
    const body = await request.json() as { quoteId?: unknown };
    if (typeof body.quoteId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.quoteId)) throw new Error("Supplier option ID is required");
    const { id } = await context.params;
    const store = openProcurementQuotes();
    try { return Response.json(store.select(readNearTreasuryIdentity().companyId, id, body.quoteId), { headers }); }
    finally { store.close(); }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Supplier option could not be selected" }, { status: 409, headers }); }
}
