import type { OneClickOrder } from "./oneclick.ts";

const baseUsdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Proves only the refund transfer; it does not infer whether a new quote may be safely created. */
export async function verifyBaseUsdcRefund(order: OneClickOrder, refund: { amountUnits: string; hashes: string[] },
  rpcUrl: string, transport: typeof fetch = fetch): Promise<{ transactionHash: string; amountUnits: string }> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(order.refundTo) || !/^[1-9]\d{0,77}$/.test(refund.amountUnits) || !Array.isArray(refund.hashes)) throw new Error("Invalid Base refund terms");
  const endpoint = new URL(rpcUrl);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    endpoint.hostname !== "mainnet.base.org") throw new Error("Base RPC endpoint is not approved");
  for (const hash of refund.hashes.slice(0, 10)) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) continue;
    const response = await transport(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
      cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) continue;
    const raw = await response.text();
    if (raw.length > 131072) continue;
    let receipt: { result?: { transactionHash?: string; status?: string; logs?: { address?: string; topics?: string[]; data?: string }[] } };
    try { receipt = JSON.parse(raw); } catch { continue; }
    if (receipt.result?.transactionHash?.toLowerCase() !== hash.toLowerCase() || receipt.result.status !== "0x1") continue;
    const received = (receipt.result.logs || []).reduce((sum, log) => {
      const recipient = log.topics?.[2];
      if (log.address?.toLowerCase() !== baseUsdc || log.topics?.[0]?.toLowerCase() !== transferTopic ||
        !recipient || recipient.toLowerCase() !== `0x${"0".repeat(24)}${order.refundTo.slice(2).toLowerCase()}` ||
        !/^0x[0-9a-fA-F]{64}$/.test(log.data || "")) return sum;
      return sum + BigInt(log.data!);
    }, 0n);
    if (received >= BigInt(refund.amountUnits)) return { transactionHash: hash, amountUnits: received.toString() };
  }
  throw new Error("Base USDC refund has not been verified on-chain");
}
