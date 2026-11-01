import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeBase58 } from "../near/base58.ts";
import { account, record } from "../near/contract-snapshot.ts";
import { getNearNetwork } from "../near/network.ts";
import { readNearTreasuryIdentity } from "./near-treasury-config.ts";
import type { NearContractBinding, NearVaultBinding } from "../../types/near-contracts.ts";

type Artifact = {name:string;sha256:string};
type Workspace = {companyId:string;accountId:string;networkId:"testnet"|"mainnet"};

/** Validate local deployment configuration before any on-chain observation or signing. */
export function validateNearDeployment(value:unknown, workspace:Workspace, tokenId:string, artifacts:Artifact[]) {
  const config=record(value,"NEAR deployment configuration");
  if(config.companyId!==workspace.companyId || config.networkId!==workspace.networkId || config.tokenId!==tokenId) throw new Error("Native deployment workspace, network or USDC mismatch");
  account(tokenId);account(workspace.accountId);
  function binding(field:string,artifactName:string):NearContractBinding {
    const deployment=record(config[field],`${field} deployment`);
    const artifact=artifacts.find(item=>item.name===artifactName);
    if(!artifact || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("Missing approved native contract artifact");
    const codeHash=encodeBase58(Buffer.from(artifact.sha256,"hex"));
    if(deployment.codeHash!==codeHash) throw new Error("Deployment code hash differs from the approved native artifact");
    const accountId=account(deployment.accountId);
    if(accountId===tokenId || accountId===workspace.accountId) throw new Error("Contract account must be distinct from token and workspace owner");
    return {networkId:workspace.networkId,expectedRpcChainId:workspace.networkId,accountId,codeHash,tokenId};
  }
  const vault=record(config.treasury,"treasury deployment");
  const ownerId=account(vault.ownerId);
  const executorId=account(vault.executorId);
  const treasury:NearVaultBinding={...binding("treasury","treasury-vault"),ownerId,executorId};
  const gifts=binding("gifts","gift-escrow");
  if(new Set([treasury.accountId,gifts.accountId,executorId,workspace.accountId,tokenId]).size!==5) throw new Error("Native contract and authority accounts must be distinct");
  if([treasury.accountId,gifts.accountId,executorId,tokenId].includes(ownerId))throw new Error("Native vault owner must be separate from contract and executor accounts");
  return {companyId:workspace.companyId,treasury,gifts};
}

export function readNearDeployment() {
  const workspace=readNearTreasuryIdentity();
  const config=JSON.parse(readFileSync(resolve(process.env.SETTLBOX_NEAR_CONTRACT_CONFIG || ".data/near-contracts.json"),"utf8"));
  const manifest=JSON.parse(readFileSync(resolve("docs/NEAR-CONTRACT-ARTIFACTS.json"),"utf8"));
  return validateNearDeployment(config,workspace,getNearNetwork().usdcContractId,manifest.artifacts);
}
