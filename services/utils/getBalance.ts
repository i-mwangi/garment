import { createNearReader } from "../near/rpc";
import { formatAmount } from "../near/amount";

export async function getBalance(address: string) {
  const reader = createNearReader();
  const balance = await reader.getUsdcBalance(address);
  return [{ assetId: reader.network.usdcContractId, balance: formatAmount(balance), decimals: 6, maxSupply: "0", symbol: "USDC" }];
}
