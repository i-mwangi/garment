import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessPolicyStore } from '../services/server/business-policy.ts';

const enabled = {
  stopped: false,
  allowAutonomousDrafts: true,
  allowAutonomousPayments: true,
  maxSinglePaymentUsdc: '3',
  maxDailyTreasuryUsdc: '5',
  maxDailyInferenceUsd: '1',
};

test('policy starts stopped and rejects spending until an owner changes it', () => {
  const store = new BusinessPolicyStore(':memory:');
  try {
    assert.equal(store.get('company-a').stopped, true);
    assert.equal(store.get('company-a').maxDailyTreasuryUsdc, '0');
    assert.throws(() => store.reserve('company-a', 'payment-1', 'treasury', '1', 1), /stopped or changed/);
    assert.throws(() => store.update('company-a', { ...enabled, maxSinglePaymentUsdc: '6' }, 0, 'owner'), /exceeds/);
    assert.throws(() => store.update('company-a', { ...enabled, extra: true }, 0, 'owner'), /Complete/);
  } finally { store.close(); }
});

test('daily reservations are exact, isolated, idempotent and cannot exceed policy', () => {
  const directory = mkdtempSync(join(tmpdir(), 'settlbox-policy-'));
  const path = join(directory, 'business.sqlite');
  const first = new BusinessPolicyStore(path);
  const second = new BusinessPolicyStore(path);
  try {
    assert.equal(first.update('company-a', enabled, 0, 'owner').revision, 1);
    second.update('company-b', enabled, 0, 'owner');
    const at = new Date('2026-11-03T15:00:00Z');
    assert.equal(first.reserve('company-a', 'payment-1', 'treasury', '2.000001', 1, at).existing, false);
    assert.equal(second.reserve('company-a', 'payment-1', 'treasury', '2.000001', 1, at).existing, true);
    assert.throws(() => first.reserve('company-a', 'payment-1', 'treasury', '2', 1, at), /different terms/);
    assert.throws(() => second.reserve('company-a', 'payment-2', 'treasury', '3', 1, at), /exceeded/);
    assert.equal(second.reserve('company-a', 'payment-2', 'treasury', '2.999999', 1, at).amountUnits, '2999999');
    assert.throws(() => first.reserve('company-a', 'payment-3', 'treasury', '0.000001', 1, at), /exceeded/);
    assert.equal(second.reserve('company-b', 'payment-1', 'treasury', '3', 1, at).existing, false);
    assert.equal(first.reserve('company-a', 'ai-1', 'inference', '0.5', 1, at).existing, false);
    assert.throws(() => second.reserve('company-a', 'ai-2', 'inference', '0.500001', 1, at), /exceeded/);
    assert.equal(first.reserve('company-a', 'payment-next-day', 'treasury', '3', 1, new Date('2026-11-04T00:00:00Z')).existing, false);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('revision and stop switch invalidate new reservations without erasing existing evidence', () => {
  const store = new BusinessPolicyStore(':memory:');
  try {
    store.update('company-a', enabled, 0, 'owner');
    store.reserve('company-a', 'payment-1', 'treasury', '1', 1);
    assert.throws(() => store.update('company-a', enabled, 0, 'owner'), /changed/);
    const stopped = store.update('company-a', { ...enabled, stopped: true }, 1, 'owner');
    assert.equal(stopped.revision, 2);
    assert.throws(() => store.reserve('company-a', 'payment-2', 'treasury', '1', 1), /stopped or changed/);
    assert.throws(() => store.reserve('company-a', 'payment-2', 'treasury', '1', 2), /stopped or changed/);
    assert.equal(store.events('company-a').length, 2);
  } finally { store.close(); }
});

test('inference charges stay within a reserved ceiling and deduplicate provider responses', () => {
  const store = new BusinessPolicyStore(':memory:');
  try {
    store.update('company-a', enabled, 0, 'owner');
    store.reserve('company-a', 'call-1', 'inference', '0.25', 1);
    assert.throws(() => store.recordInferenceCharge('company-a', 'unknown', 'resp-1', '0.1'), /reservation/);
    assert.throws(() => store.recordInferenceCharge('company-a', 'call-1', 'resp-1', '0.250001'), /reservation/);
    const saved = store.recordInferenceCharge('company-a', 'call-1', 'resp-1', '0.1');
    assert.equal(saved.actualUnits, '100000');
    assert.equal(store.recordInferenceCharge('company-a', 'call-1', 'resp-1', '0.1').existing, true);
    assert.throws(() => store.recordInferenceCharge('company-a', 'call-1', 'resp-2', '0.1'), /different terms/);
    store.reserve('company-a', 'call-2', 'inference', '0.25', 1);
    assert.throws(() => store.recordInferenceCharge('company-a', 'call-2', 'resp-1', '0.1'), /UNIQUE/);
    assert.equal(store.inferenceCharges('company-a').length, 1);
    assert.equal(store.inferenceCharges('company-b').length, 0);
  } finally { store.close(); }
});
