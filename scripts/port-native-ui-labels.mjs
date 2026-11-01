import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd(),printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
let changed=0;
for(const folder of ['components','presentation/components','presentation/contexts','presentation/services','app']) {
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory()){if(path.relative(root,file).replaceAll('\\','/')!=='app/api')walk(file);continue;}if(!/\.tsx?$/.test(file)||file.endsWith('UsycPosition.tsx'))continue;
 let source=fs.readFileSync(file,'utf8');if(!/\bArc\b|arcscan|arc\.io|\/chain\/arc/.test(source))continue;
 const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);let dynamic=false;
 const rename=text=>text.replaceAll('/chain/arc-testnet.svg','/chain/near.svg').replaceAll('/chain/arc.svg','/chain/near.svg').replaceAll('/logo/arc.svg','/chain/near.svg').replaceAll('Arcscan','NEAR explorer').replaceAll('Arc Explorer','NEAR explorer').replace(/\bArc\b/g,'NEAR').replaceAll('Circle wallet','native approval wallet').replaceAll('EVM wallet','NEAR wallet');
 const network=()=>{dynamic=true;return ts.factory.createPropertyAccessExpression(ts.factory.createCallExpression(ts.factory.createIdentifier('getNearNetwork'),undefined,[]),'name');};
 const template=text=>{const pieces=text.split('Arc Testnet');if(pieces.length===1)return ts.factory.createStringLiteral(rename(text));if(pieces.length===2&&!pieces[0]&&!pieces[1])return network();return ts.factory.createTemplateExpression(ts.factory.createTemplateHead(rename(pieces[0])),pieces.slice(1).map((piece,index)=>ts.factory.createTemplateSpan(network(),index===pieces.length-2?ts.factory.createTemplateTail(rename(piece)):ts.factory.createTemplateMiddle(rename(piece)))));};
 const result=ts.transform(parsed,[context=>{const visit=node=>{
  if(ts.isStringLiteral(node)&&/\bArc\b|arcscan|\/chain\/arc/.test(node.text)){
   const value=template(node.text);return ts.isJsxAttribute(node.parent)?ts.factory.createJsxExpression(undefined,value):value;
  }
  if(ts.isJsxText(node)&&/\bArc\b/.test(node.text))return ts.factory.createJsxExpression(undefined,template(node.text));
  return ts.visitEachChild(node,visit,context);
 };return node=>ts.visitNode(node,visit);}]);
 let output=printer.printFile(result.transformed[0]);result.dispose();
 if(dynamic&&!/import[^\n]*\bgetNearNetwork\b/.test(output))output=output.replace(/^("use client";\s*)?/,match=>match+'import {getNearNetwork} from "@/services/near/network";\n');
 fs.writeFileSync(file,output);changed++;
 }}walk(path.join(root,folder));
}
console.log(`Adapted native labels and icons in ${changed} UI/support files.`);
