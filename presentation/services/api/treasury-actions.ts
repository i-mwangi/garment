import { workspaceFetch } from "./seeded-workspace";
import { useRecordMutation } from "./record-mutation";
import {useNearWallet} from "@/contexts/NearWalletProvider";
import {authorizeNativeTreasuryPayment} from "@/services/api/treasury";

export function useApproveTreasuryProposal() {
  const wallet=useNearWallet();
  return useRecordMutation(async (input: { proposal: { uuid: string }; accountPublicKeys?: string[] }) => {
    const result=await authorizeNativeTreasuryPayment(input.proposal.uuid,wallet);
    await workspaceFetch(`/api/business-records/${encodeURIComponent(input.proposal.uuid)}`, "PATCH", { action: "refresh" });
    window.dispatchEvent(new Event("settlbox-workspace-refresh"));
    return result;
  });
}
export function useRefreshTreasuryProposal() {
  return useRecordMutation(async (input: { proposalId?: number; proposal: { uuid: string } }) => {
    const result = await workspaceFetch(`/api/business-records/${encodeURIComponent(input.proposal.uuid)}`, "PATCH", { action: "refresh" });
    window.dispatchEvent(new Event("settlbox-workspace-refresh"));
    return result;
  });
}
export function useCancelTreasuryProposal() {
  const wallet=useNearWallet();
  return useRecordMutation(async (input: { proposalUuid: string }) => {
    try {
      return await workspaceFetch(`/api/business-records/${encodeURIComponent(input.proposalUuid)}`, "PATCH", { action: "cancelPayment" });
    } catch {
      // A payment that has reached the native contract must still be cancelled
      // with the configured vault owner; queue-pending requests never reach it.
      return authorizeNativeTreasuryPayment(input.proposalUuid, wallet, "cancel");
    }
  });
}
