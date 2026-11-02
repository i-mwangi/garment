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
