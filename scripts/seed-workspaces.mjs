import { readFileSync } from "node:fs";
import { openSeededWorkspace } from "../services/server/seeded-workspace.ts";
import { readNearTreasuryIdentity } from "../services/server/near-treasury-config.ts";

const config = readNearTreasuryIdentity();
const repository = openSeededWorkspace();
try {
  for (const [entity, file] of Object.entries({ primary: "demo-data.json", "entity-2": "demo-data-entity-2.json", "entity-3": "demo-data.json" })) {
    const data = JSON.parse(readFileSync(`public/${file}`, "utf8"));
    const firstImport = repository.replace(config.companyId, entity, data);
    console.log(`${entity}: ${firstImport ? "imported" : "restored"}; ${data.company.companyName}; ${data.invoices.length} invoices, ${data.bills.length} bills, ${data.employees.length} employees, ${data.teamMembers.length} team, ${data.cards?.length || 0} cards`);
  }
} finally { repository.close(); }
