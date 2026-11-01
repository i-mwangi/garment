"use client";

import { getNearNetwork } from "@/services/near/network";
import BaseModal from "./BaseModal";
import { ModalHeader } from "../Common/ModalHeader";
import { useNearWallet } from "@/contexts/NearWalletProvider";
import { formatAmount } from "@/services/near/amount";
import { SETTLBOX_TOKEN_ADDRESS } from "@/services/utils/constant";
import type { SelectTokenModalProps } from "@/types/modal";
import type { ModalProp } from "@/contexts/ModalManagerProvider";

export function SelectTokenModal({ isOpen, onClose, onTokenSelect, zIndex }: ModalProp<SelectTokenModalProps>) {
  const wallet = useNearWallet();
  return <BaseModal isOpen={isOpen} onClose={onClose} zIndex={zIndex}><div className="w-[min(90vw,450px)] rounded-xl bg-background p-5 text-text-primary"><ModalHeader title="Select token" onClose={onClose} /><button className="flex w-full items-center gap-3 rounded-xl p-4 hover:bg-app-background" onClick={() => { onTokenSelect?.({ faucetId: SETTLBOX_TOKEN_ADDRESS, amount: wallet.balanceBaseUnits || "0", metadata: { symbol: "USDC", decimals: 6, maxSupply: 0 } }); onClose(); }}><img src="/token/usdc.svg" alt="" className="h-8 w-8" /><span>USDC · {getNearNetwork().name}</span></button><p className="p-4 text-sm">{wallet.balanceBaseUnits === null ? "Connect a wallet to read its balance." : `Connected wallet: ${formatAmount(BigInt(wallet.balanceBaseUnits))} USDC`}</p></div></BaseModal>;
}

export default SelectTokenModal;
