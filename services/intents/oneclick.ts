import { assertNearAccountId } from "../near/account-id.ts";
import { getNearNetwork } from "../near/network.ts";
import { verifyQuoteSignature, type OneClickQuoteResponse } from "@defuse-protocol/one-click-sdk-typescript";

// 1Click operates on mainnet. A quote is never a payment or proof of delivery.
export interface OneClickOrder {
  id: string;
  companyId: string;
  originAsset: string;
  destinationAsset: string;
  inputUnits: string;
  requestAmountUnits?: string;
  swapType?: "EXACT_INPUT" | "EXACT_OUTPUT";
  minimumOutputUnits: string;
  recipient: string;
  refundTo: string;
  deadline: string;
  depositAddress: string;
  depositMemo: string | null;
  correlationId: string;
  signedQuote: unknown;
}

export type OneClickProgress = "awaiting_deposit" | "deposit_seen" | "processing" | "incomplete_deposit" | "provider_success_unverified" | "refunded" | "failed";

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid 1Click ${name}`);
  return value as Record<string, unknown>;
}
function units(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > 78) throw new Error(`Invalid ${name}`);
  return value;
}
function account(value: unknown, name: string): string {
  assertNearAccountId(value);
  return value;
}
function string(value: unknown, name: string, maximum = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Invalid ${name}`);
  return value;
}
function date(value: unknown, name: string): string {
  const result = string(value, name, 40);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Invalid ${name}`);
  return result;
}
function asset(value: unknown, name: string): string {
  const result = string(value, name, 180);
  if (!/^nep141:[a-z0-9._-]+$/.test(result)) throw new Error(`Invalid ${name}`);
  return result;
}

export function mainnetUsdcAsset(): string {
  return `nep141:${getNearNetwork("mainnet").usdcContractId}`;
}

function verifiedQuote(value: unknown): boolean {
  try { return verifyQuoteSignature(value as OneClickQuoteResponse); }
  catch { return false; }
}

export function acceptOneClickQuote(input: unknown, expected: {
  id: string; companyId: string; originAsset: string; inputUnits: string; recipient: string;
  refundTo: string; minimumOutputUnits: string; swapType?: "EXACT_INPUT" | "EXACT_OUTPUT"; now?: Date;
}, verifySignature: (signedQuote: unknown) => boolean = verifiedQuote): OneClickOrder {
  const response = object(input, "quote response");
  if (!verifySignature(input)) throw new Error("1Click quote signature is invalid");
  const request = object(response.quoteRequest, "signed request");
  const quote = object(response.quote, "signed quote");
  const originAsset = asset(expected.originAsset, "origin asset");
  const destinationAsset = mainnetUsdcAsset();
  const recipient = account(expected.recipient, "recipient");
  const inputUnits = units(expected.inputUnits, "input amount");
  const minimumOutputUnits = units(expected.minimumOutputUnits, "minimum output");
  const swapType = expected.swapType ?? "EXACT_INPUT";
  const refundTo = string(expected.refundTo, "refund address", 180);
  if (request.dry !== false || request.swapType !== swapType || request.depositType !== "ORIGIN_CHAIN" || request.recipientType !== "DESTINATION_CHAIN" || request.refundType !== "ORIGIN_CHAIN" || request.originAsset !== originAsset || request.destinationAsset !== destinationAsset || request.amount !== inputUnits || request.recipient !== recipient || request.refundTo !== refundTo) throw new Error("1Click quote changed the requested swap terms");
  const deadline = date(quote.deadline, "quote deadline");
  const requestDeadline = date(request.deadline, "request deadline");
  const now = expected.now ?? new Date();
  if (Date.parse(deadline) <= now.getTime() || Date.parse(requestDeadline) <= now.getTime() || Date.parse(deadline) > Date.parse(requestDeadline)) throw new Error("1Click quote is expired or extends the requested deadline");
  const amountOut = units(quote.amountOut, "quoted output");
  const minAmountOut = units(quote.minAmountOut, "minimum quoted output");
  if (BigInt(amountOut) < BigInt(minAmountOut) || BigInt(minAmountOut) < BigInt(minimumOutputUnits)) throw new Error("1Click quote does not meet the required USDC output");
  if (swapType === "EXACT_OUTPUT" && BigInt(amountOut) !== BigInt(inputUnits)) throw new Error("1Click exact-output quote changed the requested invoice amount");
  const quotedInputUnits = swapType === "EXACT_OUTPUT" ? units(quote.amountIn, "quoted Base USDC input") : inputUnits;
  const depositAddress = string(quote.depositAddress, "deposit address", 180);
  const depositMemo = quote.depositMemo === undefined || quote.depositMemo === null ? null : string(quote.depositMemo, "deposit memo", 180);
  const correlationId = string(response.correlationId, "correlation ID", 120);
  return { id: string(expected.id, "order ID", 120), companyId: string(expected.companyId, "company ID", 120), originAsset, destinationAsset,
    inputUnits: quotedInputUnits, requestAmountUnits: inputUnits, swapType, minimumOutputUnits, recipient, refundTo, deadline, depositAddress, depositMemo, correlationId, signedQuote: input };
}

export function readOneClickStatus(input: unknown, order: OneClickOrder, verifySignature: (signedQuote: unknown) => boolean = verifiedQuote): { progress: OneClickProgress; amountOutUnits: string | null; destinationHashes: string[] } {
  const response = object(input, "status response");
  if (response.correlationId !== order.correlationId) throw new Error("1Click status belongs to another quote");
  const signed = object(response.quoteResponse, "status quote");
  if (!verifySignature(signed)) throw new Error("1Click status quote signature is invalid");
  const quote = object(signed.quote, "status quote details");
  const request = object(signed.quoteRequest, "status request");
  const original = object(order.signedQuote, "saved quote");
  const originalQuote = object(original.quote, "saved quote details");
  if (signed.correlationId !== order.correlationId || quote.depositAddress !== order.depositAddress ||
    (quote.depositMemo ?? null) !== order.depositMemo || quote.deadline !== order.deadline ||
    quote.minAmountOut !== originalQuote.minAmountOut || quote.amountOut !== originalQuote.amountOut ||
    request.originAsset !== order.originAsset || request.destinationAsset !== order.destinationAsset ||
    request.amount !== (order.requestAmountUnits ?? order.inputUnits) || request.swapType !== (order.swapType ?? "EXACT_INPUT") || request.recipient !== order.recipient ||
    request.refundTo !== order.refundTo) throw new Error("1Click status changed the saved quote terms");
  const statuses: Record<string, OneClickProgress> = { PENDING_DEPOSIT: "awaiting_deposit", KNOWN_DEPOSIT_TX: "deposit_seen", PROCESSING: "processing", INCOMPLETE_DEPOSIT: "incomplete_deposit", SUCCESS: "provider_success_unverified", REFUNDED: "refunded", FAILED: "failed" };
  const progress = statuses[String(response.status)];
  if (!progress) throw new Error("Unknown 1Click status; keep the order unresolved");
  const details = response.swapDetails && typeof response.swapDetails === "object" && !Array.isArray(response.swapDetails) ? response.swapDetails as Record<string, unknown> : {};
  const amountOutUnits = typeof details.amountOut === "string" && /^\d+$/.test(details.amountOut) ? details.amountOut : null;
  const destinationHashes = Array.isArray(details.destinationChainTxHashes) ? details.destinationChainTxHashes.filter((row): row is { hash: string } => !!row && typeof row === "object" && typeof row.hash === "string" && !!row.hash).map(row => row.hash) : [];
  if (progress === "provider_success_unverified" && (!amountOutUnits || BigInt(amountOutUnits) < BigInt(order.minimumOutputUnits) || !destinationHashes.length)) throw new Error("1Click success lacks sufficient destination proof; keep the order unresolved");
  return { progress, amountOutUnits, destinationHashes };
}
