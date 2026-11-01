import { openGiftEscrow } from "@/services/server/gift-escrow";

export const runtime = "nodejs";
export async function GET() {
  try { return Response.json((await openGiftEscrow()).config, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Native NEAR gift escrow is not configured or could not be verified" }, { status: 503 }); }
}
