import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OneClickOrder, OneClickProgress } from "./oneclick.ts";

export interface SavedOneClickOrder {
  order: OneClickOrder;
  progress: OneClickProgress;
  amountOutUnits: string | null;
  destinationHashes: string[];
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
  }
  get(companyId: string, orderId: string): SavedOneClickOrder | undefined {
    id(companyId, "company ID"); id(orderId, "order ID");
    const row = this.db.prepare("SELECT record FROM intent_orders WHERE company_id=? AND order_id=?").get(companyId, orderId);
    return row ? JSON.parse(String(row.record)) as SavedOneClickOrder : undefined;
  }
  create(order: OneClickOrder): SavedOneClickOrder {
    id(order.companyId, "company ID"); id(order.id, "order ID");
    const saved: SavedOneClickOrder = { order, progress: "awaiting_deposit", amountOutUnits: null, destinationHashes: [], updatedAt: new Date().toISOString() };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.get(order.companyId, order.id);
      if (previous) {
        if (JSON.stringify(previous.order) !== JSON.stringify(order)) throw new Error("Intents order ID belongs to different quote terms");
        this.db.exec("COMMIT"); return previous;
      }
      this.db.prepare("INSERT INTO intent_orders VALUES(?,?,?,?,?,?)").run(order.companyId, order.id, order.correlationId, order.depositAddress, order.depositMemo ?? "", JSON.stringify(saved));
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
      if (rank[status.progress] < rank[current.progress] || rank[current.progress] === 3 ||
        (rank[status.progress] === 3 && status.progress !== "provider_success_unverified" && status.destinationHashes.length)) throw new Error("Intents status cannot replace a later or terminal outcome");
      const next: SavedOneClickOrder = { ...current, ...status, updatedAt: new Date().toISOString() };
      this.db.prepare("UPDATE intent_orders SET record=? WHERE company_id=? AND order_id=?").run(JSON.stringify(next), companyId, orderId);
      this.db.exec("COMMIT"); return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
}

export function openOneClickOrders(): OneClickOrderStore {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new OneClickOrderStore(path);
}
