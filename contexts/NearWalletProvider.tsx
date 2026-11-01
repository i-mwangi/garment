"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getNearNetwork } from "@/services/near/network";
import { createNearReader } from "@/services/near/rpc";
import { parseAmount, formatAmount, NEAR_DECIMALS } from "@/services/near/amount";
import { assertNearAccountId } from "@/services/near/account-id";
import { connectNearWallet, disconnectNearWallet, releaseNearWalletKey, signWalletMessage, sendNearCall, sendNativeNear, reconcilePendingSubmission, pendingSubmission, type NearCall } from "@/services/wallet/web3auth-near";

interface NearWalletContextValue {
  address: string | null;
  publicKey: string | null;
  balanceBaseUnits: string | null;
  nativeBalanceBaseUnits: string | null;
  balanceError: string | null;
  chainName: string;
  isConnecting: boolean;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  sendNative: (recipient: string, baseUnits: string) => Promise<string>;
  sendUsdc: (recipient: string, amount: string, memo?: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  callContract: (call: NearCall) => Promise<string>;
}
interface Review { title: string; details: string[]; resolve: (approved: boolean) => void; }
const NearWalletContext = createContext<NearWalletContextValue | null>(null);

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const network = useMemo(() => getNearNetwork(), []);
  const reader = useMemo(() => createNearReader(network), [network]);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balanceBaseUnits, setBalance] = useState<string | null>(null);
  const [nativeBalanceBaseUnits, setNativeBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const reviewing = useRef(false);
  const generation = useRef(0);
  const addressRef = useRef<string | null>(null);
  const pendingReview = useRef<Review | null>(null);
  useEffect(() => () => { generation.current++; pendingReview.current?.resolve(false); releaseNearWalletKey(); }, []);
  useEffect(() => {
    const clear = () => { generation.current++; addressRef.current = null; pendingReview.current?.resolve(false); setAddress(null); setPublicKey(null); setBalance(null); setNativeBalance(null); setBalanceError(null); };
    window.addEventListener("settlbox:near-wallet-disconnected", clear);
    return () => window.removeEventListener("settlbox:near-wallet-disconnected", clear);
  }, []);

  const loadBalances = useCallback(async (accountId: string, version: number) => {
    const balances = await Promise.allSettled([reader.getUsdcBalance(accountId), reader.getNativeBalance(accountId)]);
    if (generation.current !== version) return;
    setBalance(balances[0].status === "fulfilled" ? balances[0].value.toString() : null);
    setNativeBalance(balances[1].status === "fulfilled" ? balances[1].value.toString() : null);
    setBalanceError(balances.some(item => item.status === "rejected") ? "Balance unavailable. A new wallet needs NEAR for activation, gas and token storage." : null);
  }, [reader]);
  const refreshBalance = useCallback(async () => { if (address) await loadBalances(address, generation.current); }, [address, loadBalances]);
  const connect = useCallback(async () => {
    setConnecting(true);
    const version = ++generation.current;
    try {
      const identity = await connectNearWallet();
      if (generation.current !== version) throw new Error("Wallet session changed");
      addressRef.current = identity.accountId;
      setAddress(identity.accountId); setPublicKey(identity.publicKey);
      void loadBalances(identity.accountId, version);
      return identity.accountId;
    } finally { setConnecting(false); }
  }, [loadBalances]);
  const disconnect = useCallback(async () => {
    generation.current++; review?.resolve(false); setReview(null); reviewing.current = false;
    addressRef.current = null;
    setAddress(null); setPublicKey(null); setBalance(null); setNativeBalance(null); setBalanceError(null);
    await disconnectNearWallet();
  }, [review]);
  const authorize = useCallback(async (title: string, details: string[]) => {
    if (!addressRef.current) throw new Error("Sign in with Web3Auth first");
    if (reviewing.current) throw new Error("Finish the current wallet review first");
    reviewing.current = true;
    const version = generation.current;
    try {
      const approved = await new Promise<boolean>(resolve => { const request = { title, details, resolve }; pendingReview.current = request; setReview(request); });
      if (!approved || generation.current !== version) throw new Error("Wallet authorization cancelled");
    } finally { pendingReview.current = null; setReview(null); reviewing.current = false; }
  }, []);
  const callContract = useCallback(async (call: NearCall) => {
    await authorize("Review contract action", [network.name, `From: ${address}`, `Contract: ${call.contractId}`, `Method: ${call.methodName}`, `Arguments: ${JSON.stringify(call.args)}`, `Deposit: ${call.deposit || "0"} yoctoNEAR`]);
    return sendNearCall(call);
  }, [address, authorize, network.name]);
  const sendNative = useCallback(async (recipient: string, baseUnits: string) => {
    if (!address) throw new Error("Sign in with Web3Auth first");
    assertNearAccountId(recipient);
    if (!/^[1-9]\d*$/.test(baseUnits)) throw new Error("Invalid native NEAR amount");
    if (pendingSubmission(address)) { await reconcilePendingSubmission(address); if (pendingSubmission(address)) throw new Error("Wait for the previous transaction to settle"); }
    const balance = await reader.getNativeBalance(address);
    if (balance <= BigInt(baseUnits)) throw new Error("Fund your embedded wallet with NEAR for the transfer and gas first");
    await authorize("Review native NEAR transfer", [network.name, `From: ${address}`, `To: ${recipient}`, `Amount: ${formatAmount(BigInt(baseUnits), NEAR_DECIMALS)} NEAR`, `Exact amount: ${baseUnits} yoctoNEAR`, "This transfers NEAR and may activate an implicit deployment account. Its local deployment key controls that account."]);
    return sendNativeNear(recipient, baseUnits);
  }, [address,authorize,network.name,reader]);
  const sendUsdc = useCallback(async (recipient: string, amount: string, memo?: string) => {
    if (!address) throw new Error("Sign in with Web3Auth first");
    assertNearAccountId(recipient);
    if (memo !== undefined && (typeof memo !== "string" || memo.length > 256)) throw new Error("Invalid payment reference");
    const units = parseAmount(amount);
    if (units <= 0n) throw new Error("Payment amount must be positive");
    if (pendingSubmission(address)) { await reconcilePendingSubmission(address); if (pendingSubmission(address)) throw new Error("Wait for the previous transaction to settle"); }
    const metadata = await reader.view<{ symbol: string; decimals: number }>(network.usdcContractId, "ft_metadata", {});
    if (metadata.symbol !== "USDC" || metadata.decimals !== 6) throw new Error("USDC token metadata mismatch");
    const registered = await reader.view<unknown>(network.usdcContractId, "storage_balance_of", { account_id: recipient });
    if (!registered) {
      const bounds = await reader.view<{ min: string }>(network.usdcContractId, "storage_balance_bounds", {});
      await authorize("Register recipient for USDC", [network.name, `Recipient: ${recipient}`, `Token: ${network.usdcContractId}`, `Storage deposit: ${bounds.min} yoctoNEAR`, "This registers token storage. It does not send your USDC payment. After confirmation, review the payment again."]);
      const hash = await sendNearCall({ contractId: network.usdcContractId, methodName: "storage_deposit", args: { account_id: recipient, registration_only: true }, deposit: bounds.min });
      throw new Error(`Recipient storage registration submitted: ${hash}. No USDC payment was sent. Check registration before reviewing the payment again.`);
    }
    const balance = await reader.getUsdcBalance(address);
    if (balance < units) throw new Error("Insufficient USDC balance");
    await authorize("Review USDC transfer", [network.name, `From: ${address}`, `To: ${recipient}`, `Amount: ${amount} USDC`, `Token: ${network.usdcContractId}`, ...(memo ? [`Reference: ${memo}`] : []), "Network gas and the 1 yoctoNEAR transfer deposit are paid in NEAR."]);
    return sendNearCall({ contractId: network.usdcContractId, methodName: "ft_transfer", args: { receiver_id: recipient, amount: units.toString(), ...(memo ? { memo } : {}) }, deposit: "1" });
  }, [address, authorize, network, reader]);
  const signMessage = useCallback(async (message: string) => { await authorize("Sign in to workspace", [message]); return signWalletMessage(message); }, [authorize]);
  const value: NearWalletContextValue = { address, publicKey, balanceBaseUnits, nativeBalanceBaseUnits, balanceError, chainName: network.name, isConnecting, connect, disconnect, refreshBalance, sendNative, sendUsdc, signMessage, callContract,
  };
  return <NearWalletContext.Provider value={value}>{children}{review && <div role="dialog" aria-modal="true" aria-labelledby="near-review-title" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onKeyDown={event => { if (event.key === "Escape") review.resolve(false); }}>
    <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-primary-divider bg-background p-6 text-text-primary shadow-xl">
      <h2 id="near-review-title" className="text-lg font-semibold">{review.title}</h2>
      <div className="my-5 space-y-3 break-all text-sm">{review.details.map((line, index) => <p key={index} className="whitespace-pre-wrap">{line}</p>)}</div>
      <div className="flex justify-end gap-3"><button autoFocus className="rounded-xl border border-primary-divider px-4 py-3" onClick={() => review.resolve(false)}>Cancel</button><button className="rounded-xl bg-[#1b1b1b] px-4 py-3 text-white" onClick={() => review.resolve(true)}>Approve</button></div>
    </div>
  </div>}</NearWalletContext.Provider>;
}
export function useNearWallet() { const context = useContext(NearWalletContext); if (!context) throw new Error("NEAR wallet provider is required"); return context; }
