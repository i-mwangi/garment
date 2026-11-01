import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
function run(file,args=[],env=process.env){
 const result=spawnSync(process.execPath,[resolve(file),...args],{stdio:'inherit',env,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
// Release the compiler process before loading the full TypeScript program.
// The command still fails before packaging whenever TypeScript reports errors.
run('node_modules/next/dist/bin/next',['build'],{...process.env,SETTLBOX_SERIAL_TYPECHECK:'1'});
console.log('Validating all source and freshly generated route types...');
run('node_modules/typescript/bin/tsc',['--noEmit']);
run('scripts/prepare-standalone.mjs');
