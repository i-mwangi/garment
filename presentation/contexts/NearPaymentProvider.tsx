"use client";
import { useMemo, type ReactNode } from "react";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { createNearReader } from "@/services/near/rpc";
import { formatAmount } from "@/services/near/amount";
export function NearPaymentProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export function useNearPayment() {
  const wallet = useNearWallet(); const client = useMemo(() => createNearReader(), []);
  const balances = useMemo(() => ({ balances: wallet.address && wallet.balanceBaseUnits !== null ? [{ assetId: client.network.usdcContractId, balance: wallet.balanceBaseUnits, symbol: "USDC", decimals: 6, maxSupply: 0 }] : [], totalUsd: wallet.balanceBaseUnits === null ? 0 : Number(formatAmount(BigInt(wallet.balanceBaseUnits))) }), [wallet.address, wallet.balanceBaseUnits, client]);
  return { isConnected: wallet.address !== null, isLoading: wallet.isConnecting, wallet: wallet.address ? { id: wallet.address } : null, address: wallet.address ?? undefined, client, balances, balancesLoading: wallet.address !== null && wallet.balanceBaseUnits === null, openModal: (_config?: unknown) => wallet.connect(), logoutAsync: wallet.disconnect, fetchBalances: wallet.refreshBalance };
}
