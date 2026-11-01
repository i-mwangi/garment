import { assertNearAccountId, isNearTransactionHash } from "./account-id.ts";
import { getNearNetwork, type NearNetwork } from "./network.ts";

export class NearRpcError extends Error {
  readonly code: number;
  readonly detail: unknown;
  constructor(code: number, detail: unknown) { super("NEAR RPC request failed"); this.code = code; this.detail = detail; }
}

export function createNearReader(network: NearNetwork = getNearNetwork(), fetchFn: typeof fetch = fetch) {
  let verified: Promise<void> | undefined;
  async function rpc<T>(method: string, params: unknown): Promise<T> {
    const options:RequestInit={
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      signal: AbortSignal.timeout(15000), body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    };
    let response:Response|undefined;
    try{response=await fetchFn(network.rpcUrl,options);}catch(error){if(!network.backupRpcUrl)throw error;}
    if((!response || response.status>=500 || response.status===429) && network.backupRpcUrl && ["status","query","block","tx"].includes(method)) {
      const identity=await fetchFn(network.backupRpcUrl,{...options,signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:"2.0",id:crypto.randomUUID(),method:"status",params:[]})});
      if(!identity.ok || (await identity.json()).result?.chain_id!==network.networkId)throw new Error("Backup NEAR RPC network mismatch or unavailable");
      response=await fetchFn(network.backupRpcUrl,{...options,signal:AbortSignal.timeout(15000)});
    }
    if(!response)throw new Error("NEAR RPC is unavailable");
    if (!response.ok) throw new Error(`NEAR RPC is unavailable (HTTP ${response.status})`);
    const body = await response.json() as { result?: T; error?: { code: number; data?: unknown; message?: string } };
    if (body.error) throw new NearRpcError(body.error.code, body.error.data ?? body.error.message);
    if (body.result === undefined) throw new Error("Invalid NEAR RPC response");
    // Some query endpoints return missing-account/key errors inside result.
    if (method === "query" && body.result && typeof body.result === "object" && "error" in body.result) {
      throw new NearRpcError(-32000, (body.result as { error: unknown }).error);
    }
    return body.result;
  }
  async function verifyNetwork(): Promise<void> {
    verified ??= rpc<{ chain_id: string }>("status", []).then(status => {
      if (status.chain_id !== network.networkId) throw new Error("NEAR RPC network does not match wallet configuration");
    }).catch(error => { verified = undefined; throw error; });
    return verified;
  }
  async function view<T>(contractId: string, methodName: string, args: object): Promise<T> {
    assertNearAccountId(contractId); await verifyNetwork();
    const bytes = new TextEncoder().encode(JSON.stringify(args));
    const argsBase64 = typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(String.fromCharCode(...bytes));
    const result = await rpc<{ result: number[] }>("query", { request_type: "call_function", finality: "final", account_id: contractId, method_name: methodName, args_base64: argsBase64 });
    return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
  }
  return {
    network, rpc, view, verifyNetwork,
    async getUsdcBalance(accountId: string): Promise<bigint> {
      assertNearAccountId(accountId);
      const metadata = await view<{ symbol: string; decimals: number }>(network.usdcContractId, "ft_metadata", {});
      if (metadata.symbol !== "USDC" || metadata.decimals !== network.usdcDecimals) throw new Error("USDC contract metadata does not match the configured token");
      const balance = await view<string>(network.usdcContractId, "ft_balance_of", { account_id: accountId });
      if (!/^(0|[1-9]\d*)$/.test(balance)) throw new Error("Invalid USDC balance response");
      return BigInt(balance);
    },
    async getNativeBalance(accountId: string): Promise<bigint> {
      assertNearAccountId(accountId); await verifyNetwork();
      const account = await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId });
      return BigInt(account.amount);
    },
    async getBlockNumber(): Promise<number> {
      await verifyNetwork();
      const block = await rpc<{ header: { height: number } }>("block", { finality: "final" });
      return block.header.height;
    },
    async getReceipt(hash: string, signerId: string) {
      if (!isNearTransactionHash(hash)) throw new Error("Invalid native NEAR transaction hash");
      assertNearAccountId(signerId); await verifyNetwork();
      return rpc<NearExecutionOutcome>("tx", { tx_hash: hash, sender_account_id: signerId, wait_until: "FINAL" });
    },
  };
}

export interface NearExecutionOutcome {
  final_execution_status?: string;
  status: { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown };
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: unknown[] };
  transaction_outcome: { id: string; outcome: { executor_id: string; status: Record<string, unknown>; logs: string[] } };
  receipts_outcome: { id: string; block_hash?: string; outcome: { executor_id: string; status: Record<string, unknown>; logs: string[] } }[];
}

export function assertFinalSuccess(outcome: NearExecutionOutcome): void {
  if (outcome.final_execution_status !== "FINAL" || !("SuccessValue" in outcome.status)) throw new Error("NEAR transaction is not finally successful");
  if (outcome.receipts_outcome.some(receipt => "Failure" in receipt.outcome.status)) throw new Error("A NEAR transaction receipt failed");
}
