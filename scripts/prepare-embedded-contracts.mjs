import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { KeyPair } from 'near-api-js';
import { encodeBase58 } from '../services/near/base58.ts';
import { implicitAccountId } from '../services/near/account-id.ts';
import { getNearNetwork } from '../services/near/network.ts';
import { readNearTreasuryIdentity } from '../services/server/near-treasury-config.ts';
import { validateNearDeployment } from '../services/server/near-contract-config.ts';

const network = getNearNetwork();
if (network.networkId !== 'testnet') throw new Error('Embedded deployment preparation is restricted to testnet');
const workspace = readNearTreasuryIdentity();
const directory = resolve(dirname(process.env.SETTLBOX_NEAR_TREASURY_CONFIG || '.data/near-treasury.json'), 'embedded-deployment');
const manifest = JSON.parse(readFileSync(resolve('docs/NEAR-CONTRACT-ARTIFACTS.json'), 'utf8'));

function deploymentAccount(kind) {
  const saved = JSON.parse(readFileSync(resolve(directory, `${kind}.json`), 'utf8'));
  const publicKey = KeyPair.fromString(saved.private_key).getPublicKey();
  const accountId = implicitAccountId(publicKey.data);
  if (saved.account_id !== accountId || saved.public_key !== publicKey.toString()) throw new Error(`${kind} deployment credential identity mismatch`);
  return accountId;
}
function approvedHash(name, file) {
  const artifact = manifest.artifacts.find(item => item.name === name && item.file === file);
  if (!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`Missing approved ${name} artifact`);
  const code = readFileSync(resolve('contracts/near/approved-wasm', file));
  if (createHash('sha256').update(code).digest('hex') !== artifact.sha256 || code.length !== artifact.bytes) throw new Error(`Approved ${name} artifact bytes differ from the manifest`);
  return encodeBase58(Buffer.from(artifact.sha256, 'hex'));
}

const config = {
  companyId: workspace.companyId,
  networkId: 'testnet',
  tokenId: network.usdcContractId,
  treasury: {
    accountId: deploymentAccount('treasury'),
    codeHash: approvedHash('treasury-vault', 'settlbox_near_treasury_vault.wasm'),
    ownerId: workspace.accountId,
    executorId: deploymentAccount('executor'),
  },
  gifts: {
    accountId: deploymentAccount('gifts'),
    codeHash: approvedHash('gift-escrow', 'settlbox_near_gift_escrow.wasm'),
  },
};
validateNearDeployment(config, workspace, network.usdcContractId, manifest.artifacts);
const path = resolve(dirname(process.env.SETTLBOX_NEAR_CONTRACT_CONFIG || '.data/near-contracts.json'), 'near-contracts.draft.json');
const encoded = JSON.stringify(config, null, 2) + '\n';
if (existsSync(path)) {
  if (readFileSync(path, 'utf8') !== encoded) throw new Error('Existing deployment draft differs; review before replacing it');
} else writeFileSync(path, encoded, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ prepared: true, active: false, path, config }, null, 2));
