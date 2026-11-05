import { assertNearAccountId, isNearTransactionHash } from "../near/account-id.ts";
import { createNearReader } from "../near/rpc.ts";
import { getNearNetwork } from "../near/network.ts";

/** Indexed lookup supplies only the signer hint; final RPC supplies authoritative receipts. */
export async function readOneClickDestination(hash: string, apiKey: string, transport: typeof fetch = fetch,
  reader: Pick<ReturnType<typeof createNearReader>, "getReceipt"> = createNearReader()) {
  if (!isNearTransactionHash(hash)) throw new Error("Invalid destination transaction hash");
  if (getNearNetwork().networkId !== "mainnet") throw new Error("Destination lookup requires NEAR mainnet");
  if (!apiKey || apiKey.length < 16 || /\s/.test(apiKey)) throw new Error("Transaction indexer key is unavailable");
  const response = await transport("https://tx.main.fastnear.com/v0/transactions", {
    method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tx_hashes: [hash] }), cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Destination transaction index is unavailable (HTTP ${response.status})`);
  const raw = await response.text();
  if (raw.length > 262144) throw new Error("Destination transaction index response is too large");
  const data = JSON.parse(raw) as { transactions?: { transaction?: { hash?: unknown; signer_id?: unknown } }[] };
  const match = data.transactions?.find(item => item.transaction?.hash === hash);
  if (typeof match?.transaction?.signer_id !== "string") throw new Error("Destination transaction is not indexed yet");
  assertNearAccountId(match.transaction.signer_id);
  const outcome = await reader.getReceipt(hash, match.transaction.signer_id);
  if (outcome.transaction.hash !== hash || outcome.transaction.signer_id !== match.transaction.signer_id) throw new Error("Destination index and final RPC disagree");
  return outcome;
}
