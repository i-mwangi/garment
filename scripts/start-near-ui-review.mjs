import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {SeededWorkspaceRepository} from '../services/server/seeded-workspace.ts';
import {TeamMemberRepository} from '../services/server/team-members.ts';
const root=resolve('.data',`near-ui-review-${randomUUID()}`);mkdirSync(root,{recursive:true});
const config={companyId:'isolated-native-ui-review',accountId:'fixture-owner.testnet',networkId:'testnet'},configPath=resolve(root,'treasury.json'),database=resolve(root,'business.sqlite');
writeFileSync(configPath,JSON.stringify(config));
const workspace=new SeededWorkspaceRepository(database);
try{for(const [entity,file] of [['primary','demo-data.json'],['entity-2','demo-data-entity-2.json'],['entity-3','demo-data-entity-3.json']]){const data=JSON.parse(readFileSync(resolve('public',file),'utf8'));data.company.companyName=`UI review fixture (${entity})`;workspace.seed(config.companyId,entity,data);}}finally{workspace.close();}
const team=new TeamMemberRepository(database);try{team.initializeOwner(config.companyId,config.accountId);}finally{team.close();}
const listener=createServer();await new Promise(done=>listener.listen(0,'127.0.0.1',done));const port=listener.address().port;await new Promise(done=>listener.close(done));
const token='settlbox-isolated-ui-review-fixture-only';
const env={...process.env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',NEXT_PUBLIC_NEAR_NETWORK:'testnet',SETTLBOX_APP_ORIGIN:`http://127.0.0.1:${port}`,SETTLBOX_ADDITIONAL_APP_ORIGINS:`http://localhost:${port}`,SETTLBOX_OPERATOR_TOKEN:token,SETTLBOX_NEAR_TREASURY_CONFIG:configPath,SETTLBOX_NEAR_CONTRACT_CONFIG:resolve(root,'not-deployed.json'),SETTLBOX_NEAR_EARN_CONFIG:resolve(root,'not-approved.json'),SETTLBOX_NEAR_EXECUTOR_KEY_FILE:resolve(root,'no-executor-key.json'),SETTLBOX_BUSINESS_DATABASE:database,SETTLBOX_SESSION_DATABASE:resolve(root,'sessions.sqlite'),SETTLBOX_UPLOAD_DIRECTORY:resolve(root,'uploads'),SETTLBOX_AI_PROVIDER:'',SETTLBOX_FINANCE_WORKER_TOKEN:'',SETTLBOX_PAYOUT_STATUS_TOKEN:''};
const child=spawn(process.execPath,['--import',pathToFileURL(resolve('scripts/near-read-fixture.mjs')).href,resolve('.next/standalone/server.js')],{cwd:resolve('.next/standalone'),env,stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code||0;});
process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
const connection={baseUrl:`http://127.0.0.1:${port}`,loginUrl:`http://127.0.0.1:${port}/operator`,token,scope:'Public sample records in an isolated local fixture; no live credentials, no public-chain mutations.'};
writeFileSync(resolve('.data/near-ui-review-current.json'),JSON.stringify(connection,null,2)+'\n');console.log(JSON.stringify({loginUrl:connection.loginUrl,scope:connection.scope}));
