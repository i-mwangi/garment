"use client";

import { getNearNetwork } from "../near/network";
import { implicitAccountId, assertNearAccountId } from "../near/account-id";
import { encodeBase58 } from "../near/base58";
import { createNearReader, assertFinalSuccess } from "../near/rpc";

export interface NearCall {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit?: string;
  gas?: string;
}
export interface WalletMessageProof { accountId: string; publicKey: string; signature: string; }
type Web3AuthSdk = InstanceType<typeof import("@web3auth/modal").Web3Auth>;
type NearKeyPair = ReturnType<typeof import("near-api-js").KeyPair.fromString>;
let sdkPromise: Promise<Web3AuthSdk> | undefined;
let activeKey: NearKeyPair | undefined;
let activeAccount: string | undefined;
let signing = false;
export function releaseNearWalletKey(): void { activeKey = undefined; activeAccount = undefined; }

async function getSdk(): Promise<Web3AuthSdk> {
  const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
  if (!clientId) throw new Error("Set NEXT_PUBLIC_WEB3AUTH_CLIENT_ID to enable Web3Auth login");
  const authNetwork = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || "sapphire_devnet";
  if (authNetwork !== "sapphire_devnet" && authNetwork !== "sapphire_mainnet") throw new Error("Unsupported Web3Auth network");
  sdkPromise ??= (async () => {
    const { Web3Auth } = await import("@web3auth/modal");
    const sdk = new Web3Auth({
      clientId, web3AuthNetwork: authNetwork, multiInjectedProviderDiscovery: false,
      modalConfig: { hideWalletDiscovery: true, connectors: {
        auth: { label: "Sign in", showOnModal: true },
        metamask: { label: "MetaMask", showOnModal: false },
      } },
    });
    const invalidate = () => { if (activeAccount) { releaseNearWalletKey(); window.dispatchEvent(new Event("settlbox:near-wallet-disconnected")); } };
    sdk.on("disconnected", invalidate);
    sdk.on("connection_updated", () => { if (activeAccount) void verifyActiveSessionIdentity().catch(invalidate); });
    await sdk.init();
    return sdk;
  })().catch(error => { sdkPromise = undefined; throw error; });
  return sdkPromise;
}

export async function connectNearWallet(): Promise<{ accountId: string; publicKey: string }> {
  const sdk = await getSdk();
  const connection = await sdk.connect();
  const provider = connection?.ethereumProvider;
  if (!provider) {
    throw new Error("Use a Web3Auth embedded login to create your NEAR wallet");
  }
  const secret: unknown = await provider.request({ method: "private_key" });
  if (typeof secret !== "string" || !/^[0-9a-fA-F]{64}$/.test(secret)) throw new Error("Web3Auth did not provide a supported embedded signing key");
  const [{ getED25519Key }, { KeyPair }] = await Promise.all([import("@web3auth/modal"), import("near-api-js")]);
  const derived = getED25519Key(secret);
  try {
    activeKey = KeyPair.fromString(`ed25519:${encodeBase58(derived.sk)}`);
    activeAccount = implicitAccountId(activeKey.getPublicKey().data);
    return { accountId: activeAccount, publicKey: activeKey.getPublicKey().toString() };
  } finally { derived.sk.fill(0); }
}

export async function disconnectNearWallet(): Promise<void> {
  releaseNearWalletKey();
  const sdk = await getSdk();
  if (sdk.connected) await sdk.logout();
}

function requireKey() {
  if (!activeKey || !activeAccount) throw new Error("Sign in with Web3Auth first");
  return { key: activeKey, accountId: activeAccount };
}

async function verifyActiveSessionIdentity(): Promise<void> {
  const { accountId } = requireKey();
  const sdk = await getSdk();
  if (!sdk.connected || !sdk.connection?.ethereumProvider) throw new Error("Web3Auth session expired; sign in again");
  const secret: unknown = await sdk.connection.ethereumProvider.request({ method: "private_key" });
  if (typeof secret !== "string" || !/^[0-9a-fA-F]{64}$/.test(secret)) throw new Error("Embedded wallet signing is unavailable");
  const { getED25519Key } = await import("@web3auth/modal");
  const derived = getED25519Key(secret);
  try {
    if (implicitAccountId(derived.pk) !== accountId) {
      releaseNearWalletKey(); window.dispatchEvent(new Event("settlbox:near-wallet-disconnected"));
      throw new Error("Web3Auth account changed; reconnect before authorizing");
    }
  } finally { derived.sk.fill(0); }
}

export async function signWalletMessage(message: string): Promise<string> {
  await verifyActiveSessionIdentity();
  const { key, accountId } = requireKey();
  if (!message.startsWith("Settlbox workspace authorization\n")) throw new Error("Unrecognized workspace authorization request");
  if (!message.includes(`\nWallet: ${accountId}\n`) || !message.includes(`\nOrigin: ${window.location.origin}\n`) || !message.includes(`\nNetwork: ${getNearNetwork().networkId}\n`)) throw new Error("Workspace challenge does not match this wallet, origin and network");
  const signature = key.sign(new TextEncoder().encode(message)).signature;
  return JSON.stringify({ accountId, publicKey: key.getPublicKey().toString(), signature: encodeBase58(signature) } satisfies WalletMessageProof);
}

export function pendingSubmission(accountId: string): { hash: string; signerId: string; networkId: string; contractId?: string; methodName?: string; args?: Record<string, unknown> } | null {
  const raw = localStorage.getItem(`settlbox:near:pending:${getNearNetwork().networkId}:${accountId}`);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.hash !== "string" || value.signerId !== accountId || value.networkId !== getNearNetwork().networkId) throw new Error();
    return value;
  } catch { throw new Error("A saved NEAR submission needs review before another payment"); }
}

export async function sendNearCall(call: NearCall): Promise<string> { return submitNearAction(call); }
export async function sendNativeNear(recipient: string, amount: string): Promise<string> {
  assertNearAccountId(recipient);
  if (!/^[1-9]\d*$/.test(amount)) throw new Error("Invalid native NEAR amount");
  return submitNearAction({contractId:recipient,methodName:"native_transfer",args:{amount}},amount);
}
async function submitNearAction(call: NearCall, nativeTransferAmount?: string): Promise<string> {
  await verifyActiveSessionIdentity();
  const { key, accountId } = requireKey();
  if (signing) throw new Error("Another wallet transaction is being submitted");
  assertNearAccountId(call.contractId);
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(call.methodName)) throw new Error("Invalid NEAR method");
  if (!/^(0|[1-9]\d*)$/.test(call.deposit || "0") || !/^[1-9]\d*$/.test(call.gas || "30000000000000")) throw new Error("Invalid NEAR transaction units");
  const network = getNearNetwork();
  const reader = createNearReader(network);
  const storageKey = `settlbox:near:pending:${network.networkId}:${accountId}`;
  signing = true;
  try {
    await reader.verifyNetwork();
    const pending = pendingSubmission(accountId);
    if (pending) throw new Error(`A prior transaction needs reconciliation before sending again: ${pending.hash}`);
    const { Account, JsonRpcProvider, KeyPairSigner, actions } = await import("near-api-js");
    const provider = new JsonRpcProvider({ url: network.rpcUrl });
    const signer = new KeyPairSigner(key);
    const account = new Account(accountId, provider);
    const transaction = await account.createTransaction({
      receiverId: call.contractId, publicKey: key.getPublicKey().toString(),
      actions: [nativeTransferAmount === undefined ? actions.functionCall(call.methodName, call.args, BigInt(call.gas || "30000000000000"), BigInt(call.deposit || "0")) : actions.transfer(BigInt(nativeTransferAmount))],
    });
    await verifyActiveSessionIdentity();
    if (activeKey !== key || activeAccount !== accountId) throw new Error("Wallet session changed before signing");
    const signed = await signer.signTransaction(transaction);
    const hash = encodeBase58(signed.txHash);
    // A durable hash is saved before broadcast. Never store key material or automatically re-sign on a timeout.
    localStorage.setItem(storageKey, JSON.stringify({ hash, signerId: accountId, networkId: network.networkId, contractId: call.contractId, methodName: call.methodName, args: call.args, submittedAt: new Date().toISOString() }));
    if (activeKey !== key || activeAccount !== accountId) { localStorage.removeItem(storageKey); throw new Error("Wallet session changed before broadcast"); }
    try {
      await provider.sendTransaction(signed.signedTransaction);
      return hash;
    } catch {
      // Transport uncertainty is not evidence of failure. The caller can query this original hash.
      return hash;
    }
  } finally { signing = false; }
}

export async function reconcilePendingSubmission(accountId: string): Promise<string | null> {
  const pending = pendingSubmission(accountId);
  if (!pending) return null;
  const result = await createNearReader().getReceipt(pending.hash, accountId);
  if (result.final_execution_status !== "FINAL") return pending.hash;
  if ("Failure" in result.status) {
    localStorage.removeItem(`settlbox:near:pending:${pending.networkId}:${accountId}`);
    throw new Error(`NEAR transaction failed: ${pending.hash}`);
  }
  try { assertFinalSuccess(result); }
  catch (error) {
    // A finalized failed child receipt is terminal, too. Report failure and require
    // a fresh explicit review; do not leave the wallet permanently blocked.
    localStorage.removeItem(`settlbox:near:pending:${pending.networkId}:${accountId}`);
    throw error;
  }
  localStorage.removeItem(`settlbox:near:pending:${pending.networkId}:${accountId}`);
  return null;
}
