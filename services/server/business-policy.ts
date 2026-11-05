import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseAmount } from "../near/amount.ts";

export type BusinessBudgetKind = "treasury" | "inference";
export interface BusinessPolicy {
  aiProvider: "azure" | "near_ai";
  stopped: boolean;
  allowAutonomousDrafts: boolean;
  allowAutonomousPayments: boolean;
  maxSinglePaymentUsdc: string;
  maxDailyTreasuryUsdc: string;
  maxDailyInferenceUsd: string;
  revision: number;
}

const initialPolicy: BusinessPolicy = {
  aiProvider: "azure",
  stopped: true,
  allowAutonomousDrafts: false,
  allowAutonomousPayments: false,
  maxSinglePaymentUsdc: "0",
  maxDailyTreasuryUsdc: "0",
  maxDailyInferenceUsd: "0",
  revision: 0,
};

function amount(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 40) throw new Error(`${name} must be a decimal amount`);
  parseAmount(value, 6);
  return value;
}

export function validateBusinessPolicy(value: unknown): Omit<BusinessPolicy, "revision"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Business policy is required");
  const input = value as Record<string, unknown>;
  const fields = ["stopped", "allowAutonomousDrafts", "allowAutonomousPayments", "maxSinglePaymentUsdc", "maxDailyTreasuryUsdc", "maxDailyInferenceUsd"];
  if (Object.keys(input).length < fields.length || Object.keys(input).length > fields.length + 1 || Object.keys(input).some(key => ![...fields, "aiProvider"].includes(key)) || fields.some(key => !(key in input))) throw new Error("Complete business policy settings are required");
  if (input.aiProvider !== undefined && input.aiProvider !== "azure" && input.aiProvider !== "near_ai") throw new Error("Unsupported AI provider");
  for (const key of fields.slice(0, 3)) if (typeof input[key] !== "boolean") throw new Error(`${key} must be a boolean`);
  const single = amount(input.maxSinglePaymentUsdc, "Single payment limit");
  const treasury = amount(input.maxDailyTreasuryUsdc, "Daily treasury limit");
  const inference = amount(input.maxDailyInferenceUsd, "Daily inference limit");
  if (parseAmount(single, 6) > parseAmount(treasury, 6)) throw new Error("Single payment limit exceeds the daily treasury limit");
  return {
    aiProvider: (input.aiProvider as BusinessPolicy["aiProvider"] | undefined) ?? "azure",
    stopped: input.stopped as boolean,
    allowAutonomousDrafts: input.allowAutonomousDrafts as boolean,
    allowAutonomousPayments: input.allowAutonomousPayments as boolean,
    maxSinglePaymentUsdc: single,
    maxDailyTreasuryUsdc: treasury,
    maxDailyInferenceUsd: inference,
  };
}

function validId(value: string, name: string): void {
  if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) throw new Error(`Invalid ${name}`);
}

export class BusinessPolicyStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS business_policy(company_id TEXT PRIMARY KEY, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS business_budget_reservations(
        company_id TEXT NOT NULL, reservation_id TEXT NOT NULL, kind TEXT NOT NULL,
        utc_day TEXT NOT NULL, amount_units TEXT NOT NULL, policy_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(company_id,reservation_id));
      CREATE INDEX IF NOT EXISTS business_budget_day ON business_budget_reservations(company_id,kind,utc_day);
      CREATE TABLE IF NOT EXISTS business_policy_events(
        id INTEGER PRIMARY KEY, company_id TEXT NOT NULL, actor TEXT NOT NULL,
        event TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS business_inference_charges(
        company_id TEXT NOT NULL, reservation_id TEXT NOT NULL, response_id TEXT NOT NULL UNIQUE,
        actual_units TEXT NOT NULL, recorded_at TEXT NOT NULL,
        PRIMARY KEY(company_id,reservation_id));
    `);
  }
  get(company: string): BusinessPolicy {
    validId(company, "company");
    const row = this.db.prepare("SELECT record FROM business_policy WHERE company_id=?").get(company);
    return row ? { ...initialPolicy, ...(JSON.parse(String(row.record)) as BusinessPolicy) } : { ...initialPolicy };
  }
  update(company: string, input: unknown, expectedRevision: number, actor: string): BusinessPolicy {
    validId(company, "company"); validId(actor, "actor");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Current policy revision is required");
    const value = validateBusinessPolicy(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.get(company);
      if (current.revision !== expectedRevision) throw new Error("Business policy changed; reload before saving");
      const next = { ...value, revision: current.revision + 1 };
      this.db.prepare("INSERT INTO business_policy VALUES(?,?) ON CONFLICT(company_id) DO UPDATE SET record=excluded.record").run(company, JSON.stringify(next));
      this.db.prepare("INSERT INTO business_policy_events(company_id,actor,event,revision,created_at) VALUES(?,?,?,?,?)").run(company, actor, "policy_updated", next.revision, new Date().toISOString());
      this.db.exec("COMMIT");
      return next;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  reserve(company: string, reservationId: string, kind: BusinessBudgetKind, amountDecimal: string, expectedRevision: number, now = new Date()) {
    validId(company, "company"); validId(reservationId, "reservation");
    if (kind !== "treasury" && kind !== "inference") throw new Error("Unknown business budget");
    const units = parseAmount(amountDecimal, 6);
    if (units <= 0n) throw new Error("A positive budget amount is required");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Current policy revision is required");
    const day = now.toISOString().slice(0, 10);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db.prepare("SELECT kind,utc_day,amount_units,policy_revision FROM business_budget_reservations WHERE company_id=? AND reservation_id=?").get(company, reservationId);
      if (previous) {
        if (previous.kind !== kind || previous.utc_day !== day || previous.amount_units !== units.toString() || Number(previous.policy_revision) !== expectedRevision) throw new Error("Reservation ID belongs to different terms");
        this.db.exec("COMMIT");
        return { reservationId, kind, utcDay: day, amountUnits: units.toString(), policyRevision: expectedRevision, existing: true };
      }
      const policy = this.get(company);
      if (policy.stopped || policy.revision !== expectedRevision) throw new Error("Business policy is stopped or changed");
      if (kind === "treasury" && (!policy.allowAutonomousPayments || units > parseAmount(policy.maxSinglePaymentUsdc, 6))) throw new Error("Autonomous payment is not permitted by policy");
      const limit = parseAmount(kind === "treasury" ? policy.maxDailyTreasuryUsdc : policy.maxDailyInferenceUsd, 6);
      const rows = this.db.prepare("SELECT amount_units FROM business_budget_reservations WHERE company_id=? AND kind=? AND utc_day=?").all(company, kind, day);
      const committed = rows.reduce<bigint>((total, row) => total + BigInt(String(row.amount_units)), 0n);
      if (committed + units > limit) throw new Error("Daily business budget would be exceeded");
      this.db.prepare("INSERT INTO business_budget_reservations VALUES(?,?,?,?,?,?,?)").run(company, reservationId, kind, day, units.toString(), policy.revision, new Date().toISOString());
      this.db.exec("COMMIT");
      return { reservationId, kind, utcDay: day, amountUnits: units.toString(), policyRevision: policy.revision, existing: false };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  events(company: string) {
    validId(company, "company");
    return this.db.prepare("SELECT actor,event,revision,created_at FROM business_policy_events WHERE company_id=? ORDER BY id DESC LIMIT 100").all(company);
  }
  recordInferenceCharge(company: string, reservationId: string, responseId: string, actualUsd: string) {
    validId(company, "company"); validId(reservationId, "reservation"); validId(responseId, "response");
    const actualUnits = parseAmount(amount(actualUsd, "Inference charge"), 6);
    if (actualUnits < 0n) throw new Error("Inference charge cannot be negative");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reserved = this.db.prepare("SELECT kind,amount_units FROM business_budget_reservations WHERE company_id=? AND reservation_id=?").get(company, reservationId);
      if (!reserved || reserved.kind !== "inference" || actualUnits > BigInt(String(reserved.amount_units))) throw new Error("Inference charge has no sufficient reservation");
      const previous = this.db.prepare("SELECT response_id,actual_units,recorded_at FROM business_inference_charges WHERE company_id=? AND reservation_id=?").get(company, reservationId);
      if (previous) {
        if (previous.response_id !== responseId || previous.actual_units !== actualUnits.toString()) throw new Error("Inference charge ID belongs to different terms");
        this.db.exec("COMMIT");
        return { companyId: company, reservationId, responseId, actualUnits: actualUnits.toString(), recordedAt: String(previous.recorded_at), existing: true };
      }
      const recordedAt = new Date().toISOString();
      this.db.prepare("INSERT INTO business_inference_charges VALUES(?,?,?,?,?)").run(company, reservationId, responseId, actualUnits.toString(), recordedAt);
      this.db.exec("COMMIT");
      return { companyId: company, reservationId, responseId, actualUnits: actualUnits.toString(), recordedAt, existing: false };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  inferenceCharges(company: string) {
    validId(company, "company");
    return this.db.prepare("SELECT reservation_id,response_id,actual_units,recorded_at FROM business_inference_charges WHERE company_id=? ORDER BY recorded_at DESC LIMIT 100").all(company);
  }
  close() { this.db.close(); }
}

export function openBusinessPolicy() {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new BusinessPolicyStore(path);
}
