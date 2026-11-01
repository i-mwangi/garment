import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNearAccountId } from '../services/near/account-id.ts';
import { getNearNetwork } from '../services/near/network.ts';
import { openTeamMembers } from '../services/server/team-members.ts';
import { openSeededWorkspace } from '../services/server/seeded-workspace.ts';
import { openWorkspace } from '../services/server/workspace-records.ts';

const accountId=process.argv[2];assertNearAccountId(accountId);
const path=resolve(process.env.SETTLBOX_NEAR_TREASURY_CONFIG||'.data/near-treasury.json');
const networkId=getNearNetwork().networkId;
let identity;
if(existsSync(path)) {
  identity=JSON.parse(readFileSync(path,'utf8'));
  if(identity.accountId!==accountId||identity.networkId!==networkId)throw new Error('Existing workspace identity differs; refusing to overwrite it');
} else {
  identity={companyId:randomUUID(),accountId,networkId};mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify(identity,null,2),{flag:'wx'});
}
const members=openTeamMembers();const seeded=openSeededWorkspace();const workspace=openWorkspace();
function empty(value) {
  if(Array.isArray(value))return [];
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,empty(v)]));
  if(typeof value==='number')return 0;if(typeof value==='boolean')return false;if(typeof value==='string')return '';return null;
}
try {
  const owner=members.initializeOwner(identity.companyId,accountId);
  const template=JSON.parse(readFileSync('public/demo-data-entity-3.json','utf8'));
  const data=empty(template);const now=new Date().toISOString();
  data.company={...data.company,id:1,uuid:identity.companyId,companyName:'Your Company',logo:null,createdAt:now,updatedAt:now};
  data.user={...data.user,id:owner.id,uuid:owner.uuid,email:'',role:'OWNER',isActive:true,teamMembership:{id:owner.id,uuid:owner.uuid,firstName:owner.firstName,lastName:owner.lastName,position:'Owner',role:'OWNER',companyId:1,profilePicture:null,company:{id:1,companyName:'Your Company'}}};
  data.teamMembers=[];data.teamStats={total:1,active:1,suspended:0,pending:0};
  data.accounts=[{id:accountId,uuid:randomUUID(),accountId,name:'Company wallet',description:'USDC on '+getNearNetwork().name,threshold:1,companyId:1,logo:null,members:[{name:'Workspace Owner',commitment:accountId,role:'OWNER'}],createdAt:now}];
  data.balances={};data.totalBalance=0;data.card=null;data.cards=[];
  data.invoiceSettings={...data.invoiceSettings,invoicePrefix:'INV',nextInvoiceNumber:1,showWalletQr:true};
  for(const entity of ['primary','entity-2','entity-3'])seeded.seed(identity.companyId,entity,data);
  if(!workspace.list(identity.companyId,'company').length)workspace.save(identity.companyId,'company',{companyName:'Your Company'});
  console.log(JSON.stringify({configured:true,companyId:identity.companyId,accountId,networkId,businessRecords:'empty',ownerCreated:true},null,2));
} finally {members.close();seeded.close();workspace.close();}
