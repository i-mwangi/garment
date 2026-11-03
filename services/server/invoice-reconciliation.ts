import type { BusinessRecordRepository } from "./business-records";
import type { PaymentLinkRepository } from "./payment-links";

export function reconcileInvoiceCollection(companyId: string, code: string, repository: BusinessRecordRepository, links: PaymentLinkRepository) {
  const record = repository.get(companyId, code);
  if (!record || record.kind !== "invoice" || record.paymentLinkCode !== code || !["issued", "paid"].includes(record.status)) return undefined;
  const settlement = links.get(code)?.records[0];
  if (!settlement) return record;
  return repository.settleVerifiedInvoice(companyId, record.id, settlement.txid);
}

export function reconcileInvoiceCollections(companyId: string, repository: BusinessRecordRepository, links: PaymentLinkRepository) {
  return repository.list(companyId).map(record => {
    if (record.kind !== "invoice" || !["issued", "paid"].includes(record.status) || !record.paymentLinkCode) return record;
    return reconcileInvoiceCollection(companyId, record.paymentLinkCode, repository, links) || record;
  });
}
