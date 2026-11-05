import test from 'node:test';
import assert from 'node:assert/strict';
import { OneClickClient } from '../services/intents/oneclick-client.ts';
import { mainnetUsdcAsset } from '../services/intents/oneclick.ts';

const origin = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const tokens = [
  { assetId: origin, blockchain: 'base', symbol: 'USDC', decimals: 6, contractAddress: null },
  { assetId: mainnetUsdcAsset(), blockchain: 'near', symbol: 'USDC', decimals: 6 },
];
const json = value => new Response(JSON.stringify(value), { status: 200 });

test('Base USDC quote keeps exact terms, verifies before exposing deposit instructions and polls with memo', async () => {
  const calls = [];
  const deadline = new Date(Date.now() + 180000).toISOString();
  const quoteDeadline = new Date(Date.now() + 120000).toISOString();
  const input = { id: 'sale-1', companyId: 'company-1', amountUnits: '1000000', minimumOutputUnits: '990000',
    recipient: 'merchant.near', refundTo: '0x1111111111111111111111111111111111111111', deadline, slippageBps: 50 };
  let signed;
  const transport = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/tokens')) return json(tokens);
    if (url.endsWith('/quote')) {
      const quoteRequest = JSON.parse(options.body);
      signed = { correlationId: 'corr-1', quoteRequest, quote: { amountOut: '995000', minAmountOut: '990000',
        depositAddress: '0x2222222222222222222222222222222222222222', depositMemo: 'memo-1', deadline: quoteDeadline } };
      return json(signed);
    }
    if (url.includes('/status?')) return json({ correlationId: 'corr-1', quoteResponse: signed, status: 'SUCCESS',
      swapDetails: { amountOut: '995000', destinationChainTxHashes: [{ hash: 'NEAR-hash' }] } });
    throw new Error('Unexpected request');
  };
  const client = new OneClickClient('a'.repeat(20), transport);
  await assert.rejects(() => client.quote(input), /signature/);
  const order = await client.quote(input, () => true);
  assert.equal(order.originAsset, origin);
  assert.equal(order.depositMemo, 'memo-1');
  assert.equal(calls[1].options.headers['X-API-Key'], 'a'.repeat(20));
  assert.equal(calls[1].url, 'https://1click.chaindefuser.com/v0/quote');
  const status = await client.status(order, () => true);
  assert.equal(status.progress, 'provider_success_unverified');
  assert.match(calls.at(-1).url, /depositMemo=memo-1/);
  await assert.rejects(() => client.submitDepositHash(order, 'not-a-hash'), /Base transaction hash/);
});

test('token discovery rejects lookalikes and unsupported destination', async () => {
  const client = new OneClickClient('a'.repeat(20), async () => json([
    { assetId: 'nep141:base-fake.omft.near', blockchain: 'base', symbol: 'USDC', decimals: 6 },
    { assetId: mainnetUsdcAsset(), blockchain: 'near', symbol: 'USDC', decimals: 6 },
  ]));
  await assert.rejects(() => client.supportedBaseUsdcAsset(), /Official Base USDC/);
  const other = new OneClickClient('a'.repeat(20), async () => json(tokens.slice(0, 1)));
  await assert.rejects(() => other.supportedBaseUsdcAsset(), /Native NEAR USDC/);
});
