import { createPublicKey, verify } from "node:crypto";
import { assertNearAccountId, implicitAccountId } from "../near/account-id.ts";
import { decodeBase58 } from "../near/base58.ts";
import { createNearReader, NearRpcError } from "../near/rpc.ts";
export async function verifyNearWalletProof(accountId: string, message: string, encoded: string, reader = createNearReader()): Promise<void> {
  assertNearAccountId(accountId);
  if (encoded.length > 2048 || message.length > 8192 || !message.startsWith("Settlbox workspace authorization\n")) throw new Error("Invalid wallet proof");
  const proof = JSON.parse(encoded);
  if (proof.accountId !== accountId || typeof proof.publicKey !== "string" || !proof.publicKey.startsWith("ed25519:") || typeof proof.signature !== "string") throw new Error("Wallet proof identity mismatch");
  const key = decodeBase58(proof.publicKey.slice(8)); const signature = decodeBase58(proof.signature);
  if (key.length !== 32 || signature.length !== 64) throw new Error("Invalid Ed25519 proof encoding");
  if (/^[a-f0-9]{64}$/.test(accountId) && implicitAccountId(key) !== accountId) throw new Error("Implicit wallet key mismatch");
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key)]), format: "der", type: "spki" });
  if (!verify(null, new TextEncoder().encode(message), publicKey, signature)) throw new Error("Wallet signature was rejected");
  await reader.verifyNetwork();
  try {
    const accessKey = await reader.rpc<{ permission: unknown }>("query", { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: proof.publicKey });
    if (accessKey.permission !== "FullAccess") throw new Error("Workspace wallet ownership requires a current full-access key");
  } catch (error) {
    // An unfunded implicit account is controlled by the key encoded in its ID.
    // Existing accounts must still prove that the key is currently authorized.
    if (/^[a-f0-9]{64}$/.test(accountId) && implicitAccountId(key) === accountId && error instanceof NearRpcError) {
      try { await reader.rpc("query", { request_type: "view_account", finality: "final", account_id: accountId }); }
      catch (accountError) {
        if (accountError instanceof NearRpcError && JSON.stringify(accountError.detail).includes(`account ${accountId} does not exist`)) return;
      }
    }
    throw error;
  }
}
