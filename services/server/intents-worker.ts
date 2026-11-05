import { getNearNetwork } from "../near/network.ts";
import { OneClickClient } from "../intents/oneclick-client.ts";
import { openOneClickOrders } from "../intents/order-store.ts";
import { reconcileOneClickOrder } from "../intents/reconcile-order.ts";
import { openPaymentLinks } from "./payment-links.ts";

// Observes and reconciles existing customer orders even when autonomous spending is stopped.
export async function runIntentsReconciliation(companyId: string) {
  if (getNearNetwork().networkId !== "mainnet" || process.env.SETTLBOX_BASE_USDC_CHECKOUT_ENABLED !== "true" ||
    !process.env.SETTLBOX_1CLICK_JWT || !process.env.FASTNEAR_API_KEY) return { inspected: 0, confirmed: 0, reviewRequired: 0 };
  const orders = openOneClickOrders(), links = openPaymentLinks();
  try {
    const client = new OneClickClient(process.env.SETTLBOX_1CLICK_JWT);
    let inspected = 0, confirmed = 0, reviewRequired = 0;
    for (const saved of orders.pending(companyId)) {
      inspected++;
      try {
        const next = await reconcileOneClickOrder({ companyId, orderId: saved.order.id,
          code: saved.order.id.split(":", 1)[0], indexerKey: process.env.FASTNEAR_API_KEY,
          client, orders, links });
        if (!saved.verifiedDestination && next.verifiedDestination) confirmed++;
      } catch { reviewRequired++; }
    }
    return { inspected, confirmed, reviewRequired };
  } finally { orders.close(); links.close(); }
}
