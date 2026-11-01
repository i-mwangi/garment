import test from 'node:test';import assert from 'node:assert/strict';
import {createNearReader} from '../services/near/rpc.ts';import {getNearNetwork} from '../services/near/network.ts';
test('native read failover verifies the backup chain before exposing its data',async()=>{
 const network={...getNearNetwork('testnet'),rpcUrl:'https://primary.invalid',backupRpcUrl:'https://backup.invalid'};let chain='testnet',queries=0;
 const fetcher=async(url,options)=>{if(url===network.rpcUrl)return new Response('',{status:503});const body=JSON.parse(options.body);if(body.method==='status')return Response.json({result:{chain_id:chain}});queries++;return Response.json({result:{height:123}});};
 assert.deepEqual(await createNearReader(network,fetcher).rpc('block',{finality:'final'}),{height:123});assert.equal(queries,1);
 chain='mainnet';await assert.rejects(createNearReader(network,fetcher).rpc('block',{finality:'final'}),/network mismatch/);assert.equal(queries,1);
});
