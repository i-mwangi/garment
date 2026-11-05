import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBaseUsdcRefund } from '../services/intents/base-refund.ts';

test('Base refund requires a successful canonical USDC transfer to the saved refund address', async () => {
  const hash = `0x${'1'.repeat(64)}`, refundTo = `0x${'a'.repeat(40)}`;
  const order = { refundTo };
  const refund = { amountUnits: '1000', hashes: [hash] };
  const receipt = { transactionHash: hash, status: '0x1', logs: [{
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', `0x${'0'.repeat(24)}${'b'.repeat(40)}`, `0x${'0'.repeat(24)}${'a'.repeat(40)}`],
    data: `0x${(1000n).toString(16).padStart(64, '0')}`,
  }] };
  const transport = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).params, [hash]);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: receipt }), { status: 200 });
  };
  assert.deepEqual(await verifyBaseUsdcRefund(order, refund, 'https://mainnet.base.org', transport), { transactionHash: hash, amountUnits: '1000' });
  await assert.rejects(() => verifyBaseUsdcRefund(order, refund, 'https://evil.example', transport), /not approved/);
  await assert.rejects(() => verifyBaseUsdcRefund(order, refund, 'https://mainnet.base.org', async () =>
    new Response(JSON.stringify({ result: { ...receipt, status: '0x0' } }), { status: 200 })), /not been verified/);
  await assert.rejects(() => verifyBaseUsdcRefund({ refundTo: `0x${'c'.repeat(40)}` }, refund, 'https://mainnet.base.org', transport), /not been verified/);
});
