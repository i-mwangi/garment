import test from 'node:test';
import assert from 'node:assert/strict';
import { readOneClickDestination } from '../services/intents/destination-reader.ts';

test('the index supplies a signer hint but final RPC decides destination identity', async () => {
  const previous = process.env.NEXT_PUBLIC_NEAR_NETWORK;
  process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
  const hash = '11111111111111111111111111111111';
  const transport = async (url, options) => {
    assert.equal(url, 'https://tx.main.fastnear.com/v0/transactions');
    assert.equal(options.headers.Authorization, `Bearer ${'a'.repeat(20)}`);
    assert.deepEqual(JSON.parse(options.body), { tx_hashes: [hash] });
    return new Response(JSON.stringify({ transactions: [{ transaction: { hash, signer_id: 'solver.near' } }] }), { status: 200 });
  };
  const outcome = { transaction: { hash, signer_id: 'solver.near' } };
  const reader = { getReceipt: async (seenHash, signer) => {
    assert.equal(seenHash, hash); assert.equal(signer, 'solver.near'); return outcome;
  } };
  try {
    assert.equal(await readOneClickDestination(hash, 'a'.repeat(20), transport, reader), outcome);
    await assert.rejects(() => readOneClickDestination(hash, 'a'.repeat(20), transport,
      { getReceipt: async () => ({ transaction: { hash, signer_id: 'other.near' } }) }), /disagree/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_NEAR_NETWORK; else process.env.NEXT_PUBLIC_NEAR_NETWORK = previous;
  }
});
