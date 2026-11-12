import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SeededWorkspaceRepository } from "../services/server/seeded-workspace.ts";

test("replace restores demo staff after an empty workspace seed", () => {
  const directory = mkdtempSync(join(tmpdir(), "settlbox-restore-"));
  const data = JSON.parse(readFileSync("public/demo-data-entity-3.json", "utf8"));
  const empty = { ...data, teamMembers: [], employees: [], clients: [], invoices: [], bills: [], cards: [], cardTransactions: [] };
  const repository = new SeededWorkspaceRepository(join(directory, "business.sqlite"));
  try {
    assert.equal(repository.seed("company", "entity-3", empty), true);
    assert.equal(repository.get("company", "entity-3").data.employees.length, 0);
    assert.equal(repository.replace("company", "entity-3", data), false);
    const restored = repository.get("company", "entity-3").data;
    assert.equal(restored.teamMembers.length, data.teamMembers.length);
    assert.equal(restored.employees.length, data.employees.length);
    assert.equal(restored.clients.length, data.clients.length);
    assert.equal(restored.invoices.length, data.invoices.length);
    assert.equal(restored.cards.length, data.cards.length);
    assert.ok(restored.teamMembers.some(member => member.email === data.teamMembers[0].email));
  } finally { repository.close(); rmSync(directory, { recursive: true }); }
});

test("seeded workspaces preserve edits and isolate companies with revision checks", () => {
  const directory = mkdtempSync(join(tmpdir(), "settlbox-seed-"));
  const data = JSON.parse(readFileSync("public/demo-data-entity-3.json", "utf8"));
  const repository = new SeededWorkspaceRepository(join(directory, "business.sqlite"));
  try {
    assert.equal(repository.seed("company", "entity-3", data), true);
    const original = repository.get("company", "entity-3");
    const company = { ...data.company, companyName: "Saved company" };
    repository.update("company", "entity-3", original.revision, [{ field: "company", value: company }]);
    assert.equal(repository.seed("company", "entity-3", data), false);
    assert.equal(repository.get("company", "entity-3").data.company.companyName, "Saved company");
    assert.throws(() => repository.get("other", "entity-3"), /not been seeded/);
    assert.throws(() => repository.update("company", "entity-3", original.revision, []), /another session/);
    const current = repository.get("company", "entity-3");
    assert.throws(() => repository.update("company", "entity-3", current.revision, [{ field: "totalBalance", value: 100000 }]), /verified/);
    assert.throws(() => repository.update("company", "entity-3", current.revision, [{ field: "invoices", value: [{ uuid: "forged", status: "PAID", txHash: "fake" }] }]), /verified/);
    assert.equal(repository.get("company", "entity-3").revision, current.revision);
  } finally { repository.close(); rmSync(directory, { recursive: true }); }
});

test("native draft amounts are editable exactly and cannot forge settlement",()=>{
  const directory=mkdtempSync(join(tmpdir(),"settlbox-native-draft-"));
  const data=JSON.parse(readFileSync("public/demo-data-entity-3.json","utf8"));
  data.invoices=[];
  const repository=new SeededWorkspaceRepository(join(directory,"business.sqlite"));
  try {
    repository.seed("company","entity-3",data);
    const current=repository.get("company","entity-3");
    const draft={uuid:"native-draft",id:1,type:"SENT",status:"DRAFT",amount:0.3,amountExact:"0.3",currency:"USDC",items:[]};
    const saved=repository.update("company","entity-3",current.revision,[{field:"invoices",value:[draft]}]);
    assert.equal(saved.data.invoices[0].amountExact,"0.3");
    assert.throws(()=>repository.update("company","entity-3",saved.revision,[{field:"invoices",value:[{...draft,amountExact:"0.3000001"}]}]),/precision/);
    assert.throws(()=>repository.update("company","entity-3",saved.revision,[{field:"invoices",value:[{...draft,amountExact:"0.4"}]}]),/match/);
    assert.throws(()=>repository.update("company","entity-3",saved.revision,[{field:"invoices",value:[{...draft,status:"PAID",transactionHash:"invented"}]}]),/verified/);
    assert.throws(()=>repository.update("company","entity-3",saved.revision,[{field:"invoices",value:[{...draft,businessRecordId:"invented"}]}]),/verified/);
    assert.equal(repository.get("company","entity-3").revision,saved.revision);
  } finally {repository.close();rmSync(directory,{recursive:true});}
});
