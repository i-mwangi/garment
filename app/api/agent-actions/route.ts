import { readNearDeployment } from "@/services/server/near-contract-config";
import { verifiedVault } from "@/services/near/contract-state";
import { vaultAdministrationCall, verifyVaultAdministration } from "@/services/near/vault-admin";
import { createNearReader } from "@/services/near/rpc";
import { isNearTransactionHash } from "@/services/near/account-id";
import type { NearContractCall } from "@/types/near-contracts";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { requireOperatorSession, requireSameOrigin } from "@/services/server/operator-session";
import { openAgentProposals } from "@/services/server/agent-proposals";
import { dispatchAgentOperation } from "@/services/server/agent-dispatch";
import { openVaultPayments } from "@/services/server/vault-payments";
import { openInboundMcp } from "@/services/server/inbound-mcp";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
async function handle(request: Request) {
  let principal;
  try { principal = requireOperatorSession(request); if (!["OWNER","ADMIN"].includes(principal.role)) throw new Error(); if (request.method !== "GET") requireSameOrigin(request); }
  catch { return Response.json({ error: "Company owner authorization is required" }, { status: 403, headers }); }
  const store = openAgentProposals(); const company = readNearTreasuryIdentity().companyId;
  try {
    if (request.method === "GET") {
      const payments = openVaultPayments();
      try { const visible = [...new Map([...store.list(company, principal.id), ...store.pendingExternal(company, principal.id)].map(proposal => [proposal.id, proposal])).values()]; return Response.json(visible.map(proposal => {
        if (proposal.operation.tool !== "payment.review" || proposal.status === "completed") return proposal;
        const payment = payments.get(company, String(proposal.operation.arguments.recordId));
        return payment?.status === "paid" ? store.settledPayment(company, principal.id, proposal.id, { amount: payment.amount, recipient: payment.recipient, transactionHash: payment.transactionHash, status: payment.status }) : proposal;
      }), { headers }); } finally { payments.close(); }
    }
    const body = await request.json();
    if (typeof body.id !== "string" || !["confirm", "cancel", "verify", "review"].includes(body.action) || Object.keys(body).some(key => !["id", "action", "transactionHash"].includes(key))) throw new Error("Choose a saved proposal; its details cannot be changed during approval");
    if (body.action === "cancel") return Response.json(store.cancel(company, principal.id, body.id), { headers });
    const inbound = openInboundMcp(); try { inbound.assertProposalActive(company, principal.id, body.id); } finally { inbound.close(); }
    const existing = store.get(company, principal.id, body.id);
    if(principal.role!=="OWNER" && existing?.operation.tool!=="vault.authorize")throw new Error("Owner authorization is required for this operation");
    if (body.action === "review") { if (existing?.operation.tool !== "payment.review" || existing.status !== "pending" || Date.parse(existing.expiresAt) <= Date.now()) throw new Error("Payment review unavailable"); return Response.json(existing, { headers }); }
    if (existing?.status === "completed") return Response.json(existing, { headers });
    if (existing?.operation.tool === "vault.authorize") {
      const binding=readNearDeployment().treasury;
      const ownerId=principal.member ? principal.member.walletAddress : readNearTreasuryIdentity().accountId;
      if(ownerId!==binding.ownerId)throw new Error("Sign in with the configured native vault owner");
      if(body.action==="verify") {
        if(existing.status!=="awaiting_signature" || !isNearTransactionHash(body.transactionHash))throw new Error("A pending native authorization and its transaction hash are required");
        const saved=existing.result as {call:NearContractCall;networkId:string;ownerId:string};
        if(saved.networkId!==binding.networkId || saved.ownerId!==ownerId || saved.call.contractId!==binding.accountId)throw new Error("Native authorization deployment changed; review the saved transaction");
        const reader=createNearReader(),outcome=await reader.getReceipt(body.transactionHash,ownerId);
        const receipt=outcome.receipts_outcome.find(item=>item.outcome.executor_id===binding.accountId);
        if(!isNearTransactionHash(receipt?.block_hash))throw new Error("Native authorization execution block is unavailable");
        const block=await reader.rpc<{header:{timestamp_nanosec:string}}>("block",{block_id:receipt.block_hash});
        verifyVaultAdministration(saved.call,outcome,{hash:body.transactionHash,ownerId,blockTimestampNs:block.header.timestamp_nanosec,reviewCreatedAt:existing.createdAt});
        await verifiedVault(binding);
        return Response.json(store.finish(company,principal.id,existing.id,"completed",{verifiedOnNear:true,transactionHash:body.transactionHash,call:saved.call}),{headers});
      }
      if(existing.status==="awaiting_signature") {
        if(Date.parse(existing.expiresAt)<=Date.now())throw new Error("The review expired. Verify any previously submitted transaction before preparing another authorization");
        return Response.json({proposal:existing,...existing.result as object},{headers});
      }
      const snapshot=await verifiedVault(binding);
      const a=existing.operation.arguments,call=vaultAdministrationCall(binding,a.action,a.address);
      if(a.action==="unpause" && snapshot.config.approver_count<snapshot.config.policy.required_approvals)throw new Error("Add the required distinct approvers before activating the vault");
      store.claim(company,principal.id,existing.id);
      const result={call,networkId:binding.networkId,ownerId};
      const proposal=store.finish(company,principal.id,existing.id,"awaiting_signature",result);
      return Response.json({proposal,...result},{headers});
    }

    if (body.action === "verify" || existing?.operation.tool === "payment.review") throw new Error("This operation requires its secure payment screen");
    const proposal = store.claim(company, principal.id, body.id);
    try { const result = await dispatchAgentOperation(request, proposal.operation, proposal.id); return Response.json(store.finish(company, principal.id, proposal.id, result?.isError ? "failed" : proposal.operation.tool === "payout.submit" && result?.status === "uncertain" ? "uncertain" : "completed", result), { headers }); }
    catch (failure) {
      // A transport failure can follow a side effect. Never blindly repeat a dispatched call.
      return Response.json(store.finish(company, principal.id, proposal.id, "uncertain", undefined, failure instanceof Error ? failure.message : "The result is unresolved. Check current records before another action."), { headers });
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Action could not be handled" }, { status: 409, headers }); }
  finally { store.close(); }
}
export const GET = handle;
export const POST = handle;
