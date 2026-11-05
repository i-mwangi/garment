import { assertFinalSuccess, type NearExecutionOutcome } from "../near/rpc.ts";
import { isNearTransactionHash } from "../near/account-id.ts";
import type { OneClickOrder } from "./oneclick.ts";
import type { OneClickOrderStore, SavedOneClickOrder } from "./order-store.ts";

/** A provider SUCCESS is only a pointer to evidence; it is never settlement by itself. */
export function verifyOneClickDestination(
  order: OneClickOrder,
  provider: { progress: string; amountOutUnits: string | null; destinationHashes: string[] },
  outcome: NearExecutionOutcome,
  tokenId: string,
): { transactionHash: string; amountUnits: string; recipient: string } {
  if (provider.progress !== "provider_success_unverified") throw new Error("1Click has not reported destination success");
  assertFinalSuccess(outcome);
  const hash = outcome.transaction.hash;
  if (!isNearTransactionHash(hash) || !provider.destinationHashes.includes(hash)) throw new Error("Destination transaction is not bound to the signed 1Click status");
  if (order.destinationAsset !== `nep141:${tokenId}`) throw new Error("Destination token differs from the saved quote");
  const minimum = BigInt(order.minimumOutputUnits);
  if (!provider.amountOutUnits || BigInt(provider.amountOutUnits) < minimum) throw new Error("Provider output is below the required amount");
  let received = 0n;
  for (const receipt of outcome.receipts_outcome) {
    if (receipt.outcome.executor_id !== tokenId) continue;
    for (const log of receipt.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      let event: unknown;
      try { event = JSON.parse(log.slice(11)); } catch { continue; }
      if (!event || typeof event !== "object") continue;
      const row = event as Record<string, unknown>;
      if (row.standard !== "nep141" || row.event !== "ft_transfer" || !Array.isArray(row.data)) continue;
      for (const transfer of row.data) {
        if (!transfer || typeof transfer !== "object") continue;
        const item = transfer as Record<string, unknown>;
        if (item.new_owner_id !== order.recipient || typeof item.amount !== "string" || !/^[1-9]\d*$/.test(item.amount)) continue;
        received += BigInt(item.amount);
      }
    }
  }
  if (received < minimum || received < BigInt(provider.amountOutUnits)) throw new Error("Final NEAR token receipt does not prove the quoted output");
  return { transactionHash: hash, amountUnits: received.toString(), recipient: order.recipient };
}

/** Atomically binds a final receipt to its order; the caller supplies a final RPC outcome. */
export function recordOneClickDestination(
  store: OneClickOrderStore,
  companyId: string,
  orderId: string,
  provider: { progress: string; amountOutUnits: string | null; destinationHashes: string[] },
  outcome: NearExecutionOutcome,
  tokenId: string,
): SavedOneClickOrder {
  const saved = store.get(companyId, orderId);
  if (!saved) throw new Error("Intents order was not found");
  const proof = verifyOneClickDestination(saved.order, provider, outcome, tokenId);
  return store.recordVerifiedDestination(companyId, orderId, proof);
}
