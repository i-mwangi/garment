import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectWorkspaceSettlement } from "../services/server/workspace-settlement.ts";

test('chat-created canonical invoices and bills appear once and track later edits',()=>{
  const data=JSON.parse(readFileSync('public/demo-data-entity-3.json','utf8'));
  const base={id:'12345678-1234-4123-a123-123456789012',kind:'invoice',title:'Chat invoice',counterparty:'Client',recipient:'0x'+'1'.repeat(40),amount:'0.001',dueDate:'2026-11-12',description:'Work',status:'draft',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z',paymentLinkCode:null};
  const projected=projectWorkspaceSettlement(data,[base],base.recipient);
  assert.equal(projected.invoices.filter(row=>row.businessRecordId===base.id).length,1);
  const edited=projectWorkspaceSettlement(projected,[{...base,amount:'0.002',dueDate:'2026-12-12',status:'issued',paymentLinkCode:'checkout'}],base.recipient);
  const invoice=edited.invoices.find(row=>row.businessRecordId===base.id);
  assert.equal(invoice.amountExact,'0.002');assert.equal(invoice.dueDate,'2026-12-12');assert.equal(invoice.status,'SENT');assert.equal(invoice.paymentLinkCode,'checkout');
  assert.equal(edited.invoices.filter(row=>row.businessRecordId===base.id).length,1);
  const bill=projectWorkspaceSettlement(data,[{...base,kind:'bill'}],base.recipient).bills.find(row=>row.businessRecordId===base.id);
  assert.equal(bill.status,'PENDING');assert.equal(bill.recipient,base.recipient);
});

test("workspace invoice and bill histories follow canonical settlement, never submission hashes", () => {
  const data = JSON.parse(readFileSync("public/demo-data-entity-3.json", "utf8"));
  const address = "0x1111111111111111111111111111111111111111";
  const record = { id: "payment", companyId: "company", kind: "payroll", title: "Payroll", counterparty: "Contractor", recipient: address, amount: "0.001", dueDate: "2026-10-31", description: "Delivery", status: "submitted", transactionHash: `0x${"1".repeat(64)}`, paymentLinkCode: null, createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z" };
  data.invoices.push({ uuid: "new-invoice", payrollContractId: 1, businessRecordId: record.id, status: "CONFIRMED", paidAt: null });
  data.bills.push({ uuid: "new-bill", businessRecordId: record.id, status: "PENDING", paidAt: null });
  const pending = projectWorkspaceSettlement(data, [record], address);
  assert.equal(pending.invoices.at(-1).status, "SUBMITTED");
  assert.equal(pending.bills.at(-1).status, "SUBMITTED");
  const pendingTx = pending.transactions.find(transaction => transaction.id === record.id);
  assert.equal(pendingTx.status, "PENDING");
  assert.equal(pendingTx.txHash, "");
  assert.equal(pendingTx.category, "Payroll");
  const paid = projectWorkspaceSettlement(data, [{ ...record, status: "paid" }], address);
  assert.equal(paid.invoices.at(-1).status, "PAID");
  assert.equal(paid.bills.at(-1).status, "PAID");
  const paidTx = paid.transactions.filter(transaction => transaction.id === record.id);
  assert.equal(paidTx.length, 1);
  assert.equal(paidTx[0].status, "COMPLETED");
  assert.equal(paidTx[0].txHash, record.transactionHash);
  const repeated = projectWorkspaceSettlement(paid, [{ ...record, status: "paid" }], address);
  assert.deepEqual(repeated.transactions, paid.transactions);
  assert.equal(repeated.invoices[0].status, data.invoices[0].status);
});

test("accounting books fill income expense payroll tax series from live records", () => {
  const data = JSON.parse(readFileSync("public/demo-data-entity-3.json", "utf8"));
  data.transactions = [];
  data.monthlyFinancials = [];
  const address = "7181acde7181acde7181acde7181acde7181acde7181acde7181acde7181344b";
  const stamp = "2026-11-12T12:00:00.000Z";
  const books = projectWorkspaceSettlement(data, [
    { id: "inv-live", kind: "invoice", title: "NEAR-LIVE-001", counterparty: "Ada", recipient: address, amount: "0.5", dueDate: "2026-11-20", description: "Work", status: "issued", createdAt: stamp, updatedAt: stamp, paymentLinkCode: "aa", transactionHash: null },
    { id: "bill-live", kind: "bill", title: "Ada bill", counterparty: "Ada Contractor", recipient: address, amount: "0.25", dueDate: "2026-11-20", description: "Bill", status: "issued", createdAt: stamp, updatedAt: stamp, paymentLinkCode: null, transactionHash: null },
    { id: "pay-live", kind: "payroll", title: "Ada payroll", counterparty: "Ada Contractor", recipient: address, amount: "0.25", dueDate: "2026-11-20", description: "Pay", status: "draft", createdAt: stamp, updatedAt: stamp, paymentLinkCode: null, transactionHash: null },
  ], address, [{ code: "link-live", title: "Client link", description: "Collect", amount: "0.4", paymentWalletAddress: address, status: "ACTIVE", records: [], createdAt: stamp }]);
  assert.equal(books.transactions.filter(row => row.type === "RECEIVE").length >= 2, true);
  assert.equal(books.monthlyFinancials.some(row => row.month === "2026-11" && row.income >= 0.9 && row.expenses === 0.25 && row.payroll === 0.25), true);
  assert.equal(books.invoiceStats.pendingSent >= 0.5, true);
  assert.equal(books.payrolls.some(row => row.uuid === "pay-live"), true);
});
