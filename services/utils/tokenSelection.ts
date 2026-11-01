import type { AssetWithMetadata } from "@/types/faucet";
import { getNearNetwork } from "../near/network";

export const getDefaultSelectedToken = (assets: AssetWithMetadata[]): AssetWithMetadata => {
  const usdc = assets.find(asset => asset.metadata?.symbol?.toUpperCase() === "USDC");
  return usdc || {
    amount: "0",
    faucetId: getNearNetwork().usdcContractId,
    metadata: { symbol: "USDC", decimals: 6, maxSupply: 0 },
  };
};
