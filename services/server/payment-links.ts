import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseAmount } from "../near/amount.ts";
import { assertNearAccountId, isNearTransactionHash } from "../near/account-id.ts";
import { getNearNetwork, type NearNetworkId } from "../near/network.ts";

export interface BusinessPaymentLink {
  id: number;
  code: string;
  title: string;
  description: string;
  amount: string;
  paymentWalletAddress: string;
  status: "ACTIVE" | "DEACTIVATED";
  order: number;
  acceptedTokens: { symbol: string; name: string; address: string; decimals: number }[];
  acceptedChains: { name: string; networkId: NearNetworkId }[];
  company: { companyName: string; companyLogo: string };
  records: { id: number; payer: string; payerName: null; paymentMethod: "crypto" | "card"; txid: string; createdAt: string; updatedAt: string }[];
  createdAt: string;
  updatedAt: string;
  singleUse?: boolean;
  managed?: boolean;
}

export function validatePaymentLink(input: unknown) {
  if (typeof input !== "object" || input === null) throw new Error("Payment link details are required");
  const value = input as Record<string, unknown>;
  if (value.acceptedTokens !== undefined && (!Array.isArray(value.acceptedTokens) || value.acceptedTokens.length !== 1 || value.acceptedTokens.some(token => typeof token !== "object" || token === null || !("symbol" in token) || token.symbol !== "USDC"))) throw new Error("Only USDC payments are supported");
  if (value.acceptedChains !== undefined && (!Array.isArray(value.acceptedChains) || value.acceptedChains.length !== 1 || value.acceptedChains.some(chain => typeof chain !== "object" || chain === null || !("networkId" in chain) || chain.networkId !== getNearNetwork().networkId))) throw new Error("Only the configured NEAR network is supported");
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 160) throw new Error("A title of up to 160 characters is required");
  if (typeof value.description !== "string" || value.description.length > 4000) throw new Error("Description must be at most 4000 characters");
  if (typeof value.amount !== "string" || parseAmount(value.amount) <= 0n) throw new Error("A positive USDC amount is required");
  assertNearAccountId(value.paymentWalletAddress);
  return { title: value.title.trim(), description: value.description, amount: value.amount, paymentWalletAddress: value.paymentWalletAddress };
}

export class PaymentLinkRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS business_payment_links (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS business_link_payments (id INTEGER PRIMARY KEY, code TEXT NOT NULL, hash TEXT UNIQUE NOT NULL, payer TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS business_link_history ON business_link_payments(code,id);`);
  }

  create(input: unknown, code: string = randomUUID(), options: { singleUse?: boolean; managed?: boolean } = {}): BusinessPaymentLink {
    const details = validatePaymentLink(input);
    const existing = this.get(code);
    if (existing) {
      if (existing.amount !== details.amount || existing.paymentWalletAddress !== details.paymentWalletAddress) throw new Error("Payment link identity conflicts with its existing details");
      return existing;
    }
    const now = new Date().toISOString();
    const link: BusinessPaymentLink = {
      ...details, ...options, id: 0, code, status: "ACTIVE", order: 0,
      acceptedTokens: [{ name: "USDC", symbol: "USDC", address: getNearNetwork().usdcContractId, decimals: 6 }],
      acceptedChains: [{ name: getNearNetwork().name, networkId: getNearNetwork().networkId }],
      company: { companyName: "Settlbox", companyLogo: "/logo/settlbox-icon.svg" }, records: [], createdAt: now, updatedAt: now,
    };
    this.database.prepare("INSERT OR IGNORE INTO business_payment_links(code,record) VALUES(?,?)").run(link.code, JSON.stringify(link));
    return this.get(link.code)!;
  }

  get(code: string): BusinessPaymentLink | undefined {
    const row = this.database.prepare("SELECT id,record FROM business_payment_links WHERE code=?").get(code);
    if (!row || typeof row.record !== "string") return undefined;
    const link = JSON.parse(row.record) as BusinessPaymentLink;
    const records = this.database.prepare("SELECT id,hash,payer,created_at FROM business_link_payments WHERE code=? ORDER BY id DESC").all(code);
    return { ...link, status: records.length && (link.singleUse || this.isInvoiceLink(code)) ? "DEACTIVATED" : link.status, id: Number(row.id), records: records.map(record => ({ id: Number(record.id), payer: String(record.payer), payerName: null, paymentMethod: "crypto", txid: String(record.hash), createdAt: String(record.created_at), updatedAt: String(record.created_at) })) };
  }

  list(paymentWalletAddress?: string): BusinessPaymentLink[] {
    if (paymentWalletAddress) assertNearAccountId(paymentWalletAddress);
    const rows = paymentWalletAddress
      ? this.database.prepare("SELECT code FROM business_payment_links WHERE json_extract(record,'$.paymentWalletAddress')=? ORDER BY json_extract(record,'$.order'),id DESC LIMIT 500").all(paymentWalletAddress)
      : this.database.prepare("SELECT code FROM business_payment_links ORDER BY json_extract(record,'$.order'),id DESC LIMIT 500").all();
    return rows.map(row => this.get(String(row.code))!);
  }

  update(code: string, input: unknown): BusinessPaymentLink {
    this.requireIndependentLink(code);
    const link = this.get(code);
    if (!link) throw new Error("Payment link not found");
    if (typeof input !== "object" || input === null) throw new Error("Payment link details are required");
    const value = input as Record<string, unknown>;
    const details = validatePaymentLink({ ...link, ...value, paymentWalletAddress: link.paymentWalletAddress });
    const status = value.status ?? link.status;
    if (status !== "ACTIVE" && status !== "DEACTIVATED") throw new Error("Invalid payment link status");
    if (link.records.length && details.amount !== link.amount) throw new Error("A paid link's amount cannot be changed");
    const result = this.database.prepare("UPDATE business_payment_links SET record=? WHERE code=? AND (json_extract(record,'$.amount')=? OR NOT EXISTS(SELECT 1 FROM business_link_payments WHERE code=?))").run(JSON.stringify({ ...link, ...details, status, updatedAt: new Date().toISOString() }), code, details.amount, code);
    if (Number(result.changes) !== 1) throw new Error("Payment link changed during update");
    return this.get(code)!;
  }

  record(code: string, hash: string, payer: string, expectedAmount: string): BusinessPaymentLink {
    if (!isNearTransactionHash(hash)) throw new Error("Invalid native NEAR transaction hash");
    assertNearAccountId(payer);
    this.database.exec("BEGIN IMMEDIATE");
    try {
    const previous = this.database.prepare("SELECT code FROM business_link_payments WHERE hash=?").get(hash);
    if (previous && previous.code !== code) throw new Error("Transaction already belongs to another payment link");
    const link = this.get(code);
    if (!link) throw new Error("Payment link not found");
    if (previous) { this.database.exec("COMMIT"); return link; }
    if (link.amount !== expectedAmount) throw new Error("Payment link changed during verification");
    if (link.status !== "ACTIVE") throw new Error("Payment link is inactive");
    this.database.prepare("INSERT INTO business_link_payments(code,hash,payer,created_at) VALUES(?,?,?,?)").run(code, hash, payer, new Date().toISOString());
    this.database.exec("COMMIT");
    return this.get(code)!;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  recordVerifiedIntent(code: string, orderId: string, hash: string): BusinessPaymentLink {
    if (!isNearTransactionHash(hash) || !orderId.startsWith(`${code}:`)) throw new Error("Intents order identity is invalid");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const evidence = this.database.prepare("SELECT v.amount_units,v.recipient,o.record FROM intent_verified_destinations v JOIN intent_orders o ON o.company_id=v.company_id AND o.order_id=v.order_id WHERE v.order_id=? AND v.transaction_hash=?").get(orderId, hash);
      const saved = evidence ? JSON.parse(String(evidence.record)) as { order?: { refundTo?: string; recipient?: string; minimumOutputUnits?: string; destinationAsset?: string } } : undefined;
      const link = this.get(code);
      if (!evidence || !saved?.order || !link || link.acceptedChains[0]?.networkId !== "mainnet" ||
        evidence.recipient !== link.paymentWalletAddress || saved.order.recipient !== link.paymentWalletAddress ||
        saved.order.minimumOutputUnits !== parseAmount(link.amount).toString() ||
        saved.order.destinationAsset !== `nep141:${link.acceptedTokens[0]?.address}` ||
        BigInt(String(evidence.amount_units)) < parseAmount(link.amount) ||
        typeof saved.order.refundTo !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(saved.order.refundTo)) throw new Error("Verified Intents settlement does not match this payment link");
      const previous = this.database.prepare("SELECT code FROM business_link_payments WHERE hash=?").get(hash);
      if (previous) {
        if (previous.code !== code) throw new Error("Transaction already belongs to another payment link");
        this.database.exec("COMMIT"); return link;
      }
      if (link.status !== "ACTIVE") throw new Error("Payment link is inactive");
      this.database.prepare("INSERT INTO business_link_payments(code,hash,payer,created_at) VALUES(?,?,?,?)").run(code, hash, `base:${saved.order.refundTo.toLowerCase()}`, new Date().toISOString());
      this.database.exec("COMMIT"); return this.get(code)!;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  close() { this.database.close(); }

  private isInvoiceLink(code: string): boolean {
    return !!this.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='business_records'").get() && !!this.database.prepare("SELECT 1 FROM business_records WHERE kind='invoice' AND (id=? OR json_extract(record,'$.paymentLinkCode')=?) LIMIT 1").get(code, code);
  }

  private requireIndependentLink(code: string) {
    if (this.get(code)?.managed) throw new Error("Manage this payment link through its collection");
    if (this.isInvoiceLink(code)) throw new Error("Manage this payment link through its invoice");
  }

  delete(codes: string[], paymentWalletAddress?: string) {
    if (paymentWalletAddress) assertNearAccountId(paymentWalletAddress);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (paymentWalletAddress && codes.some(code => this.get(code)?.paymentWalletAddress !== paymentWalletAddress)) throw new Error("Payment link does not belong to this workspace");
      codes.forEach(code => this.requireIndependentLink(code));
      if (codes.some(code => this.get(code)?.records.length)) throw new Error("Paid links must be deactivated to retain their payment history");
      let deletedCount = 0;
      for (const code of codes) deletedCount += Number(this.database.prepare("DELETE FROM business_payment_links WHERE code=?").run(code).changes);
      this.database.exec("COMMIT");
      return deletedCount;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  reorder(ids: number[], paymentWalletAddress?: string) {
    if (paymentWalletAddress) assertNearAccountId(paymentWalletAddress);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (paymentWalletAddress) {
        const permitted = new Set(this.list(paymentWalletAddress).map(link => link.id));
        if (ids.some(id => !permitted.has(id))) throw new Error("Payment link does not belong to this workspace");
      }
      ids.forEach((id, order) => this.database.prepare("UPDATE business_payment_links SET record=json_set(record,'$.order',?) WHERE id=?").run(order, id));
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

// Public checkout exposes settlement proof without disclosing payer history.
export function publicPaymentLink(link: BusinessPaymentLink) {
  const latest = link.records[0];
  return {
    ...link,
    records: [],
    settlement: link.status === "DEACTIVATED" && latest
      ? { status: "confirmed" as const, transactionHash: latest.txid, confirmedAt: latest.createdAt }
      : null,
  };
}

export function openPaymentLinks() {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new PaymentLinkRepository(path);
}
