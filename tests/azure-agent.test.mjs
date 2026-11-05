import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewAgentPlan } from '../services/server/azure-agent.ts';
import { BusinessPolicyStore } from '../services/server/business-policy.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Azure review preserves policy decisions, minimizes input and rejects failed responses', async () => {
  const names=['SETTLBOX_AI_PROVIDER','AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_DEPLOYMENT','AZURE_OPENAI_API_KEY'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{SETTLBOX_AI_PROVIDER:'azure',AZURE_OPENAI_ENDPOINT:'https://test.openai.azure.com',AZURE_OPENAI_DEPLOYMENT:'finance',AZURE_OPENAI_API_KEY:'test-key'});
  const plan={mode:'proposal_only',engine:'deterministic',balanceUsdc:'1',reserveUsdc:'0.5',obligationsUsdc:'0.1',unallocatedUsdc:'0.4',actions:[{recordId:'private-id',title:'Private employee',kind:'bill',amountUsdc:'0.1',dueDate:'2026-10-11',disposition:'blocked',reasons:['Payment limit exceeded'],tool:'review_payment'}]};
  try {
    const result=await reviewAgentPlan(plan,async (url,options)=>{
      assert.equal(url.pathname,'/openai/v1/responses');
      const payload=JSON.parse(options.body);
      assert.equal(payload.store,false);
      assert.equal(payload.tools,undefined);
      assert.ok(!payload.input.includes('private-id'));
      assert.ok(!payload.input.includes('Private employee'));
      return Response.json({status:'completed',id:'resp_test',model:'finance',output:[{type:'message',content:[{type:'output_text',text:'Review blocked obligations.'}]}]});
    });
    assert.deepEqual(result.actions,plan.actions);
    assert.equal(result.aiReview.responseId,'resp_test');
    assert.equal(plan.aiReview,undefined);
    await assert.rejects(reviewAgentPlan(plan,async()=>new Response('secret-provider-error',{status:429})),/HTTP 429/);
    await assert.rejects(reviewAgentPlan(plan,async()=>Response.json({status:'incomplete'})),/incomplete review/);
    process.env.AZURE_OPENAI_ENDPOINT='https://attacker.example';
    await assert.rejects(reviewAgentPlan(plan,async()=>{throw Error('must not send credential');}),/Azure HTTPS/);
  } finally {
    for(const name of names) if(previous[name]===undefined) delete process.env[name]; else process.env[name]=previous[name];
  }
});

test('owner selected NEAR AI review keeps the deterministic plan and charges the company budget', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-review-'));
  const names = ['SETTLBOX_AI_PROVIDER', 'SETTLBOX_BUSINESS_DATABASE', 'NEAR_AI_MODEL', 'NEAR_AI_API_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const model = 'zai-org/GLM-5.1-FP8';
  Object.assign(process.env, { SETTLBOX_AI_PROVIDER: 'policy', SETTLBOX_BUSINESS_DATABASE: join(directory, 'policy.sqlite'), NEAR_AI_MODEL: model, NEAR_AI_API_KEY: 'test-only-api-key' });
  const store = new BusinessPolicyStore(process.env.SETTLBOX_BUSINESS_DATABASE);
  const plan = { mode: 'proposal_only', engine: 'deterministic', balanceUsdc: '1', reserveUsdc: '0', obligationsUsdc: '0', unallocatedUsdc: '1', actions: [{ recordId: 'private-id', title: 'Private supplier', kind: 'bill', amountUsdc: '0.1', dueDate: '2026-10-11', disposition: 'blocked', reasons: ['Limit exceeded'], tool: 'review_payment' }] };
  try {
    store.update('company-a', { stopped: false, allowAutonomousDrafts: true, allowAutonomousPayments: false, maxSinglePaymentUsdc: '0', maxDailyTreasuryUsdc: '0', maxDailyInferenceUsd: '0.02', aiProvider: 'near_ai' }, 0, 'owner');
    const transport = async (url, options) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: model, context_length: 100000, max_output_length: 5000, pricing: { prompt: '0.000001', completion: '0.000005' } }] });
      const body = JSON.parse(options.body);
      assert.ok(!body.input.includes('private-id'));
      assert.ok(!body.input.includes('Private supplier'));
      return Response.json({ id: 'response-1', model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Investigate the blocked bill.' }] }], usage: { input_tokens: 20, output_tokens: 10 } });
    };
    const result = await reviewAgentPlan(plan, transport, { companyId: 'company-a', reservationId: 'review-1' });
    assert.deepEqual(result.actions, plan.actions);
    assert.equal(result.aiReview.provider, 'near_ai');
    assert.equal(result.aiReview.summary, 'Investigate the blocked bill.');
    assert.equal(store.inferenceCharges('company-a').length, 1);
  } finally {
    store.close();
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    rmSync(directory, { recursive: true, force: true });
  }
});
