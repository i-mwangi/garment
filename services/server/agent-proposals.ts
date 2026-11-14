import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentOperation, AgentProposal } from "../../types/agent-operation.ts";

function stored(proposal: AgentProposal): string {
  const { timeline: _timeline, ...record } = proposal;
  return JSON.stringify(record);
}

// Approval binds to immutable server-side arguments, never an edited browser payload.
export class AgentProposalRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS agent_proposals(company TEXT NOT NULL,principal TEXT NOT NULL,id TEXT PRIMARY KEY,turn_id TEXT NOT NULL,state TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(company,principal,turn_id));
      CREATE TABLE IF NOT EXISTS agent_proposal_events(id INTEGER PRIMARY KEY,company TEXT NOT NULL,principal TEXT NOT NULL,proposal_id TEXT NOT NULL,state TEXT NOT NULL,at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS agent_proposal_event_lookup ON agent_proposal_events(company,principal,proposal_id,id);
      CREATE TRIGGER IF NOT EXISTS agent_proposal_created AFTER INSERT ON agent_proposals BEGIN
        INSERT INTO agent_proposal_events(company,principal,proposal_id,state,at) VALUES(NEW.company,NEW.principal,NEW.id,NEW.state,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      END;
      CREATE TRIGGER IF NOT EXISTS agent_proposal_changed AFTER UPDATE OF state ON agent_proposals WHEN OLD.state<>NEW.state BEGIN
        INSERT INTO agent_proposal_events(company,principal,proposal_id,state,at) VALUES(NEW.company,NEW.principal,NEW.id,NEW.state,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      END;`);
  }
  private withTimeline(company: string, principal: string, proposal: AgentProposal): AgentProposal {
    const rows = this.db.prepare("SELECT state,at FROM agent_proposal_events WHERE company=? AND principal=? AND proposal_id=? ORDER BY id").all(company, principal, proposal.id);
    return { ...proposal, timeline: rows.map(row => ({ status: String(row.state) as AgentProposal["status"], at: String(row.at) })) };
  }
  get(company: string, principal: string, id: string): AgentProposal | undefined {
    const row = this.db.prepare("SELECT record FROM agent_proposals WHERE company=? AND principal=? AND id=?").get(company, principal, id);
    return row ? this.withTimeline(company, principal, JSON.parse(String(row.record))) : undefined;
  }
  list(company: string, principal: string): AgentProposal[] {
    return this.db.prepare("SELECT record FROM agent_proposals WHERE company=? AND principal=? ORDER BY rowid DESC LIMIT 30").all(company, principal).map(row => this.withTimeline(company, principal, JSON.parse(String(row.record))));
  }
  pendingExternal(company: string, principal: string): AgentProposal[] {
    return this.db.prepare("SELECT record FROM agent_proposals WHERE company=? AND principal=? AND state='pending' AND turn_id LIKE 'mcp:%' ORDER BY rowid DESC LIMIT 100").all(company, principal).map(row => this.withTimeline(company, principal, JSON.parse(String(row.record))));
  }
  prepare(company: string, principal: string, turnId: string, operation: AgentOperation, before?: unknown) {
    const existing = this.db.prepare("SELECT record FROM agent_proposals WHERE company=? AND principal=? AND turn_id=?").get(company, principal, turnId);
    if (existing) {
      const proposal = JSON.parse(String(existing.record)) as AgentProposal;
      if (JSON.stringify(proposal.operation) !== JSON.stringify(operation)) throw new Error("This message already has a different proposal");
      return this.withTimeline(company, principal, proposal);
    }
    for (const expired of this.list(company, principal).filter(item => item.status === "pending" && Date.parse(item.expiresAt) <= Date.now())) this.cancel(company, principal, expired.id);
    const outstanding = this.db.prepare("SELECT record FROM agent_proposals WHERE company=? AND principal=? AND state IN ('pending','running','awaiting_signature','uncertain')").all(company, principal).map(row => JSON.parse(String(row.record)) as AgentProposal);
    // Never reuse an expired review. In particular, an awaiting_signature
    // proposal may remain in the journal after its wallet challenge expires;
    // returning it would make every retry show the same expired dialog.
    const unresolved = outstanding.find(item => Date.parse(item.expiresAt) > Date.now() && JSON.stringify(item.operation) === JSON.stringify(operation));
    if (unresolved) return this.withTimeline(company, principal, unresolved);
    if (outstanding.length >= 100) throw new Error("Resolve or dismiss pending reviews before preparing more actions");
    const record: AgentProposal = { id: randomUUID(), turnId, operation, before, status: "pending", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60000).toISOString() };
    this.db.prepare("INSERT INTO agent_proposals VALUES(?,?,?,?,?,?)").run(company, principal, record.id, turnId, record.status, JSON.stringify(record));
    return this.get(company, principal, record.id)!;
  }
  claim(company: string, principal: string, id: string) {
    const record = this.get(company, principal, id);
    if (!record) throw new Error("Proposal not found");
    if (record.status !== "pending") throw new Error("This action was already handled. Check its saved result before trying again.");
    if (Date.parse(record.expiresAt) <= Date.now()) throw new Error("This review expired. Ask again for current details.");
    const next = { ...record, status: "running" as const };
    const changed = this.db.prepare("UPDATE agent_proposals SET state=?,record=? WHERE company=? AND principal=? AND id=? AND state='pending'").run(next.status, stored(next), company, principal, id);
    if (changed.changes !== 1) throw new Error("This action is already being handled");
    return this.get(company, principal, id)!;
  }
  finish(company: string, principal: string, id: string, status: "completed" | "failed" | "uncertain" | "awaiting_signature", result?: unknown, error?: string) {
    const record = this.get(company, principal, id);
    if (!record) throw new Error("Proposal not found");
    const next = { ...record, status, result, error };
    const changed = this.db.prepare("UPDATE agent_proposals SET state=?,record=? WHERE company=? AND principal=? AND id=? AND state IN ('running','awaiting_signature')").run(status, stored(next), company, principal, id);
    if (changed.changes !== 1) throw new Error("Action state changed");
    return this.get(company, principal, id)!;
  }
  cancel(company: string, principal: string, id: string) {
    const record = this.get(company, principal, id);
    if (!record || record.status !== "pending") throw new Error("Only a pending proposal can be dismissed");
    const next = { ...record, status: "cancelled" as const };
    const changed = this.db.prepare("UPDATE agent_proposals SET state=?,record=? WHERE company=? AND principal=? AND id=? AND state='pending'").run(next.status, stored(next), company, principal, id);
    if (changed.changes !== 1) throw new Error("The action started before dismissal. Check its saved result.");
    return this.get(company, principal, id)!;
  }
  close() { this.db.close(); }
  settledPayment(company: string, principal: string, id: string, result: unknown) {
    const record = this.get(company, principal, id);
    if (!record || record.operation.tool !== "payment.review") throw new Error("Payment proposal not found");
    const next = { ...record, status: "completed" as const, result };
    this.db.prepare("UPDATE agent_proposals SET state=?,record=? WHERE company=? AND principal=? AND id=?").run(next.status, stored(next), company, principal, id);
    return this.get(company, principal, id)!;
  }
}
export function openAgentProposals() {
  const path = resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  return new AgentProposalRepository(path);
}
