import type { OneClickClient } from "./oneclick-client.ts";
import type { OneClickOrderStore, SavedOneClickOrder } from "./order-store.ts";
import type { PaymentLinkRepository } from "../server/payment-links.ts";
import { readOneClickDestination } from "./destination-reader.ts";
import { recordOneClickDestination } from "./destination-settlement.ts";
import { getNearNetwork } from "../near/network.ts";
import { openBusinessRecords } from "../server/business-records.ts";
import { reconcileInvoiceCollection } from "../server/invoice-reconciliation.ts";
import { verifyBaseUsdcRefund } from "./base-refund.ts";

export async function reconcileOneClickOrder(input: {
  companyId: string; orderId: string; code: string; indexerKey: string;
  client: Pick<OneClickClient, "status">; orders: OneClickOrderStore; links: PaymentLinkRepository;
  destinationReader?: typeof readOneClickDestination;
}): Promise<SavedOneClickOrder> {
  const { companyId, orderId, code, indexerKey, client, orders, links } = input;
  if (!orderId.startsWith(`${code}:`)) throw new Error("Intents order does not belong to this checkout");
  let saved = orders.get(companyId, orderId);
  if (!saved) throw new Error("Checkout order was not found");
  if (!saved.verifiedDestination && !saved.verifiedRefund && saved.progress !== "failed") {
    const progress = await client.status(saved.order);
    saved = orders.update(companyId, orderId, { progress: progress.progress, amountOutUnits: progress.amountOutUnits, destinationHashes: progress.destinationHashes });
    if (saved.progress === "refunded" && progress.refund?.hashes.length) {
      try {
        const proof = await verifyBaseUsdcRefund(saved.order, progress.refund, "https://mainnet.base.org");
        saved = orders.recordVerifiedRefund(companyId, orderId, proof);
      } catch { /* Keep the provider refund claim separate from confirmed Base evidence. */ }
    }
    if (saved.progress === "provider_success_unverified") {
      for (const hash of saved.destinationHashes) {
        let outcome;
        try { outcome = await (input.destinationReader ?? readOneClickDestination)(hash, indexerKey); }
        catch { continue; }
        try {
          saved = recordOneClickDestination(orders, companyId, orderId, progress, outcome, getNearNetwork().usdcContractId);
          break;
        } catch { /* A different destination hash may contain the qualifying transfer. */ }
      }
    }
  }
  if (saved.verifiedDestination) {
    links.recordVerifiedIntent(code, orderId, saved.verifiedDestination.transactionHash);
    const records = openBusinessRecords();
    try { reconcileInvoiceCollection(companyId, code, records, links); }
    finally { records.close(); }
    saved = orders.markBooked(companyId, orderId);
  }
  return saved;
}
