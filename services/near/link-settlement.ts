import { assertFinalSuccess, type NearExecutionOutcome } from "./rpc.ts";
import { parseAmount } from "./amount.ts";

export function verifyNearLinkSettlement(
  link: { code: string; paymentWalletAddress: string; amount: string; createdAt: string },
  outcome: NearExecutionOutcome,
  expected: { tokenId: string; signerId: string; hash: string; blockTimestampNs: string },
): string {
  assertFinalSuccess(outcome);
  const tx = outcome.transaction;
  if (tx.hash !== expected.hash || tx.signer_id !== expected.signerId || tx.receiver_id !== expected.tokenId || tx.actions.length !== 1) throw new Error("Payment transaction identity mismatch");
  const action = tx.actions[0] as { FunctionCall?: { method_name: string; args: string; deposit: string } };
  if (action.FunctionCall?.method_name !== "ft_transfer" || action.FunctionCall.deposit !== "1") throw new Error("Payment must be a direct USDC token transfer");
  const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(action.FunctionCall.args), char => char.charCodeAt(0))));
  const amount = parseAmount(link.amount).toString();
  if (args.receiver_id !== link.paymentWalletAddress || args.amount !== amount || args.memo !== `settlbox-link:${link.code}`) throw new Error("Token transfer does not match this payment link");
  const hasTransfer = outcome.receipts_outcome.some(receipt => receipt.outcome.executor_id === expected.tokenId && receipt.outcome.logs.some(log => {
    if (!log.startsWith("EVENT_JSON:")) return false;
    try {
      const event = JSON.parse(log.slice(11));
      return event.standard === "nep141" && event.event === "ft_transfer" && Array.isArray(event.data) && event.data.some((item: Record<string, unknown>) => item.old_owner_id === expected.signerId && item.new_owner_id === link.paymentWalletAddress && item.amount === amount);
    } catch { return false; }
  }));
  if (!hasTransfer) throw new Error("The USDC contract did not emit the expected transfer event");
  const createdAt = Date.parse(link.createdAt);
  if (!Number.isFinite(createdAt) || BigInt(expected.blockTimestampNs) < BigInt(createdAt) * 1000000n) throw new Error("Transaction predates this payment link");
  return expected.signerId;
}
