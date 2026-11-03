import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { openBusinessRecords } from "@/services/server/business-records";
import { openPaymentLinks } from "@/services/server/payment-links";
import { payNativeObligation } from "@/services/server/near-treasury-service";
import { openVaultPayments, reconcileVaultPayment } from "@/services/server/vault-payments";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { reconcileInvoiceCollection } from "@/services/server/invoice-reconciliation";
import type { BusinessRecordStatus } from "@/types/business";

export const runtime = "nodejs";
const pending: BusinessRecordStatus[] = ["processing", "submitted", "awaiting_approval", "ready"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  let principal;
  try { principal=requireOperatorSession(request); requireSameOrigin(request); }
  catch { return Response.json({ error: "Operator sign-in is required" }, { status: 401 }); }
  let config: ReturnType<typeof readNearTreasuryIdentity>;
  try { config = readNearTreasuryIdentity(); }
  catch { return Response.json({ error: "Treasury configuration is unavailable" }, { status: 503 }); }
  const repository = openBusinessRecords();
  const links = openPaymentLinks();
  const { id } = await context.params;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("action" in body)) throw new Error("An action is required");
    let record = repository.get(config.companyId, id);
    if (!record) return Response.json({ error: "Business record not found" }, { status: 404 });
    if (body.action === "approveQuote") {
      if (principal.role !== "OWNER") return Response.json({ error: "Company owner approval is required" }, { status: 403 });
      return Response.json(repository.approveSupplierQuote(config.companyId, id, principal.id));
    }
    if (body.action === "edit" && "data" in body) {
      if (record.kind === "invoice" && typeof body.data === "object" && body.data !== null && "recipient" in body.data && body.data.recipient !== config.accountId) throw new Error("Invoices must collect into the company treasury wallet");
      return Response.json(repository.updateDraft(config.companyId, id, body.data));
    }
    if (body.action === "cancel") {
      return Response.json(repository.cancel(config.companyId, id));
    }
    if (record.kind === "invoice") {
      if (body.action === "issue") {
        if (record.status === "issued" || record.status === "paid") return Response.json(record);
        record = repository.transition(config.companyId, id, "processing", ["draft", "processing"]);
        const link = links.create({ title: record.title, description: record.description, amount: record.amount, paymentWalletAddress: record.recipient }, record.id);
        return Response.json(repository.transition(config.companyId, id, "issued", ["processing"], { paymentLinkCode: link.code }));
      }
      if (body.action !== "refresh") throw new Error("Invoices collect incoming payments through their payment link");
      if (record.paymentLinkCode) record = reconcileInvoiceCollection(config.companyId, record.paymentLinkCode, repository, links) || record;
      return Response.json(record);
    }
    if (body.action !== "pay" && body.action !== "refresh") throw new Error("Invalid business record action");
    if (record.status === "paid" || record.status === "cancelled") return Response.json(record);
    if(body.action==="pay")await payNativeObligation(config.companyId,id,principal.id);
    else {
      const journal=openVaultPayments();try{if(journal.get(config.companyId,id))await reconcileVaultPayment(config.companyId,id);}finally{journal.close();}
    }
    return Response.json(repository.get(config.companyId,id));
  } catch (error) {
    return Response.json({error:error instanceof Error?error.message:"Native business action is unresolved; check the saved payment before retrying"},{status:409});
  } finally { repository.close(); links.close(); }
}
