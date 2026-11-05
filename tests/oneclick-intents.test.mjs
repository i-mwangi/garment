import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptOneClickQuote, mainnetUsdcAsset, readOneClickStatus } from '../services/intents/oneclick.ts';

const now = new Date('2026-11-03T12:00:00Z');
const request = {
  dry: false, swapType: 'EXACT_INPUT', depositType: 'ORIGIN_CHAIN',
  recipientType: 'DESTINATION_CHAIN', refundType: 'ORIGIN_CHAIN',
  originAsset: 'nep141:source.near', destinationAsset: mainnetUsdcAsset(),
  amount: '1000000', recipient: 'merchant.near', refundTo: 'refund.near',
  deadline: '2026-11-03T12:10:00Z',
};
const quote = {
  correlationId: 'quote-1', quoteRequest: request,
  quote: { amountOut: '999000', minAmountOut: '990000',
    depositAddress: 'deposit.near', depositMemo: 'memo-1', deadline: '2026-11-03T12:05:00Z' },
};
const expected = { id: 'sale-1', companyId: 'company-1', originAsset: request.originAsset,
  inputUnits: request.amount, recipient: request.recipient, refundTo: request.refundTo,
  minimumOutputUnits: '990000', now };
const validSignature = () => true; // Tests the boundary; production must supply SDK verification.

test('accepts only a signed, exact-term, unexpired quote that meets the USDC floor', () => {
  const order = acceptOneClickQuote(quote, expected, validSignature);
  assert.equal(order.depositMemo, 'memo-1');
  assert.equal(order.destinationAsset, mainnetUsdcAsset());
  assert.throws(() => acceptOneClickQuote(quote, expected), /signature/);
  assert.throws(() => acceptOneClickQuote(quote, expected, () => false), /signature/);
  assert.throws(() => acceptOneClickQuote(quote, { ...expected, recipient: 'attacker.near' }, validSignature), /changed/);
  assert.throws(() => acceptOneClickQuote(quote, { ...expected, minimumOutputUnits: '990001' }, validSignature), /required USDC/);
  assert.throws(() => acceptOneClickQuote(quote, { ...expected, now: new Date('2026-11-03T12:06:00Z') }, validSignature), /expired/);
  assert.throws(() => acceptOneClickQuote({ ...quote, quote: { ...quote.quote, depositAddress: undefined } }, expected, validSignature), /deposit address/);
});

test('provider success remains unverified and needs a destination hash and sufficient output', () => {
  const order = acceptOneClickQuote(quote, expected, validSignature);
  const status = { correlationId: order.correlationId, quoteResponse: quote, status: 'SUCCESS',
    swapDetails: { amountOut: '990000', destinationChainTxHashes: [{ hash: 'tx-1' }] } };
  assert.deepEqual(readOneClickStatus(status, order, validSignature), {
    progress: 'provider_success_unverified', amountOutUnits: '990000', destinationHashes: ['tx-1'],
  });
  assert.throws(() => readOneClickStatus({ ...status, swapDetails: { ...status.swapDetails, amountOut: '989999' } }, order, validSignature), /proof/);
  assert.throws(() => readOneClickStatus({ ...status, swapDetails: { ...status.swapDetails, destinationChainTxHashes: [] } }, order, validSignature), /proof/);
  assert.throws(() => readOneClickStatus({ ...status, correlationId: 'other' }, order, validSignature), /another quote/);
  assert.throws(() => readOneClickStatus({ ...status, status: 'UNKNOWN' }, order, validSignature), /Unknown/);
});

test('tracks pending, refund and failure without booking a sale', () => {
  const order = acceptOneClickQuote(quote, expected, validSignature);
  for (const [status, progress] of [['PENDING_DEPOSIT', 'awaiting_deposit'], ['REFUNDED', 'refunded'], ['FAILED', 'failed']]) {
    assert.equal(readOneClickStatus({ correlationId: order.correlationId, quoteResponse: quote, status }, order, validSignature).progress, progress);
  }
  assert.throws(() => readOneClickStatus({ correlationId: order.correlationId,
    quoteResponse: { ...quote, quoteRequest: { ...request, recipient: 'other.near' } }, status: 'SUCCESS' }, order, validSignature), /changed/);
});

test('provider refund details remain candidates until a Base receipt proves the transfer', () => {
  const order = acceptOneClickQuote(quote, expected, validSignature);
  const hash = `0x${'1'.repeat(64)}`;
  const status = readOneClickStatus({ correlationId: order.correlationId, quoteResponse: quote, status: 'REFUNDED',
    swapDetails: { refundedAmount: '1000', originChainTxHashes: [{ hash }] } }, order, validSignature);
  assert.deepEqual(status.refund, { amountUnits: '1000', hashes: [hash] });
  assert.equal(status.progress, 'refunded');
});

test('signed fee fields remain bound to the saved quote', () => {
  const priced = { ...quote, quote: { ...quote.quote, withdrawFee: '100', refundFee: '50' } };
  const order = acceptOneClickQuote(priced, expected, validSignature);
  assert.equal(order.withdrawFeeUnits, '100');
  assert.equal(order.refundFeeUnits, '50');
  assert.throws(() => readOneClickStatus({ correlationId: order.correlationId, quoteResponse: {
    ...priced, quote: { ...priced.quote, withdrawFee: '101' } }, status: 'PENDING_DEPOSIT' }, order, validSignature), /changed/);
});

test('exact-output checkout fixes the invoice amount and preserves quoted Base input', () => {
  const checkoutRequest = { ...request, swapType: 'EXACT_OUTPUT', amount: '1000000' };
  const checkout = { ...quote, quoteRequest: checkoutRequest,
    quote: { ...quote.quote, amountIn: '1010000', minAmountIn: '1000000', amountOut: '1000000', minAmountOut: '1000000' } };
  const order = acceptOneClickQuote(checkout, { ...expected, inputUnits: '1000000',
    minimumOutputUnits: '1000000', swapType: 'EXACT_OUTPUT' }, validSignature);
  assert.equal(order.inputUnits, '1010000');
  assert.equal(order.requestAmountUnits, '1000000');
  assert.equal(order.swapType, 'EXACT_OUTPUT');
  const compact = { ...checkout, quote: { amountIn: '1010000', minAmountIn: '1000000', depositAddress: quote.quote.depositAddress, deadline: quote.quote.deadline } };
  assert.equal(acceptOneClickQuote(compact, { ...expected, inputUnits: '1000000', minimumOutputUnits: '1000000', swapType: 'EXACT_OUTPUT' }, validSignature).inputUnits, '1010000');
  assert.equal(readOneClickStatus({ correlationId: order.correlationId, quoteResponse: checkout, status: 'PENDING_DEPOSIT' }, order, validSignature).progress, 'awaiting_deposit');
  assert.throws(() => acceptOneClickQuote({ ...checkout, quote: { ...checkout.quote, amountOut: '999999', minAmountOut: '999999' } },
    { ...expected, minimumOutputUnits: '999999', swapType: 'EXACT_OUTPUT' }, validSignature), /invoice amount/);
});
