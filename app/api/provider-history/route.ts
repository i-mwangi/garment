import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { requireOperatorSession } from "@/services/server/operator-session";
import { openProviderHistory } from "@/services/server/provider-history";
import { readLiveCollection } from "@/services/server/live-collection";
import { workspaceEntity } from "@/types/seeded-workspace";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { requireOperatorSession(request); } catch { return Response.json({ error: "Sign in to your workspace" }, { status: 401 }); }
  const repository = openProviderHistory();
  try {
    const identity = readNearTreasuryIdentity();
    const entity = workspaceEntity(new URL(request.url).searchParams.get("entity") || "entity-3");
    const history = repository.get(identity.companyId, entity);
    try {
      const liveCollection = await readLiveCollection(identity);
      return Response.json({ ...history, liveCollection }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ ...history, liveCollectionError: "Live NEAR collection data is temporarily unavailable" }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "History is unavailable" }, { status: 400 }); }
  finally { repository.close(); }
}
