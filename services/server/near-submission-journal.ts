import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { isNearTransactionHash } from "../near/account-id.ts";

export interface NativeSubmission {
  id:string; scope:string; executor:string; fingerprint:string;
  state:"preparing"|"signed"|"resolved"; token:string;
  hash?:string; signedBytes?:string;
}

/** Fenced signer lease plus durable, immutable signed bytes before broadcast. */
export class NearSubmissionJournal {
  private db:DatabaseSync;
  constructor(path:string) {
    this.db=new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS near_executor_submissions(id TEXT PRIMARY KEY,scope TEXT NOT NULL,executor TEXT NOT NULL,state TEXT NOT NULL,record TEXT NOT NULL); CREATE TABLE IF NOT EXISTS near_executor_leases(scope TEXT NOT NULL,executor TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(scope,executor));");
  }
  get(id:string):NativeSubmission|undefined {const row=this.db.prepare("SELECT record FROM near_executor_submissions WHERE id=?").get(id);return row?JSON.parse(String(row.record)):undefined;}
  begin(input:Pick<NativeSubmission,"id"|"scope"|"executor"|"fingerprint">,now=Date.now()):NativeSubmission {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing=this.get(input.id);
      if(existing && (existing.scope!==input.scope || existing.executor!==input.executor || existing.fingerprint!==input.fingerprint))throw new Error("Submission ID belongs to different native instructions");
      if(existing && existing.state!=="preparing") {this.db.exec("COMMIT");return existing;}
      if(this.db.prepare("SELECT 1 FROM near_executor_submissions WHERE scope=? AND executor=? AND state='signed' LIMIT 1").get(input.scope,input.executor))throw new Error("Reconcile the outstanding native transaction before signing another nonce");
      const lease=this.db.prepare("SELECT expires_at FROM near_executor_leases WHERE scope=? AND executor=?").get(input.scope,input.executor);
      if(lease && Number(lease.expires_at)>now)throw new Error("Native executor is already preparing a transaction");
      const token=randomUUID(),job:NativeSubmission={...input,state:"preparing",token};
      this.db.prepare("INSERT INTO near_executor_leases VALUES(?,?,?,?) ON CONFLICT(scope,executor) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at").run(input.scope,input.executor,token,now+60000);
      this.db.prepare("INSERT INTO near_executor_submissions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,record=excluded.record").run(job.id,job.scope,job.executor,job.state,JSON.stringify(job));
      this.db.exec("COMMIT");return job;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  signed(job:NativeSubmission,hash:string,signedBytes:string,now=Date.now()):NativeSubmission {
    if(!isNearTransactionHash(hash) || !/^[A-Za-z0-9+/]+={0,2}$/.test(signedBytes) || signedBytes.length>1400000)throw new Error("Invalid signed native transaction");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const lease=this.db.prepare("SELECT token,expires_at FROM near_executor_leases WHERE scope=? AND executor=?").get(job.scope,job.executor);
      const current=this.get(job.id);
      if(!lease || lease.token!==job.token || Number(lease.expires_at)<=now || current?.state!=="preparing" || current.token!==job.token)throw new Error("Native signing lease expired or was replaced; do not broadcast");
      const next:NativeSubmission={...current,state:"signed",hash,signedBytes};
      this.db.prepare("UPDATE near_executor_submissions SET state=?,record=? WHERE id=?").run(next.state,JSON.stringify(next),job.id);
      this.db.prepare("DELETE FROM near_executor_leases WHERE scope=? AND executor=? AND token=?").run(job.scope,job.executor,job.token);
      this.db.exec("COMMIT");return next;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  resolve(id:string,hash:string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current=this.get(id);
      if(!current || current.hash!==hash || !["signed","resolved"].includes(current.state))throw new Error("Native resolution does not match the saved signed transaction");
      const next:NativeSubmission={...current,state:"resolved"};
      this.db.prepare("UPDATE near_executor_submissions SET state=?,record=? WHERE id=?").run(next.state,JSON.stringify(next),id);
      this.db.exec("COMMIT");return next;
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  close(){this.db.close();}
}
