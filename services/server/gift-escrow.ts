import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readNearDeployment } from "./near-contract-config.ts";
import { verifiedGiftEscrow } from "../near/contract-state.ts";
import { assertRequestId } from "../near/contract-snapshot.ts";
import { createNearReader } from "../near/rpc.ts";
import { formatAmount } from "../near/amount.ts";
import { isNearTransactionHash } from "../near/account-id.ts";
import { verifyGiftFunding } from "../near/gift-settlement.ts";
import type { NearGift, GiftEscrowConfiguration } from "../../types/near-gift.ts";

export async function openGiftEscrow() {
  const deployment=readNearDeployment(),binding=deployment.gifts;
  const snapshot=await verifiedGiftEscrow(binding);
  const config:GiftEscrowConfiguration={networkId:binding.networkId as "testnet"|"mainnet",accountId:binding.accountId,tokenId:binding.tokenId,codeHash:binding.codeHash};
  async function read(id:string):Promise<NearGift> {
    assertRequestId(id);const state=await snapshot.gift(id);
    if(!state)throw new Error("Gift not found");
    const expiry=BigInt(state.expires_at_sec);
    if(expiry>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Gift expiry exceeds supported range");
    return {id,networkId:config.networkId,escrowId:config.accountId,sender:state.sender,recipient:state.recipient,amount:formatAmount(BigInt(state.amount)),expiresAt:Number(expiry),status:state.status==="active" && expiry<=BigInt(snapshot.timestampNs)/1000000000n?"expired":state.status};
  }
  async function verifyFunding(id:string,hash:string,signerId:string):Promise<NearGift> {
    if(!isNearTransactionHash(hash))throw new Error("Invalid native NEAR funding hash");
    const outcome=await createNearReader().getReceipt(hash,signerId);
    // Refresh the final snapshot after observing the transaction, rather than racing a pre-funding block.
    const latest=await openGiftEscrow();
    return verifyGiftFunding(await latest.read(id),outcome,{hash,signerId,tokenId:config.tokenId});
  }
  return {config,read,verifyFunding};
}

export class GiftRepository {
  private readonly database:DatabaseSync;
  constructor(path:string) {
    this.database=new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS near_gifts(network TEXT NOT NULL,escrow TEXT NOT NULL,id TEXT NOT NULL,company_id TEXT NOT NULL,transaction_hash TEXT NOT NULL,record TEXT NOT NULL,PRIMARY KEY(network,escrow,id),UNIQUE(network,transaction_hash)); CREATE INDEX IF NOT EXISTS near_gift_listing ON near_gifts(company_id,network,escrow);");
  }
  save(companyId:string,gift:NearGift):NearGift {
    assertRequestId(gift.id);
    if(!gift.transactionHash || !isNearTransactionHash(gift.transactionHash))throw new Error("Verified native funding is required");
    this.database.prepare("INSERT OR IGNORE INTO near_gifts(network,escrow,id,company_id,transaction_hash,record) VALUES(?,?,?,?,?,?)").run(gift.networkId,gift.escrowId,gift.id,companyId,gift.transactionHash,JSON.stringify(gift));
    const row=this.database.prepare("SELECT record FROM near_gifts WHERE network=? AND escrow=? AND id=? AND company_id=? AND transaction_hash=?").get(gift.networkId,gift.escrowId,gift.id,companyId,gift.transactionHash);
    if(!row)throw new Error("Gift or funding transaction already belongs to another record");
    const saved=JSON.parse(String(row.record)) as NearGift;
    if(saved.sender!==gift.sender || saved.recipient!==gift.recipient || saved.amount!==gift.amount || saved.expiresAt!==gift.expiresAt)throw new Error("Saved native gift terms differ");
    return {...gift,transactionHash:saved.transactionHash};
  }
  list(companyId:string,network:string,escrow:string):NearGift[] {return this.database.prepare("SELECT record FROM near_gifts WHERE company_id=? AND network=? AND escrow=? ORDER BY rowid DESC LIMIT 50").all(companyId,network,escrow).map(row=>JSON.parse(String(row.record)) as NearGift);}
  close(){this.database.close();}
}
export function openGifts(){const path=resolve(process.env.SETTLBOX_BUSINESS_DATABASE || ".data/business.sqlite");mkdirSync(dirname(path),{recursive:true});return new GiftRepository(path);}
