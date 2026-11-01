import {readNearTreasuryIdentity} from "../services/server/near-treasury-config.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openBusinessRecords } from "../services/server/business-records.ts";
import { openPayrollContracts } from "../services/server/payroll-contracts.ts";

export function prepareScheduledPayments() {
  const config=readNearTreasuryIdentity();
  const repository = openBusinessRecords();
  try {
    const payments = repository.prepareDuePayments(config.companyId).length;
    const payrolls = openPayrollContracts();
    try { return payments + payrolls.prepareDue(config.companyId, "entity-3").length; }
    finally { payrolls.close(); }
  }
  finally { repository.close(); }
}

export function startPaymentScheduleWorker() {
  const prepare = () => {
    try { const count = prepareScheduledPayments(); if (count) console.log(`${count} scheduled payment drafts prepared for review`); }
    catch { console.error("Scheduled payment drafts could not be prepared; retry from Scheduled payments"); }
  };
  prepare();
  const timer = setInterval(prepare, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
