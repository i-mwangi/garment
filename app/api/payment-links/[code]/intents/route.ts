import { randomUUID } from "node:crypto";
import { requireSameOrigin } from "@/services/server/operator-session";
import { openPaymentLinks } from "@/services/server/payment-links";
import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";
import { getNearNetwork } from "@/services/near/network";
import { parseAmount } from "@/services/near/amount";
import { OneClickClient } from "@/services/intents/oneclick-client";
import { openOneClickOrders } from "@/services/intents/order-store";
import { reconcileOneClickOrder } from "@/services/intents/reconcile-order";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
const headers = { "Cache-Control": "no-store" };

function configured() {
  if (process.env.SETTLBOX_BASE_USDC_CHECKOUT_ENABLED !== "true") throw new Error("Base USDC checkout is not activated");
  if (getNearNetwork().networkId !== "mainnet") throw new Error("Base USDC checkout requires a mainnet NEAR payment link");
  const key = process.env.SETTLBOX_1CLICK_JWT;
  if (!key || !process.env.FASTNEAR_API_KEY) throw new Error("Base USDC checkout is not configured");
  return { identity: readNearTreasuryIdentity(), client: new OneClickClient(key) };
}

function publicOrder(saved: ReturnType<ReturnType<typeof openOneClickOrders>["get"]>, timeline: ReturnType<ReturnType<typeof openOneClickOrders>["timeline"]> = []) {
  if (!saved) throw new Error("Checkout order was not found");
  return {
    orderId: saved.order.id,
    sourceChain: "Base",
    sourceToken: "USDC",
    sourceAmountUnits: saved.order.inputUnits,
    destinationChain: "NEAR",
    destinationToken: "USDC",
    minimumReceivedUnits: saved.order.minimumOutputUnits,
    recipient: saved.order.recipient,
    depositAddress: saved.order.depositAddress,
    depositMemo: saved.order.depositMemo,
    refundTo: saved.order.refundTo,
    expiresAt: saved.order.deadline,
    status: saved.verifiedDestination ? "confirmed" : saved.verifiedRefund ? "refund_verified" : saved.progress,
    destinationTransactionHash: saved.verifiedDestination?.transactionHash ?? null,
    refundTransactionHash: saved.verifiedRefund?.transactionHash ?? null,
    timeline,
  };
}

export async function POST(request: Request, context: Context) {
  try { requireSameOrigin(request); }
  catch { return Response.json({ error: "Request origin is not authorized" }, { status: 403, headers }); }
  const { code } = await context.params;
  const links = openPaymentLinks();
  const orders = openOneClickOrders();
  try {
    const { identity, client } = configured();
    const link = links.get(code);
    if (!link || link.status !== "ACTIVE" || link.acceptedChains[0]?.networkId !== "mainnet" ||
      link.acceptedTokens[0]?.address !== getNearNetwork().usdcContractId) throw new Error("This link cannot accept Base USDC checkout");
    const raw = await request.text();
    if (raw.length > 1000) throw new Error("Checkout request is too large");
    const input = JSON.parse(raw) as Record<string, unknown>;
    if (!input || typeof input.refundTo !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(input.refundTo)) throw new Error("Enter a valid Base refund address");
    orders.reserveQuoteAttempt(identity.companyId, code);
    const amount = parseAmount(link.amount).toString();
    const quote = await client.quote({ id: `${code}:${randomUUID()}`, companyId: identity.companyId,
      amountUnits: amount, minimumOutputUnits: amount, recipient: link.paymentWalletAddress,
      refundTo: input.refundTo, deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
      slippageBps: 100, swapType: "EXACT_OUTPUT" });
    const saved = orders.create(quote);
    return Response.json(publicOrder(saved, orders.timeline(identity.companyId, saved.order.id)), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Base checkout is unavailable" }, { status: 409, headers });
  } finally { links.close(); orders.close(); }
}

export async function GET(request: Request, context: Context) {
  const { code } = await context.params;
  if (new URL(request.url).searchParams.get("availability") === "1") {
    const links = openPaymentLinks();
    try {
      const link = links.get(code);
      return Response.json({ available: !!link && link.status === "ACTIVE" &&
        getNearNetwork().networkId === "mainnet" && !!process.env.SETTLBOX_1CLICK_JWT &&
        !!process.env.FASTNEAR_API_KEY && process.env.SETTLBOX_BASE_USDC_CHECKOUT_ENABLED === "true" }, { headers });
    } finally { links.close(); }
  }
  const orders = openOneClickOrders();
  const links = openPaymentLinks();
  try {
    const { identity, client } = configured();
    const id = new URL(request.url).searchParams.get("orderId") || "";
    if (!id.startsWith(`${code}:`) || id.length > 120) throw new Error("Checkout order ID is invalid");
    const saved = orders.get(identity.companyId, id);
    if (!saved) return Response.json({ error: "Checkout order was not found" }, { status: 404, headers });
    const result = await reconcileOneClickOrder({ companyId: identity.companyId, orderId: id, code,
      indexerKey: process.env.FASTNEAR_API_KEY!, client, orders, links });
    return Response.json(publicOrder(result, orders.timeline(identity.companyId, id)), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Checkout status is unavailable" }, { status: 409, headers });
  } finally { orders.close(); links.close(); }
}
