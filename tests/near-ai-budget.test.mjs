import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessPolicyStore } from '../services/server/business-policy.ts';
import { requestBudgetedNearAiCompletion } from '../services/server/near-ai-budget.ts';

const policy = { stopped: false, allowAutonomousDrafts: true, allowAutonomousPayments: false,
  maxSinglePaymentUsdc: '0', maxDailyTreasuryUsdc: '0', maxDailyInferenceUsd: '0.02' };
const input = { companyId: 'company-a', reservationId: 'inference-1', apiKey: 'test-only-api-key',
  model: 'zai-org/GLM-5.1-FP8', instructions: 'Be brief.', message: 'Summarize bills.', maxOutputTokens: 500 };
const catalog = { data: [{ id: input.model, context_length: 100000, max_output_length: 5000,
  pricing: { prompt: '0.000001', completion: '0.000005' } }] };
const completed = { id: 'response-1', model: input.model, status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'One bill is due.' }] }],
  usage: { input_tokens: 20, output_tokens: 10 } };

test('NEAR AI reserves a priced ceiling before inference and records actual usage once', async () => {
  const store = new BusinessPolicyStore(':memory:');
  const calls = [];
  const transport = async (url) => { calls.push(url); return Response.json(url.endsWith('/models') ? catalog : completed); };
  try {
    store.update(input.companyId, policy, 0, 'owner');
    const result = await requestBudgetedNearAiCompletion(input, store, transport);
    assert.equal(result.text, 'One bill is due.');
    assert.deepEqual(calls, ['https://cloud-api.near.ai/v1/models', 'https://cloud-api.near.ai/v1/responses']);
    assert.equal(store.inferenceCharges(input.companyId)[0].actual_units, '70');
    await assert.rejects(() => requestBudgetedNearAiCompletion(input, store, transport), /already reserved/);
    assert.equal(calls.filter(url => url.endsWith('/responses')).length, 1);
  } finally { store.close(); }
});

test('a stopped or insufficient budget prevents provider inference', async () => {
  const store = new BusinessPolicyStore(':memory:');
  const calls = [];
  const transport = async url => { calls.push(url); return Response.json(catalog); };
  try {
    await assert.rejects(() => requestBudgetedNearAiCompletion(input, store, transport), /stopped or not configured/);
    assert.deepEqual(calls, []);
    store.update(input.companyId, { ...policy, maxDailyInferenceUsd: '0.001' }, 0, 'owner');
    await assert.rejects(() => requestBudgetedNearAiCompletion(input, store, transport), /budget would be exceeded/);
    assert.equal(calls.filter(url => url.endsWith('/responses')).length, 0);
  } finally { store.close(); }
});
