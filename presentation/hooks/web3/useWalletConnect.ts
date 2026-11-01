"use client";
import { useNearWallet } from "@/contexts/NearWalletProvider";
export const getLastConnectedAddress = (): string | null => null;
export const getWalletAddresses = (): string[] => [];
async function unsupportedWalletOperation(): Promise<never> {
  throw new Error("Use Web3Auth login and recovery to manage this embedded NEAR wallet");
}
export function useWalletConnect() {
  const wallet = useNearWallet();
  return {
    walletAddress: wallet.address ?? "",
    isConnected: wallet.address !== null,
    isLoading: wallet.isConnecting,
    connect: wallet.connect,
    handleConnectExisting: async (..._args: unknown[]) => wallet.connect(),
    handleCreateWallet: wallet.connect,
    handleImportWallet: async (..._args: unknown[]): Promise<string[]> => unsupportedWalletOperation(),
    disconnect: async () => wallet.disconnect(),
    deployAccount: unsupportedWalletOperation,
    importAccount: unsupportedWalletOperation,
    replaceWalletAddresses: unsupportedWalletOperation,
    addWalletAddress: unsupportedWalletOperation,
  };
}
