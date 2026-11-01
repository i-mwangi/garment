import { readFileSync } from "node:fs";
import { openSeededWorkspace } from "../services/server/seeded-workspace.ts";
import { readNearTreasuryIdentity } from "../services/server/near-treasury-config.ts";

const config = readNearTreasuryIdentity();
const repository = openSeededWorkspace();
try {
  for (const [entity, file] of Object.entries({ primary: "demo-data.json", "entity-2": "demo-data-entity-2.json", "entity-3": "demo-data-entity-3.json" })) {
    const data = JSON.parse(readFileSync(`public/${file}`, "utf8"));
    const inserted = repository.seed(config.companyId, entity, data);
    console.log(`${entity}: ${inserted ? "imported" : "already imported"}; ${data.company.companyName}; ${data.invoices.length} invoices, ${data.bills.length} bills, ${data.employees.length} employees`);
  }
} finally { repository.close(); }
