import { assertNearAccountId } from "../near/account-id.ts";
import { acceptOneClickQuote, mainnetUsdcAsset, readOneClickStatus, type OneClickOrder } from "./oneclick.ts";

const BASE = "https://1click.chaindefuser.com/v0";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function apiKey(value: string): string {
  if (!value || value.length < 16 || /[\s\r\n]/.test(value)) throw new Error("1Click API key is unavailable");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid 1Click response");
  return value as Record<string, unknown>;
}
function exactUnits(value: string): string {
  if (!/^[1-9]\d{0,77}$/.test(value)) throw new Error("Enter a positive Base USDC amount in base units");
  return value;
}
function baseAddress(value: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("A Base refund address is required");
  return value;
}

export class OneClickClient {
  private readonly key: string;
  private readonly transport: typeof fetch;
  constructor(key: string, transport: typeof fetch = fetch) { this.key = apiKey(key); this.transport = transport; }
  private async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const response = await this.transport(`${BASE}${path}`, {
      method, headers: { "X-API-Key": this.key, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`1Click request failed (HTTP ${response.status}); no settlement was recorded`);
    const text = await response.text();
    if (text.length > 262144) throw new Error("1Click response exceeds the allowed size");
    try { return JSON.parse(text); } catch { throw new Error("1Click returned invalid JSON"); }
  }
  async supportedBaseUsdcAsset(): Promise<string> {
    const tokens = await this.request("/tokens");
    if (!Array.isArray(tokens)) throw new Error("1Click token catalog is unavailable");
    const matching = tokens.filter(token => {
      if (!token || typeof token !== "object") return false;
      const row = token as Record<string, unknown>;
      return row.blockchain === "base" && row.symbol === "USDC" && row.decimals === 6 &&
        typeof row.assetId === "string" && row.assetId.toLowerCase() === `nep141:base-${BASE_USDC}.omft.near` &&
        (row.contractAddress === null || row.contractAddress === undefined || String(row.contractAddress).toLowerCase() === BASE_USDC);
    }) as Record<string, unknown>[];
    if (matching.length !== 1) throw new Error("Official Base USDC is not uniquely available from 1Click");
    const destination = mainnetUsdcAsset();
    if (!tokens.some(token => token && typeof token === "object" && (token as Record<string, unknown>).assetId === destination)) throw new Error("Native NEAR USDC is not available from 1Click");
    return String(matching[0].assetId);
  }
  async quote(input: { id: string; companyId: string; amountUnits: string; minimumOutputUnits: string; recipient: string; refundTo: string; deadline: string; slippageBps: number; swapType?: "EXACT_INPUT" | "EXACT_OUTPUT" }, verifySignature?: (value: unknown) => boolean): Promise<OneClickOrder> {
    const recipient = input.recipient; assertNearAccountId(recipient);
    const refundTo = baseAddress(input.refundTo);
    const amountUnits = exactUnits(input.amountUnits), minimumOutputUnits = exactUnits(input.minimumOutputUnits);
    if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 100) throw new Error("Slippage must be at most 1%");
    const deadline = Date.parse(input.deadline);
    if (!Number.isFinite(deadline) || deadline <= Date.now() + 30000 || deadline > Date.now() + 10 * 60_000) throw new Error("Choose a deadline between 30 seconds and 10 minutes from now");
    const originAsset = await this.supportedBaseUsdcAsset();
    const swapType = input.swapType ?? "EXACT_INPUT";
    const request = { dry: false, swapType, slippageTolerance: input.slippageBps,
      originAsset, depositType: "ORIGIN_CHAIN", destinationAsset: mainnetUsdcAsset(), amount: amountUnits,
      recipient, recipientType: "DESTINATION_CHAIN", refundTo, refundType: "ORIGIN_CHAIN", deadline: input.deadline };
    const response = await this.request("/quote", "POST", request);
    const quote = acceptOneClickQuote(response, { id: input.id, companyId: input.companyId, originAsset,
      inputUnits: amountUnits, recipient, refundTo, minimumOutputUnits, swapType, now: new Date() }, verifySignature);
    const returned = object(object(response).quoteRequest);
    if (returned.deadline !== input.deadline || returned.slippageTolerance !== input.slippageBps) throw new Error("1Click quote changed the requested deadline or slippage");
    return quote;
  }
  async status(order: OneClickOrder, verifySignature?: (value: unknown) => boolean) {
    const query = new URLSearchParams({ depositAddress: order.depositAddress });
    if (order.depositMemo !== null) query.set("depositMemo", order.depositMemo);
    return readOneClickStatus(await this.request(`/status?${query}`), order, verifySignature);
  }
  async submitDepositHash(order: OneClickOrder, hash: string): Promise<void> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("A Base transaction hash is required");
    await this.request("/deposit/submit", "POST", { depositAddress: order.depositAddress, txHash: hash });
  }
}
