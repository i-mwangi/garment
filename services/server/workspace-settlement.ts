import type { DemoBill, DemoData, DemoInvoice, DemoMonthlyFinancial, DemoPayroll, DemoTransaction } from "../../presentation/contexts/DemoProvider";
import type { BusinessRecord } from "../../types/business";
import type { BusinessPaymentLink } from "./payment-links.ts";

const CATEGORY: Record<string, string> = {
  invoice: "Invoice",
  bill: "Vendor",
  payroll: "Payroll",
  reimbursement: "Contractor",
};

function monthKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ledgerTransaction(record: BusinessRecord, companyName: string, treasuryAddress: string): DemoTransaction | undefined {
  if (record.status === "cancelled") return undefined;
  const settled = record.status === "paid" && Boolean(record.transactionHash);
  const isIncome = record.kind === "invoice";
  return {
    id: record.id,
    type: isIncome ? "RECEIVE" : "SEND",
    status: settled ? "COMPLETED" : "PENDING",
    amount: Number(record.amount),
    currency: "USDC",
    from: isIncome ? record.counterparty : companyName,
    fromAddress: isIncome ? "" : treasuryAddress,
    to: isIncome ? companyName : record.counterparty,
    toAddress: isIncome ? treasuryAddress : record.recipient,
    accountId: treasuryAddress,
    category: CATEGORY[record.kind] || "Other",
    label: record.title,
    txHash: settled ? record.transactionHash! : "",
    timestamp: settled ? record.updatedAt : record.createdAt,
    note: record.description,
  };
}

function linkTransactions(links: BusinessPaymentLink[], invoices: DemoInvoice[], companyName: string, treasuryAddress: string): DemoTransaction[] {
  const invoiceCodes = new Set(invoices.map(invoice => invoice.paymentLinkCode).filter((code): code is string => Boolean(code)));
  const rows: DemoTransaction[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (invoiceCodes.has(link.code)) continue;
    if (link.records.length) {
      for (const payment of link.records) {
        if (seen.has(payment.txid)) continue;
        seen.add(payment.txid);
        rows.push({
          id: payment.txid,
          type: "RECEIVE",
          status: "COMPLETED",
          amount: Number(link.amount),
          currency: "USDC",
          from: payment.payer,
          fromAddress: payment.payer,
          to: companyName,
          toAddress: treasuryAddress,
          accountId: treasuryAddress,
          category: "Invoice",
          label: link.title,
          txHash: payment.txid,
          timestamp: payment.createdAt,
          note: link.description,
        });
      }
      continue;
    }
    if (link.status !== "ACTIVE") continue;
    rows.push({
      id: `link-${link.code}`,
      type: "RECEIVE",
      status: "PENDING",
      amount: Number(link.amount),
      currency: "USDC",
      from: "Payment link",
      fromAddress: "",
      to: companyName,
      toAddress: link.paymentWalletAddress,
      accountId: treasuryAddress,
      category: "Invoice",
      label: link.title,
      txHash: "",
      timestamp: link.createdAt,
      note: link.description,
    });
  }
  return rows;
}

function payrollHistory(records: BusinessRecord[], treasuryAddress: string): DemoPayroll[] {
  return records.filter(record => record.kind === "payroll").map((record, index) => ({
    id: index + 1,
    uuid: record.id,
    name: record.title,
    status: record.status === "paid" ? "COMPLETED" : record.status === "cancelled" ? "CANCELLED" : "PENDING",
    totalAmount: Number(record.amount),
    currency: "USDC",
    employeeCount: 1,
    executedAt: record.status === "paid" ? record.updatedAt : "",
    createdAt: record.createdAt,
    accountId: treasuryAddress,
    accountName: "NEAR policy treasury",
    txHash: record.status === "paid" ? record.transactionHash || "" : "",
    recipients: [{ name: record.counterparty, amount: Number(record.amount), walletAddress: record.recipient, status: record.status === "paid" ? "PAID" : "PENDING" }],
  }));
}

function monthlyFrom(transactions: DemoTransaction[], now = new Date()): DemoMonthlyFinancial[] {
  const index = new Map<string, DemoMonthlyFinancial>();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    index.set(month, { month, income: 0, expenses: 0, payroll: 0, netFlow: 0 });
  }
  for (const transaction of transactions) {
    const month = monthKey(transaction.timestamp);
    if (!month) continue;
    const row = index.get(month) || { month, income: 0, expenses: 0, payroll: 0, netFlow: 0 };
    if (transaction.type === "RECEIVE" || transaction.type === "INVOICE") row.income += transaction.amount;
    else if (transaction.category.toLowerCase() === "payroll") row.payroll += transaction.amount;
    else row.expenses += transaction.amount;
    index.set(month, row);
  }
  return [...index.values()].sort((left, right) => left.month.localeCompare(right.month)).map(row => ({ ...row, netFlow: row.income - row.expenses - row.payroll }));
}

function books(invoices: DemoInvoice[], bills: DemoBill[], payrolls: DemoPayroll[], transactions: DemoTransaction[]) {
  const sent = invoices.filter(invoice => invoice.type !== "RECEIVED");
  const received = invoices.filter(invoice => invoice.type === "RECEIVED");
  const sum = (rows: { amount: number; status: string }[], statuses: string[]) => rows.filter(row => statuses.includes(row.status)).reduce((total, row) => total + row.amount, 0);
  const payrollPaid = payrolls.filter(row => row.status === "COMPLETED").reduce((total, row) => total + row.totalAmount, 0);
  return {
    invoiceStats: {
      totalSent: sent.reduce((total, row) => total + row.amount, 0),
      totalReceived: received.reduce((total, row) => total + row.amount, 0),
      pendingSent: sum(sent, ["SENT", "ISSUED", "CONFIRMED", "SUBMITTED"]),
      pendingReceived: sum(received, ["SENT", "ISSUED", "PENDING"]),
      paidSent: sum(sent, ["PAID"]),
      paidReceived: sum(received, ["PAID"]),
      overdueSent: 0,
      overdueReceived: 0,
    },
    billStats: {
      totalPending: bills.filter(row => !["PAID", "CANCELLED"].includes(row.status)).reduce((total, row) => total + row.amount, 0),
      totalOverdue: 0,
      totalPaid: bills.filter(row => row.status === "PAID").reduce((total, row) => total + row.amount, 0),
      billCount: bills.length,
    },
    payrollStats: {
      totalPaid: payrollPaid,
      totalPayrolls: payrolls.length,
      averagePerPayroll: payrolls.length ? payrollPaid / payrolls.length : 0,
      nextPayrollDate: payrolls.find(row => row.status === "PENDING")?.createdAt || "",
    },
    monthlyFinancials: monthlyFrom(transactions),
  };
}

export function projectWorkspaceSettlement(data: DemoData, records: BusinessRecord[], treasuryAddress: string, links: BusinessPaymentLink[] = []): DemoData {
  const indexed = new Map(records.map(record => [record.id, record]));
  const invoiceSources = [...data.invoices];
  const billSources = [...data.bills];
  for (const record of records) {
    const id = Number.parseInt(record.id.replaceAll("-", "").slice(0, 12), 16);
    if (record.kind === "invoice" && !invoiceSources.some(item => item.businessRecordId === record.id)) {
      invoiceSources.push({ id, uuid: record.id, businessRecordId: record.id, invoiceNumber: record.title, type: "SENT", status: record.status.toUpperCase(), amount: Number(record.amount), amountExact: record.amount, currency: "USDC", from: data.company.companyName, to: record.counterparty, toEmail: "", recipient: record.recipient, description: record.description, dueDate: record.dueDate, paidAt: null, createdAt: record.createdAt, items: [{ description: record.description || record.title, quantity: 1, unitPrice: Number(record.amount) }] } satisfies DemoInvoice);
    }
    if (["bill", "payroll"].includes(record.kind) && !billSources.some(item => item.businessRecordId === record.id)) {
      billSources.push({ id, uuid: record.id, businessRecordId: record.id, vendor: record.counterparty, description: record.description || record.title, amount: Number(record.amount), amountExact: record.amount, recipient: record.recipient, currency: "USDC", status: record.status.toUpperCase(), dueDate: record.dueDate, category: record.kind, recurring: false, frequency: null, createdAt: record.createdAt } satisfies DemoBill);
    }
  }
  const invoices = invoiceSources.map(invoice => {
    const record = invoice.businessRecordId ? indexed.get(invoice.businessRecordId) : undefined;
    if (!record) return invoice;
    return { ...invoice, amount: Number(record.amount), amountExact: record.amount, recipient: record.recipient, dueDate: record.dueDate, description: record.description, to: record.counterparty, paymentLinkCode: record.paymentLinkCode, status: record.status === "paid" ? "PAID" : record.status === "issued" ? "SENT" : record.status === "draft" && invoice.payrollContractId ? "CONFIRMED" : record.status.toUpperCase(), paidAt: record.status === "paid" ? record.updatedAt : null };
  });
  const bills = billSources.map(bill => {
    const record = bill.businessRecordId ? indexed.get(bill.businessRecordId) : undefined;
    if (!record) return bill;
    return { ...bill, amount: Number(record.amount), amountExact: record.amount, recipient: record.recipient, dueDate: record.dueDate, description: record.description, vendor: record.counterparty, status: record.status === "paid" ? "PAID" : record.status === "draft" ? "PENDING" : record.status.toUpperCase(), paidAt: record.status === "paid" ? record.updatedAt : null };
  });
  const settled = records.map(record => ledgerTransaction(record, data.company.companyName, treasuryAddress)).filter((row): row is DemoTransaction => Boolean(row));
  const canonicalIds = new Set([...records.map(record => record.id), ...settled.map(row => row.id)]);
  const payrolls = [...payrollHistory(records, treasuryAddress), ...data.payrolls.filter(payroll => !canonicalIds.has(payroll.uuid))];
  const transactions = [...settled, ...linkTransactions(links, invoices, data.company.companyName, treasuryAddress), ...data.transactions.filter(transaction => !canonicalIds.has(transaction.id))].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  return { ...data, invoices, bills, payrolls, transactions, ...books(invoices, bills, payrolls, transactions) };
}
