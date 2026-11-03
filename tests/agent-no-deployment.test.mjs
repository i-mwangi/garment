import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareAgentPlan } from '../services/server/prepare-agent-plan.ts';
import { answerFinanceMessage } from '../services/server/agent-chat.ts';

test('finance chat stays analysis-only before a vault deployment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'settlbox-no-vault-'));
  const names = ['SETTLBOX_NEAR_TREASURY_CONFIG', 'SETTLBOX_NEAR_CONTRACT_CONFIG', 'SETTLBOX_BUSINESS_DATABASE', 'SETTLBOX_AI_PROVIDER'];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    const treasury = join(dir, 'treasury.json');
    writeFileSync(treasury, JSON.stringify({ companyId: 'test-company', accountId: 'a'.repeat(64), networkId: 'testnet' }));
    process.env.SETTLBOX_NEAR_TREASURY_CONFIG = treasury;
    process.env.SETTLBOX_NEAR_CONTRACT_CONFIG = join(dir, 'not-deployed.json');
    process.env.SETTLBOX_BUSINESS_DATABASE = join(dir, 'business.sqlite');
    process.env.SETTLBOX_AI_PROVIDER = '';
    const run = await prepareAgentPlan({ requestId: crypto.randomUUID(), throughDate: '2026-11-30', reserveUsdc: '0' }, 'owner', false);
    assert.match(run.planningUnavailableReason, /not deployed/);
    assert.deepEqual(run.actions, []);
    const reply = await answerFinanceMessage('What needs my attention?', [], run);
    assert.match(reply.answer, /not deployed/);
    assert.equal(reply.operation, undefined);
    assert.deepEqual(reply.recordIds, []);
    assert.doesNotMatch(reply.answer, /Your treasury has 0 USDC/);
  } finally {
    for (const name of names) before[name] === undefined ? delete process.env[name] : process.env[name] = before[name];
    rmSync(dir, { recursive: true, force: true });
  }
});

test('undeployed vault permits reviewed invoice drafts but rejects payment operations', async () => {
  const keys = ['SETTLBOX_AI_PROVIDER', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { SETTLBOX_AI_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com', AZURE_OPENAI_API_KEY: 'test-key', AZURE_OPENAI_DEPLOYMENT: 'finance' });
  const run = { id: crypto.randomUUID(), companyId: 'company', requestedBy: 'owner', request: { throughDate: '2026-11-30', reserveUsdc: '0' }, planningUnavailableReason: 'Vault is not deployed', actions: [] };
  const draft = { kind: 'invoice', title: 'Design work', counterparty: 'Customer', recipient: 'a'.repeat(64), amount: '2', dueDate: '2026-11-30', description: 'Agreed work' };
  const reply = operation => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Draft ready for review.', recordIds: [], operation }) }] }] });
  try {
    const result = await answerFinanceMessage('Create an invoice draft for Design work', [], run, async (_url, options) => {
      const input = JSON.parse(JSON.parse(options.body).input);
      assert.ok(input.supportedOperations.some(item => item.name === 'business.create'));
      assert.ok(!input.supportedOperations.some(item => item.name === 'payment.review'));
      return reply({ tool: 'business.create', arguments: JSON.stringify(draft) });
    });
    assert.equal(result.operation.tool, 'business.create');
    assert.deepEqual(result.recordIds, []);
    await assert.rejects(answerFinanceMessage('Pay this invoice', [], run, async () => reply({ tool: 'payment.review', arguments: JSON.stringify({ recordId: 'bill-1' }) })), /unavailable operation/);
  } finally { for (const key of keys) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key]; }
});
