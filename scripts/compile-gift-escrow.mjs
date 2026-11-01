import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const command=process.platform==='win32'?'powershell.exe':'cargo';
const args=process.platform==='win32'?['-NoProfile','-File',resolve(root,'scripts/near-contracts.ps1'),'-Action','build']:['+1.93.0','build','--locked','--release','--target','wasm32-unknown-unknown','--manifest-path',resolve(root,'contracts/near/Cargo.toml')];
const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,...(process.platform==='win32'?{}:{RUSTFLAGS:'--cfg near'})}});
if(result.error)throw result.error;process.exitCode=result.status??1;
