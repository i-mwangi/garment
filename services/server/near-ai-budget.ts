import { formatAmount } from "../near/amount.ts";
import { BusinessPolicyStore } from "./business-policy.ts";
import { requestNearAiCompletion, type NearAiCompletion } from "./near-ai-cloud.ts";

const MODELS_URL = "https://cloud-api.near.ai/v1/models";
const PRICE_SCALE = 1_000_000_000_000n;

function price(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(\.\d{1,12})?$/.test(value)) throw new Error("NEAR AI model price is unavailable");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * PRICE_SCALE + BigInt(fraction.padEnd(12, "0") || "0");
}
function microUsdCeiling(inputTokens: number, outputTokens: number, inputPrice: bigint, outputPrice: bigint): bigint {
  const scaled = BigInt(inputTokens) * inputPrice + BigInt(outputTokens) * outputPrice;
  return (scaled + 999_999n) / 1_000_000n;
}

export async function readNearAiModelPrice(model: string, apiKey: string, transport: typeof fetch = fetch) {
  if (!apiKey || apiKey.length < 16 || /\s/.test(apiKey)) throw new Error("NEAR AI Cloud API key is unavailable");
  const response = await transport(MODELS_URL, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`NEAR AI model catalog failed (HTTP ${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) throw new Error("NEAR AI model catalog is invalid");
  const rows = (body as { data: unknown[] }).data.filter(row => row && typeof row === "object" && (row as { id?: unknown }).id === model);
  if (rows.length !== 1) throw new Error("NEAR AI model is unavailable or ambiguous");
  const row = rows[0] as { pricing?: { prompt?: unknown; completion?: unknown }; context_length?: unknown; max_output_length?: unknown };
  if (!Number.isSafeInteger(row.context_length) || Number(row.context_length) < 1 || !Number.isSafeInteger(row.max_output_length) || Number(row.max_output_length) < 1) throw new Error("NEAR AI model limits are unavailable");
  return { inputPrice: price(row.pricing?.prompt), outputPrice: price(row.pricing?.completion),
    contextLength: Number(row.context_length), maxOutputLength: Number(row.max_output_length) };
}

export async function requestBudgetedNearAiCompletion(input: {
  companyId: string; reservationId: string; instructions: string; message: string;
  model: string; apiKey: string; maxOutputTokens: number;
}, policyStore: BusinessPolicyStore, transport: typeof fetch = fetch): Promise<NearAiCompletion> {
  const currentPolicy = policyStore.get(input.companyId);
  if (currentPolicy.stopped || currentPolicy.revision < 1) throw new Error("Business policy is stopped or not configured");
  const model = await readNearAiModelPrice(input.model, input.apiKey, transport);
  if (input.maxOutputTokens > model.maxOutputLength) throw new Error("NEAR AI output exceeds the model limit");
  // UTF-8 bytes bound the client text token count; the extra margin covers
  // gateway message framing and any model-specific wrapper tokens.
  const inputCeiling = Buffer.byteLength(input.instructions) + Buffer.byteLength(input.message) + 8192;
  if (inputCeiling + input.maxOutputTokens > model.contextLength) throw new Error("NEAR AI request exceeds the model context budget");
  const reservedUnits = microUsdCeiling(inputCeiling, input.maxOutputTokens, model.inputPrice, model.outputPrice);
  if (reservedUnits <= 0n) throw new Error("NEAR AI model pricing is unavailable");
  const revision = currentPolicy.revision;
  const reservation = policyStore.reserve(input.companyId, input.reservationId, "inference", formatAmount(reservedUnits), revision);
  if (reservation.existing) throw new Error("Inference request was already reserved; reconcile its provider response before retrying");
  // Never retry automatically after a transport error: the provider may have billed it.
  const completion = await requestNearAiCompletion(input, transport);
  if (completion.model !== input.model) throw new Error("NEAR AI returned a different model; reconcile the reserved charge before retrying");
  const actualUnits = microUsdCeiling(completion.inputTokens, completion.outputTokens, model.inputPrice, model.outputPrice);
  if (actualUnits > reservedUnits) throw new Error("NEAR AI usage exceeded the reserved ceiling; reconcile billing before retrying");
  policyStore.recordInferenceCharge(input.companyId, input.reservationId, completion.id, formatAmount(actualUnits));
  return completion;
}
