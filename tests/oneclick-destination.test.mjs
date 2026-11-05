import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOneClickDestination } from '../services/intents/destination-settlement.ts';

const hash = '11111111111111111111111111111111';
const tokenId = 'usdc.near';
const order = { recipient: 'merchant.near', destinationAsset: `nep141:${tokenId}`, minimumOutputUnits: '990' };
const provider = { progress: 'provider_success_unverified', amountOutUnits: '995', destinationHashes: [hash] };
const outcome = {
  final_execution_status: 'FINAL', status: { SuccessValue: '' },
  transaction: { hash, signer_id: 'solver.near', receiver_id: tokenId, actions: [] },
  transaction_outcome: { id: hash, outcome: { executor_id: tokenId, status: { SuccessValue: '' }, logs: [] } },
  receipts_outcome: [{ id: hash, outcome: { executor_id: tokenId, status: { SuccessValue: '' }, logs: [
    `EVENT_JSON:${JSON.stringify({ standard: 'nep141', event: 'ft_transfer', data: [{ old_owner_id: 'solver.near', new_owner_id: 'merchant.near', amount: '995' }] })}`,
  ] } }],
};

test('signed provider status and final NEAR transfer must agree before destination is verified', () => {
  assert.deepEqual(verifyOneClickDestination(order, provider, outcome, tokenId), {
    transactionHash: hash, amountUnits: '995', recipient: 'merchant.near',
  });
  assert.throws(() => verifyOneClickDestination(order, { ...provider, destinationHashes: [] }, outcome, tokenId), /not bound/);
  assert.throws(() => verifyOneClickDestination(order, provider, { ...outcome, final_execution_status: 'EXECUTED_OPTIMISTIC' }, tokenId), /not finally/);
  assert.throws(() => verifyOneClickDestination(order, provider, { ...outcome, receipts_outcome: [] }, tokenId), /does not prove/);
  assert.throws(() => verifyOneClickDestination({ ...order, recipient: 'other.near' }, provider, outcome, tokenId), /does not prove/);
  assert.throws(() => verifyOneClickDestination(order, { ...provider, amountOutUnits: '996' }, outcome, tokenId), /does not prove/);
});
