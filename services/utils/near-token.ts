import { getNearNetwork } from "../near/network";
export async function getFaucetMetadata(_client: unknown, assetId: string) {
  if (assetId !== getNearNetwork().usdcContractId && assetId !== "near-usdc") throw new Error("Unsupported NEAR settlement token");
  return { symbol: "USDC", decimals: 6, maxSupply: 0 };
}
export async function deployFaucet(..._args: unknown[]): Promise<never> { throw new Error("USDC issuance is managed by its issuer"); }
