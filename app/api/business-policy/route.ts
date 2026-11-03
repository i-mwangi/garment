import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { openBusinessPolicy } from "@/services/server/business-policy";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const principal = requireOperatorSession(request);
    if (principal.role !== "OWNER") return Response.json({ error: "Owner access is required" }, { status: 403, headers });
    const store = openBusinessPolicy();
    try {
      const company = readNearTreasuryIdentity().companyId;
      return Response.json({ policy: store.get(company), events: store.events(company) }, { headers });
    } finally { store.close(); }
  } catch { return Response.json({ error: "Workspace authorization or policy storage is unavailable" }, { status: 401, headers }); }
}

export async function POST(request: Request) {
  try {
    const principal = requireOperatorSession(request);
    requireSameOrigin(request);
    if (principal.role !== "OWNER") return Response.json({ error: "Owner access is required" }, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 5000) throw new Error("Policy request is too large");
    const input = JSON.parse(raw) as { policy?: unknown; expectedRevision?: unknown };
    if (!input || typeof input !== "object" || !Number.isSafeInteger(input.expectedRevision)) throw new Error("Current policy revision is required");
    const store = openBusinessPolicy();
    try {
      return Response.json({ policy: store.update(readNearTreasuryIdentity().companyId, input.policy, Number(input.expectedRevision), principal.id) }, { headers });
    } finally { store.close(); }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Policy could not be updated" }, { status: 409, headers });
  }
}
