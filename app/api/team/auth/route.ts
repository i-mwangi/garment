import { verifyNearWalletProof } from "@/services/server/near-wallet-proof";
import { createOperatorSession, requireSameOrigin, sessionCookie } from "@/services/server/operator-session";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { openTeamMembers } from "@/services/server/team-members";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch { return Response.json({ error: "Request origin is not authorized" }, { status: 403 }); }
  const repository = openTeamMembers();
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || !("action" in input)) throw new Error("Wallet authentication action is required");
    const companyId = readNearTreasuryIdentity().companyId;
    if (input.action === "challenge") {
      if (!("address" in input) || typeof input.address !== "string") throw new Error("Wallet address is required");
      const token = "token" in input && typeof input.token === "string" ? input.token : undefined;
      return Response.json(repository.challenge(companyId, input.address, new URL(request.url).origin, token), { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action !== "verify" || !("id" in input) || typeof input.id !== "string" || !("signature" in input) || typeof input.signature !== "string") throw new Error("A valid wallet signature is required");
    const challenge = repository.readChallenge(companyId, input.id);
    await verifyNearWalletProof(challenge.address, challenge.message, input.signature);
    const member = repository.consumeChallenge(companyId, input.id);
    const session = createOperatorSession({ id: `member:${member.uuid}`, role: member.role, memberId: member.id, companyId });
    return Response.json({ authenticated: true }, { headers: { "Set-Cookie": sessionCookie(session.token, new URL(request.url).protocol === "https:"), "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Wallet authorization failed. Renew the challenge or invitation and try again." }, { status: 401 }); }
  finally { repository.close(); }
}
