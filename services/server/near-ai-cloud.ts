const NEAR_AI_RESPONSES_URL = "https://cloud-api.near.ai/v1/responses";

export interface NearAiCompletion {
  id: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  requestId: string | null;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`NEAR AI Cloud returned invalid ${name}`);
  return Number(value);
}

// No caller may expose this transport to a user until it has reserved an
// owner-approved cost ceiling and can reconcile the provider's actual charge.
export async function requestNearAiCompletion(input: {
  instructions: string;
  message: string;
  model: string;
  apiKey: string;
  maxOutputTokens: number;
}, transport: typeof fetch = fetch): Promise<NearAiCompletion> {
  if (!input.apiKey || input.apiKey.length < 16 || /\s/.test(input.apiKey)) throw new Error("NEAR AI Cloud API key is missing or invalid");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,119}$/.test(input.model)) throw new Error("NEAR AI Cloud model ID is invalid");
  if (!input.instructions || input.instructions.length > 12000 || !input.message || input.message.length > 30000) throw new Error("NEAR AI Cloud request is empty or too large");
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 2400) throw new Error("NEAR AI Cloud output limit is invalid");
  const response = await transport(NEAR_AI_RESPONSES_URL, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ model: input.model, store: false, max_output_tokens: input.maxOutputTokens,
      instructions: input.instructions, input: input.message }),
  });
  if (!response.ok) throw new Error(`NEAR AI Cloud inference failed (HTTP ${response.status}); no action was applied`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("NEAR AI Cloud returned an invalid response");
  const result = data as Record<string, unknown>;
  const content = Array.isArray(result.output) ? result.output.flatMap(item => item && typeof item === "object" && !Array.isArray(item) && Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : []) : [];
  const text = content.filter(item => item && typeof item === "object" && (item as { type?: unknown }).type === "output_text" && typeof (item as { text?: unknown }).text === "string").map(item => (item as { text: string }).text).join("\n").trim();
  const usage = result.usage && typeof result.usage === "object" && !Array.isArray(result.usage) ? result.usage as Record<string, unknown> : {};
  if (result.status !== "completed" || typeof result.id !== "string" || !result.id || typeof result.model !== "string" || !result.model || !text || text.length > 12000) throw new Error("NEAR AI Cloud returned an incomplete response");
  return { id: result.id, model: result.model, text,
    inputTokens: positiveInteger(usage.input_tokens, "input usage"),
    outputTokens: positiveInteger(usage.output_tokens, "output usage"),
    requestId: response.headers.get("x-request-id") };
}
