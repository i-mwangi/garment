export type NetworkDto = { name: string; chainId: number; networkId?: never } | { name: string; networkId: "testnet" | "mainnet"; chainId?: never };
