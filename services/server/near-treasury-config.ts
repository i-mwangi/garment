import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertNearAccountId } from "../near/account-id.ts";
import { getNearNetwork } from "../near/network.ts";
export function readNearTreasuryIdentity(): { companyId: string; accountId: string; networkId: "testnet" | "mainnet" } {
  const config = JSON.parse(readFileSync(resolve(process.env.SETTLBOX_NEAR_TREASURY_CONFIG || ".data/near-treasury.json"), "utf8"));
  if (!config || typeof config.companyId !== "string" || !config.companyId.trim()) throw new Error("A NEAR treasury workspace must be configured");
  assertNearAccountId(config.accountId);
  if (config.networkId !== getNearNetwork().networkId) throw new Error("Treasury and application NEAR networks differ");
  return { companyId: config.companyId, accountId: config.accountId, networkId: config.networkId };
}
