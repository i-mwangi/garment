import { openBusinessRecords } from "./business-records.ts";
import { openPaymentLinks } from "./payment-links.ts";
import { reconcileInvoiceCollections } from "./invoice-reconciliation.ts";
import { openBusinessPolicy } from "./business-policy.ts";

// Reconcile only links whose native NEAR receipt was verified and saved earlier.
// This runs even when autonomous spending is stopped; it submits no transaction.
export function runSalesReconciliation(companyId: string): { reconciled: number; revenueSharesPrepared: number } {
  const records = openBusinessRecords();
  const links = openPaymentLinks();
  const policy = openBusinessPolicy();
  try {
    const before = new Set(records.listVerifiedSales(companyId).map(row => row.invoiceId));
    const allocatedBefore = new Set(records.listRevenueShareAllocations(companyId).map(row => row.invoiceId));
    reconcileInvoiceCollections(companyId, records, links);
    const sales = records.listVerifiedSales(companyId);
    const revenueSharesPrepared = sales.reduce((total, sale) => {
      const shares = records.materializeRevenueShares(companyId, sale, policy.get(companyId));
      return total + (allocatedBefore.has(sale.invoiceId) ? 0 : shares.length);
    }, 0);
    return { reconciled: sales.filter(row => !before.has(row.invoiceId)).length, revenueSharesPrepared };
  } finally { policy.close(); links.close(); records.close(); }
}
