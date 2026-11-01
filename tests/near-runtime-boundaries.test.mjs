import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const legacy=/\bArc\b|arcTestnet|arcscan|services\/arc|NEXT_PUBLIC_ARC|5042002|@circle-fin|CIRCLE_API|CIRCLE_ENTITY/i;
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]);}
test('native runtime and container configuration reject legacy settlement wiring',()=>{
 const paths=['app','components','contexts','hooks','presentation','services','types'].flatMap(files).filter(path=>/\.(?:ts|tsx|js|mjs|json|css)$/.test(path));
 paths.push('Dockerfile','.env.example');
 const found=paths.filter(path=>legacy.test(readFileSync(path,'utf8')));
 assert.deepEqual(found,[],'Legacy settlement configuration must not enter native application or container builds');
});
test('network reference audit distinguishes NEAR identifiers and search APIs from the old chain',()=>{
 for(const value of ['NearContractCall','NearContractBinding','searchParams','URLSearchParams','archive'])assert.equal(legacy.test(value),false);
 for(const value of ['Arc Testnet','arcTestnet','testnet.arcscan.app','NEXT_PUBLIC_ARC_RPC_URL','@circle-fin/sdk'])assert.equal(legacy.test(value),true);
});
