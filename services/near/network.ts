export type NearNetworkId = "testnet" | "mainnet";
export interface NearNetwork {
  networkId: NearNetworkId;
  name: string;
  rpcUrl: string;
  backupRpcUrl?: string;
  explorerUrl: string;
  usdcContractId: string;
  usdcDecimals: 6;
}

export function getNearNetwork(value = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet"): NearNetwork {
  if (value !== "testnet" && value !== "mainnet") throw new Error("Unsupported NEAR network");
  return {
    networkId: value,
    name: value === "testnet" ? "NEAR Testnet" : "NEAR",
    rpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL || `https://rpc.${value}.near.org`,
    backupRpcUrl: process.env.NEXT_PUBLIC_NEAR_BACKUP_RPC_URL || (value === "testnet" ? "https://rpc.testnet.fastnear.com" : undefined),
    explorerUrl: value === "testnet" ? "https://testnet.nearblocks.io" : "https://nearblocks.io",
    usdcContractId: value === "testnet"
      ? "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af"
      : "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    usdcDecimals: 6,
  };
}

export function nearTransactionUrl(hash: string, network = getNearNetwork()): string {
  return `${network.explorerUrl}/txns/${encodeURIComponent(hash)}`;
}
