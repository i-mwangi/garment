import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import { createNearReader, NearRpcError } from '../services/near/rpc.ts';
import { readNearTreasuryIdentity } from '../services/server/near-treasury-config.ts';
import { formatAmount, NEAR_DECIMALS } from '../services/near/amount.ts';
import { implicitAccountId } from '../services/near/account-id.ts';

const workspace = readNearTreasuryIdentity();
if (workspace.networkId !== 'testnet') throw new Error('Funding check is restricted to testnet');
const directory = resolve(dirname(process.env.SETTLBOX_NEAR_TREASURY_CONFIG || '.data/near-treasury.json'), 'embedded-deployment');
const reader = createNearReader();
await reader.verifyNetwork();
const rows = [{ kind: 'company', accountId: workspace.accountId }];
for (const kind of ['treasury', 'gifts', 'executor']) {
  const saved = JSON.parse(readFileSync(resolve(directory, `${kind}.json`), 'utf8'));
  const publicKey = KeyPair.fromString(saved.private_key).getPublicKey();
  if (saved.public_key !== publicKey.toString() || saved.account_id !== implicitAccountId(publicKey.data)) throw new Error(`${kind} deployment credential identity mismatch`);
  rows.push({ kind, accountId: saved.account_id, publicKey: saved.public_key });
}
const result = [];
for (const row of rows) {
  let account;
  try {
    account = await reader.rpc('query', { request_type: 'view_account', account_id: row.accountId, finality: 'final' });
  } catch (error) {
    if (!(error instanceof NearRpcError) || !/(UNKNOWN_ACCOUNT|does not exist)/i.test(JSON.stringify(error.detail))) throw error;
    result.push({ kind: row.kind, accountId: row.accountId, exists: false });
    continue;
  }
  const balance = BigInt(account.amount);
  let keyAuthorized;
  if (row.publicKey) {
    try {
      const key = await reader.rpc('query', { request_type: 'view_access_key', account_id: row.accountId, public_key: row.publicKey, finality: 'final' });
      keyAuthorized = key.permission === 'FullAccess';
    } catch { keyAuthorized = false; }
  }
  result.push({ kind: row.kind, accountId: row.accountId, exists: true, balanceNear: formatAmount(balance, NEAR_DECIMALS), ...(row.publicKey ? { keyAuthorized } : {}) });
}
console.log(JSON.stringify({ networkId: 'testnet', finalState: result }, null, 2));
