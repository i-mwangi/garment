import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNearAiCompletion } from '../services/server/near-ai-cloud.ts';

const input = { apiKey: 'test-only-api-key', model: 'zai-org/GLM-5.1-FP8', instructions: 'Summarize only.', message: 'What is due?', maxOutputTokens: 500 };
const result = { status: 'completed', id: 'resp_1', model: input.model,
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'One bill is due.' }] }],
  usage: { input_tokens: 12, output_tokens: 6 } };

test('NEAR AI Cloud adapter uses fixed stateless endpoint and records usage', async () => {
  const completion = await requestNearAiCompletion(input, async (url, options) => {
    assert.equal(url, 'https://cloud-api.near.ai/v1/responses');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${input.apiKey}`);
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.max_output_tokens, 500);
    return Response.json(result, { headers: { 'x-request-id': 'req-1' } });
  });
  assert.deepEqual(completion, { id: 'resp_1', model: input.model, text: 'One bill is due.', inputTokens: 12, outputTokens: 6, requestId: 'req-1' });
});

test('NEAR AI Cloud adapter rejects unbounded requests and incomplete results', async () => {
  await assert.rejects(requestNearAiCompletion({ ...input, maxOutputTokens: 10000 }, async () => { throw Error('must not call'); }), /output limit/);
  await assert.rejects(requestNearAiCompletion({ ...input, model: 'https://evil.example' }, async () => { throw Error('must not call'); }), /model ID/);
  await assert.rejects(requestNearAiCompletion(input, async () => new Response('secret-provider-message', { status: 429 })), /HTTP 429/);
  await assert.rejects(requestNearAiCompletion(input, async () => Response.json({ ...result, usage: {} })), /invalid input usage/);
  await assert.rejects(requestNearAiCompletion(input, async () => Response.json({ ...result, status: 'incomplete' })), /incomplete/);
});
