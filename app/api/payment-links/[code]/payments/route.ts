import { requireSameOrigin } from "@/services/server/operator-session";
import { openPaymentLinks } from "@/services/server/payment-links";
import { createNearReader } from "@/services/near/rpc";
import { assertNearAccountId, isNearTransactionHash } from "@/services/near/account-id";
import { verifyNearLinkSettlement } from "@/services/near/link-settlement";
import { openBusinessRecords } from "@/services/server/business-records";
import { reconcileInvoiceCollection } from "@/services/server/invoice-reconciliation";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try { requireSameOrigin(request); }
  catch { return Response.json({ error: "Request origin is not authorized" }, { status: 403 }); }
  const { code } = await context.params;
  const repository = openPaymentLinks();
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("txid" in body) || !isNearTransactionHash(body.txid) || !("signerId" in body)) throw new Error("A native NEAR transaction hash and payer account ID are required");
    assertNearAccountId(body.signerId);
    const link = repository.get(code);
    if (!link) return Response.json({ error: "Payment link not found" }, { status: 404 });
    const reader = createNearReader();
    if (!link.acceptedChains.some(chain => chain.networkId === reader.network.networkId) || !link.acceptedTokens.some(token => token.address === reader.network.usdcContractId && token.decimals === 6)) throw new Error("Payment link belongs to a different network or token");
    const outcome = await reader.getReceipt(body.txid, body.signerId);
    const tokenReceipt = outcome.receipts_outcome.find(receipt => receipt.outcome.executor_id === reader.network.usdcContractId && receipt.block_hash);
    if (!tokenReceipt?.block_hash) throw new Error("Token settlement block is unavailable");
    const block = await reader.rpc<{ header: { timestamp_nanosec: string } }>("block", { block_id: tokenReceipt.block_hash });
    const payer = verifyNearLinkSettlement(link, outcome, { tokenId: reader.network.usdcContractId, signerId: body.signerId, hash: body.txid, blockTimestampNs: block.header.timestamp_nanosec });
    const result = repository.record(code, body.txid, payer, link.amount);
    const records = openBusinessRecords();
    try { reconcileInvoiceCollection(readNearTreasuryIdentity().companyId, code, records, repository); }
    finally { records.close(); }
    return Response.json({ status: "confirmed", transactionHash: body.txid, paymentCount: result.records.length });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Payment could not be verified" }, { status: 409 }); }
  finally { repository.close(); }
}
