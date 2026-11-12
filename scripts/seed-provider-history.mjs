import { readFileSync } from "node:fs";
import { readNearTreasuryIdentity } from "../services/server/near-treasury-config.ts";
import { openProviderHistory } from "../services/server/provider-history.ts";

const repository = openProviderHistory();
try {
  repository.replace(readNearTreasuryIdentity().companyId, "entity-3", JSON.parse(readFileSync("public/provider-history.json", "utf8")));
  console.log("Saved provider history without creating bank accounts, deposits or yield positions");
} finally { repository.close(); }
