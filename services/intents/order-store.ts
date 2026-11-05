import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OneClickOrder, OneClickProgress } from "./oneclick.ts";
import { isNearTransactionHash } from "../near/account-id.ts";

export interface SavedOneClickOrder {
  order: OneClickOrder;
  progress: OneClickProgress;
  amountOutUnits: string | null;
  destinationHashes: string[];
  verifiedDestination: { transactionHash: string; amountUnits: string; recipient: string; verifiedAt: string } | null;
  verifiedRefund: { transactionHash: string; amountUnits: string; verifiedAt: string } | null;
  bookedAt: string | null;
  updatedAt: string;
}

function id(value: string, name: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) throw new Error(`Invalid ${name}`);
}

const rank: Record<OneClickProgress, number> = {
  awaiting_deposit: 0, deposit_seen: 1, processing: 2, incomplete_deposit: 2,
  provider_success_unverified: 3, refunded: 3, failed: 3,
};

export class OneClickOrderStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS intent_orders(
        company_id TEXT NOT NULL, order_id TEXT NOT NULL, correlation_id TEXT NOT NULL UNIQUE,
        deposit_address TEXT NOT NULL, deposit_memo TEXT NOT NULL, record TEXT NOT NULL,
        UNIQUE(deposit_address,deposit_memo),
        PRIMARY KEY(company_id,order_id));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS intent_verified_destinations(
      transaction_hash TEXT PRIMARY KEY, company_id TEXT NOT NULL, order_id TEXT NOT NULL,
      amount_units TEXT NOT NULL, recipient TEXT NOT NULL, verified_at TEXT NOT NULL,
      UNIQUE(company_id,order_id));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS intent_verified_refunds(
      transaction_hash TEXT PRIMARY KEY, company_id TEXT NOT NULL, order_id TEXT NOT NULL,
      amount_units TEXT NOT NULL, verified_at TEXT NOT NULL, UNIQUE(company_id,order_id));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS intent_quote_attempts(
      company_id TEXT NOT NULL, link_code TEXT NOT NULL, created_at_ms INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS intent_quote_attempt_window ON intent_quote_attempts(company_id,link_code,created_at_ms);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS intent_order_events(
      id INTEGER PRIMARY KEY, company_id TEXT NOT NULL, order_id TEXT NOT NULL,
      status TEXT NOT NULL, transaction_hash TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS intent_order_timeline ON intent_order_events(company_id,order_id,id);`);
  }
  reserveQuoteAttempt(companyId: string, linkCode: string, now = Date.now()): void {
    id(companyId, "company ID"); id(linkCode, "payment link code");
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid quote time");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM intent_quote_attempts WHERE created_at_ms<?").run(now - 60_000);
      const count = this.db.prepare("SELECT COUNT(*) AS total FROM intent_quote_attempts WHERE company_id=? AND link_code=? AND created_at_ms>=?").get(companyId, linkCode, now - 60_000);
      if (Number(count?.total) >= 5) throw new Error("Too many checkout quotes; retry in one minute");
      this.db.prepare("INSERT INTO intent_quote_attempts VALUES(?,?,?)").run(companyId, linkCode, now);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  get(companyId: string, orderId: string): SavedOneClickOrder | undefined {
    id(companyId, "company ID"); id(orderId, "order ID");
    const row = this.db.prepare("SELECT record FROM intent_orders WHERE company_id=? AND order_id=?").get(companyId, orderId);
    return row ? JSON.parse(String(row.record)) as SavedOneClickOrder : undefined;
  }
  pending(companyId: string, limit = 30): SavedOneClickOrder[] {
    id(companyId, "company ID");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid pending order limit");
    return this.db.prepare("SELECT record FROM intent_orders WHERE company_id=? AND json_extract(record,'$.progress')!='failed' ORDER BY rowid ASC LIMIT ?")
      .all(companyId, limit).map(row => JSON.parse(String(row.record)) as SavedOneClickOrder)
      .filter(row => !row.bookedAt && (row.progress !== "refunded" || !row.verifiedRefund));
  }
  create(order: OneClickOrder): SavedOneClickOrder {
    id(order.companyId, "company ID"); id(order.id, "order ID");
    const saved: SavedOneClickOrder = { order, progress: "awaiting_deposit", amountOutUnits: null, destinationHashes: [], verifiedDestination: null, verifiedRefund: null, bookedAt: null, updatedAt: new Date().toISOString() };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.get(order.companyId, order.id);
      if (previous) {
        if (JSON.stringify(previous.order) !== JSON.stringify(order)) throw new Error("Intents order ID belongs to different quote terms");
        this.db.exec("COMMIT"); return previous;
      }
      this.db.prepare("INSERT INTO intent_orders VALUES(?,?,?,?,?,?)").run(order.companyId, order.id, order.correlationId, order.depositAddress, order.depositMemo ?? "", JSON.stringify(saved));
      this.db.prepare("INSERT INTO intent_order_events(company_id,order_id,status,transaction_hash,created_at) VALUES(?,?,?,?,?)")
        .run(order.companyId, order.id, "awaiting_deposit", null, saved.updatedAt);
      this.db.exec("COMMIT"); return saved;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  update(companyId: string, orderId: string, status: Pick<SavedOneClickOrder, "progress" | "amountOutUnits" | "destinationHashes">): SavedOneClickOrder {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(companyId, orderId);
      if (!current) throw new Error("Intents order was not found");
      if (!(status.progress in rank) || !Array.isArray(status.destinationHashes) || status.destinationHashes.some(hash => typeof hash !== "string" || !hash)) throw new Error("Invalid Intents status");
      if (status.amountOutUnits !== null && (typeof status.amountOutUnits !== "string" || !/^\d{1,78}$/.test(status.amountOutUnits))) throw new Error("Invalid Intents output amount");
      if (status.progress === "provider_success_unverified" && (!status.amountOutUnits || BigInt(status.amountOutUnits) < BigInt(current.order.minimumOutputUnits) || !status.destinationHashes.length)) throw new Error("Provider success needs sufficient destination evidence");
      if (status.progress === current.progress && JSON.stringify(status) === JSON.stringify({ progress: current.progress, amountOutUnits: current.amountOutUnits, destinationHashes: current.destinationHashes })) { this.db.exec("COMMIT"); return current; }
      if (rank[status.progress] < rank[current.progress] || current.verifiedDestination || current.verifiedRefund ||
        (rank[current.progress] === 3 && !(current.progress === "provider_success_unverified" && ["refunded", "failed"].includes(status.progress))) ||
        (rank[status.progress] === 3 && status.progress !== "provider_success_unverified" && status.destinationHashes.length)) throw new Error("Intents status cannot replace a later or terminal outcome");
      const next: SavedOneClickOrder = { ...current, ...status, updatedAt: new Date().toISOString() };
      this.db.prepare("UPDATE intent_orders SET record=? WHERE company_id=? AND order_id=?").run(JSON.stringify(next), companyId, orderId);
      if (status.progress !== current.progress) this.db.prepare("INSERT INTO intent_order_events(company_id,order_id,status,transaction_hash,created_at) VALUES(?,?,?,?,?)")
        .run(companyId, orderId, status.progress, null, next.updatedAt);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  recordVerifiedDestination(companyId: string, orderId: string, proof: { transactionHash: string; amountUnits: string; recipient: string }): SavedOneClickOrder {
    if (!isNearTransactionHash(proof.transactionHash) || !/^[1-9]\d{0,77}$/.test(proof.amountUnits)) throw new Error("Invalid final destination proof");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(companyId, orderId);
      if (!current || current.progress !== "provider_success_unverified" || !current.destinationHashes.includes(proof.transactionHash) ||
        proof.recipient !== current.order.recipient || BigInt(proof.amountUnits) < BigInt(current.order.minimumOutputUnits) ||
        !current.amountOutUnits || BigInt(proof.amountUnits) < BigInt(current.amountOutUnits)) throw new Error("Final destination proof does not match this order");
      if (current.verifiedDestination) {
        if (current.verifiedDestination.transactionHash !== proof.transactionHash || current.verifiedDestination.amountUnits !== proof.amountUnits || current.verifiedDestination.recipient !== proof.recipient) throw new Error("Order already has different destination proof");
        this.db.exec("COMMIT"); return current;
      }
      const verifiedAt = new Date().toISOString();
      this.db.prepare("INSERT INTO intent_verified_destinations VALUES(?,?,?,?,?,?)").run(proof.transactionHash, companyId, orderId, proof.amountUnits, proof.recipient, verifiedAt);
      const next = { ...current, verifiedDestination: { ...proof, verifiedAt }, updatedAt: verifiedAt };
      this.db.prepare("UPDATE intent_orders SET record=? WHERE company_id=? AND order_id=?").run(JSON.stringify(next), companyId, orderId);
      this.db.prepare("INSERT INTO intent_order_events(company_id,order_id,status,transaction_hash,created_at) VALUES(?,?,?,?,?)")
        .run(companyId, orderId, "confirmed", proof.transactionHash, verifiedAt);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  recordVerifiedRefund(companyId: string, orderId: string, proof: { transactionHash: string; amountUnits: string }): SavedOneClickOrder {
    if (!/^0x[a-fA-F0-9]{64}$/.test(proof.transactionHash) || !/^[1-9]\d{0,77}$/.test(proof.amountUnits)) throw new Error("Invalid Base refund proof");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(companyId, orderId);
      if (!current || current.progress !== "refunded" || current.verifiedDestination) throw new Error("Refund proof does not belong to a refunded order");
      if (current.verifiedRefund) {
        if (current.verifiedRefund.transactionHash !== proof.transactionHash || current.verifiedRefund.amountUnits !== proof.amountUnits) throw new Error("Order already has different refund proof");
        this.db.exec("COMMIT"); return current;
      }
      const verifiedAt = new Date().toISOString();
      this.db.prepare("INSERT INTO intent_verified_refunds VALUES(?,?,?,?,?)").run(proof.transactionHash, companyId, orderId, proof.amountUnits, verifiedAt);
      const next = { ...current, verifiedRefund: { ...proof, verifiedAt }, updatedAt: verifiedAt };
      this.db.prepare("UPDATE intent_orders SET record=? WHERE company_id=? AND order_id=?").run(JSON.stringify(next), companyId, orderId);
      this.db.prepare("INSERT INTO intent_order_events(company_id,order_id,status,transaction_hash,created_at) VALUES(?,?,?,?,?)")
        .run(companyId, orderId, "refund_verified", proof.transactionHash, verifiedAt);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  markBooked(companyId: string, orderId: string): SavedOneClickOrder {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(companyId, orderId);
      if (!current?.verifiedDestination || current.verifiedRefund) throw new Error("Only a verified destination may be booked");
      const code = orderId.split(":", 1)[0];
      if (!this.db.prepare("SELECT 1 FROM business_link_payments WHERE code=? AND hash=?").get(code, current.verifiedDestination.transactionHash))
        throw new Error("Verified payment link booking is missing");
      if (current.bookedAt) { this.db.exec("COMMIT"); return current; }
      const now = new Date().toISOString();
      const next = { ...current, bookedAt: now, updatedAt: now };
      this.db.prepare("UPDATE intent_orders SET record=? WHERE company_id=? AND order_id=?").run(JSON.stringify(next), companyId, orderId);
      this.db.prepare("INSERT INTO intent_order_events(company_id,order_id,status,transaction_hash,created_at) VALUES(?,?,?,?,?)")
        .run(companyId, orderId, "sale_recorded", current.verifiedDestination.transactionHash, now);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  timeline(companyId: string, orderId: string): { status: string; transactionHash: string | null; createdAt: string }[] {
    id(companyId, "company ID"); id(orderId, "order ID");
    return this.db.prepare("SELECT status,transaction_hash AS transactionHash,created_at AS createdAt FROM intent_order_events WHERE company_id=? AND order_id=? ORDER BY id ASC LIMIT 100")
      .all(companyId, orderId) as { status: string; transactionHash: string | null; createdAt: string }[];
  }
  close() { this.db.close(); }
}

export function openOneClickOrders(): OneClickOrderStore {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new OneClickOrderStore(path);
}
