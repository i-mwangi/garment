import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { openGiftEscrow, openGifts } from "@/services/server/gift-escrow";
import type { NearGift } from "@/types/near-gift";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { requireOperatorSession(request); }
  catch { return Response.json({ error: "Workspace authorization is required" }, { status: 401 }); }
  const repository = openGifts();
  try {
    const escrow = await openGiftEscrow();
    const saved = repository.list(readNearTreasuryIdentity().companyId,escrow.config.networkId,escrow.config.accountId);
    if (!saved.length) return Response.json([], { headers: { "Cache-Control": "no-store" } });
    const records: NearGift[] = [];
    for (let offset = 0; offset < saved.length; offset += 5) records.push(...await Promise.all(saved.slice(offset, offset + 5).map(async gift => ({ ...await escrow.read(gift.id), transactionHash: gift.transactionHash }))));
    return Response.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Gift escrow is unavailable; retry to read confirmed status" }, { status: 503 }); }
  finally { repository.close(); }
}

export async function POST(request: Request) {
  let principal;
  try { principal = requireOperatorSession(request); requireSameOrigin(request); }
  catch { return Response.json({ error: "Workspace authorization is required" }, { status: 401 }); }
  const repository = openGifts();
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") throw new Error("Gift identifier is required");
    if ("transactionHash" in body && typeof body.transactionHash !== "string") throw new Error("Invalid funding transaction");
    const escrow = await openGiftEscrow();
    if (!("transactionHash" in body) || typeof body.transactionHash !== "string") throw new Error("Native funding transaction is required");
    const signerId = principal.member ? principal.member.walletAddress : readNearTreasuryIdentity().accountId;
    if (!signerId) throw new Error("A verified workspace wallet is required");
    const gift = await escrow.verifyFunding(body.id, body.transactionHash, signerId);
    return Response.json(repository.save(readNearTreasuryIdentity().companyId, gift), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Gift funding could not be verified" }, { status: 400 }); }
  finally { repository.close(); }
}
