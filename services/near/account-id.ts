export function isNearAccountId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 64
    && !/^0x[0-9a-f]+$/i.test(value)
    && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
}

export function assertNearAccountId(value: unknown): asserts value is string {
  if (!isNearAccountId(value)) throw new Error("A valid native NEAR account ID is required");
}

export function isNearTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && decodeBase58(value).length === 32;
}

export function implicitAccountId(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("A 32-byte Ed25519 public key is required");
  return Array.from(publicKey, byte => byte.toString(16).padStart(2, "0")).join("");
}
import { decodeBase58 } from "./base58.ts";
