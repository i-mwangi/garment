"use client";

import { useNearWallet } from "@/contexts/NearWalletProvider";

export function useWalletConnect() {
  const wallet = useNearWallet();
  return { walletAddress: wallet.address || "", isConnected: !!wallet.address, isLoading: wallet.isConnecting, connect: wallet.connect, disconnect: wallet.disconnect };
}
