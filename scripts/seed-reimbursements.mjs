import { readFileSync } from "node:fs";
import { openReimbursements } from "../services/server/reimbursements.ts";
import { readNearTreasuryIdentity } from "../services/server/near-treasury-config.ts";

const repository = openReimbursements();
try {
  const rows = JSON.parse(readFileSync("public/reimbursement-history.json", "utf8"));
  repository.seed(readNearTreasuryIdentity().companyId, "entity-3", rows);
  console.log(`Saved ${rows.length} historical reimbursement examples without creating payments`);
} finally { repository.close(); }
