import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertNearAccountId } from "../near/account-id.ts";
import { parseAmount } from "../near/amount.ts";
import { BusinessRecordRepository } from "./business-records.ts";

export interface ProcurementQuote {
  id: string; companyId: string; recordId: string; supplier: string; recipient: string;
  reference: string; amount: string; receivedDate: string; submittedBy: string; createdAt: string;
}

function validate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Supplier quote is required");
  const row = value as Record<string, unknown>;
  if (typeof row.supplier !== "string" || !row.supplier.trim() || row.supplier.length > 160 ||
    typeof row.reference !== "string" || !row.reference.trim() || row.reference.length > 160 ||
    typeof row.recipient !== "string" || typeof row.amount !== "string" ||
    typeof row.receivedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.receivedDate) ||
    !Number.isFinite(Date.parse(row.receivedDate)) || new Date(row.receivedDate).toISOString().slice(0, 10) !== row.receivedDate)
    throw new Error("Complete supplier, reference, account, amount and date are required");
  assertNearAccountId(row.recipient);
  if (parseAmount(row.amount) <= 0n) throw new Error("Supplier quote amount must be positive");
  return { supplier: row.supplier.trim(), reference: row.reference.trim(), recipient: row.recipient,
    amount: row.amount, receivedDate: row.receivedDate };
}

export class ProcurementQuoteStore {
  private db: DatabaseSync;
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS procurement_quotes(company_id TEXT NOT NULL,record_id TEXT NOT NULL,
        quote_id TEXT NOT NULL,reference TEXT NOT NULL,record TEXT NOT NULL,
        PRIMARY KEY(company_id,record_id,quote_id), UNIQUE(company_id,record_id,reference));`);
  }
  list(companyId: string, recordId: string): ProcurementQuote[] {
    return this.db.prepare("SELECT record FROM procurement_quotes WHERE company_id=? AND record_id=? ORDER BY rowid ASC LIMIT 30")
      .all(companyId, recordId).map(row => JSON.parse(String(row.record)) as ProcurementQuote);
  }
  add(companyId: string, recordId: string, value: unknown, actor: string): ProcurementQuote {
    const input = validate(value);
    const records = new BusinessRecordRepository(this.path);
    let bill;
    try { bill = records.get(companyId, recordId); } finally { records.close(); }
    if (!bill || bill.kind !== "bill" || bill.status !== "draft") throw new Error("Only a draft bill can receive supplier options");
    if (!actor || actor.length > 120) throw new Error("A signed-in submitter is required");
    const previous = this.db.prepare("SELECT record FROM procurement_quotes WHERE company_id=? AND record_id=? AND reference=?")
      .get(companyId, recordId, input.reference);
    if (previous) {
      const existing = JSON.parse(String(previous.record)) as ProcurementQuote;
      if (JSON.stringify({ supplier: existing.supplier, reference: existing.reference, recipient: existing.recipient, amount: existing.amount, receivedDate: existing.receivedDate }) !== JSON.stringify(input))
        throw new Error("Quote reference already belongs to different terms");
      return existing;
    }
    const quote: ProcurementQuote = { id: randomUUID(), companyId, recordId, ...input, submittedBy: actor, createdAt: new Date().toISOString() };
    this.db.prepare("INSERT INTO procurement_quotes VALUES(?,?,?,?,?)").run(companyId, recordId, quote.id, quote.reference, JSON.stringify(quote));
    return quote;
  }
  select(companyId: string, recordId: string, quoteId: string) {
    const row = this.db.prepare("SELECT record FROM procurement_quotes WHERE company_id=? AND record_id=? AND quote_id=?")
        .get(companyId, recordId, quoteId);
    if (!row) throw new Error("Supplier option was not found");
    const quote = JSON.parse(String(row.record)) as ProcurementQuote;
    const records = new BusinessRecordRepository(this.path);
    try {
      const bill = records.get(companyId, recordId);
      if (!bill || bill.kind !== "bill" || bill.status !== "draft") throw new Error("Only a draft bill can select a supplier option");
      return records.updateDraft(companyId, recordId, { ...bill, counterparty: quote.supplier, recipient: quote.recipient,
        amount: quote.amount, supplierQuote: { reference: quote.reference, amount: quote.amount, receivedDate: quote.receivedDate } });
    } finally { records.close(); }
  }
  close() { this.db.close(); }
}

export function openProcurementQuotes() {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new ProcurementQuoteStore(path);
}
