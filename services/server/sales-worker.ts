import { openBusinessRecords } from "./business-records.ts";
import { openPaymentLinks } from "./payment-links.ts";
import { reconcileInvoiceCollections } from "./invoice-reconciliation.ts";

// Reconcile only links whose native NEAR receipt was verified and saved earlier.
// This runs even when autonomous spending is stopped; it submits no transaction.
export function runSalesReconciliation(companyId: string): { reconciled: number } {
  const records = openBusinessRecords();
  const links = openPaymentLinks();
  try {
    const before = new Set(records.listVerifiedSales(companyId).map(row => row.invoiceId));
    reconcileInvoiceCollections(companyId, records, links);
    return { reconciled: records.listVerifiedSales(companyId).filter(row => !before.has(row.invoiceId)).length };
  } finally { links.close(); records.close(); }
}
