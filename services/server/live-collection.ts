import { getNearNetwork } from "../near/network.ts";
import { createNearReader } from "../near/rpc.ts";
import { formatAmount, parseAmount } from "../near/amount.ts";
import { openPaymentLinks } from "./payment-links.ts";
import { openBusinessRecords } from "./business-records.ts";
import type { GlobalAccountHistory, LiveCollectionView, VirtualAccount } from "../../types/provider-history.ts";
import type { readNearTreasuryIdentity } from "./near-treasury-config.ts";

export function assembleLiveCollection(input: {
  accountId: string;
  balanceUsdc: string;
  networkName: string;
  usdcContractId: string;
  explorerUrl: string;
  deposits: GlobalAccountHistory["deposits"];
}): LiveCollectionView {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const received30d = input.deposits.filter(row => Date.parse(row.date) >= cutoff).reduce((sum, row) => sum + parseAmount(String(row.amount)), 0n);
  const accounts: VirtualAccount[] = [{
    id: `live-usdc-${input.accountId}`,
    currency: "USDC",
    method: "NEAR token transfer",
    bankName: input.networkName,
    status: "active",
    details: [
      { label: "Account holder", value: "Workspace collection wallet" },
      { label: "NEAR account", value: input.accountId },
      { label: "Asset", value: "USDC" },
      { label: "Token contract", value: input.usdcContractId },
      { label: "Network", value: input.networkName },
      { label: "Explorer", value: input.explorerUrl },
    ],
  }];
  return {
    accounts,
    deposits: [...input.deposits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 50),
    balanceUsdc: input.balanceUsdc,
    received30dUsdc: formatAmount(received30d),
    networkName: input.networkName,
  };
}

export async function readLiveCollection(identity: ReturnType<typeof readNearTreasuryIdentity>): Promise<LiveCollectionView> {
  const network = getNearNetwork();
  const balanceUsdc = formatAmount(await createNearReader().getUsdcBalance(identity.accountId));
  const links = openPaymentLinks();
  const records = openBusinessRecords();
  try {
    const seen = new Set<string>();
    const deposits: GlobalAccountHistory["deposits"] = [];
    for (const link of links.list(identity.accountId)) {
      for (const payment of link.records) {
        if (seen.has(payment.txid)) continue;
        seen.add(payment.txid);
        deposits.push({
          id: payment.txid,
          currency: "USDC",
          method: "Payment link",
          amount: Number(link.amount),
          sender: payment.payer,
          date: payment.createdAt,
          status: "completed",
        });
      }
    }
    for (const record of records.list(identity.companyId)) {
      if (record.kind !== "invoice" || record.status !== "paid" || !record.transactionHash || seen.has(record.transactionHash)) continue;
      seen.add(record.transactionHash);
      deposits.push({
        id: record.transactionHash,
        currency: "USDC",
        method: "Invoice",
        amount: Number(record.amount),
        sender: record.counterparty,
        date: record.updatedAt,
        status: "completed",
      });
    }
    return assembleLiveCollection({
      accountId: identity.accountId,
      balanceUsdc,
      networkName: network.name,
      usdcContractId: network.usdcContractId,
      explorerUrl: network.explorerUrl,
      deposits,
    });
  } finally {
    links.close();
    records.close();
  }
}
