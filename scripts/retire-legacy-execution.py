from pathlib import Path
import json,re
root=Path.cwd().resolve()
replacements={}
def add(old,new,reason):
 if (root/old).is_file():replacements[old]={'replacement':new,'reason':reason}
modules={'amount.ts':'services/near/amount.ts','circle-contract-challenge.ts':'services/near/vault-admin.ts','client.ts':'services/near/rpc.ts','display.ts':'services/near/display.ts','gift-escrow.ts':'services/near/contract-actions.ts','human-vault-action.ts':'services/near/vault-admin.ts','network.ts':'services/near/network.ts','payment-service.ts':'services/server/vault-payments.ts','policy.ts':'contracts/near/treasury-vault/src/lib.rs','token.ts':'services/utils/near-token.ts','treasury-vault.ts':'contracts/near/treasury-vault/src/lib.rs','usyc.ts':'services/near/rhea.ts','vault-status.ts':'services/near/contract-snapshot.ts'}
for old,new in modules.items():add('services/arc/'+old,new,'Native NEAR implementation replaces the EVM network, ABI, precision or authorization implementation; callers and native verification are migrated.')
for old,new in {'workspace-view.ts':'near-workspace-view.ts','usyc.ts':'near-earn.ts','treasury-runtime.ts':'near-treasury-service.ts','payment-repository.ts':'vault-payment-journal.ts','circle-wallets.ts':'near-executor.ts','circle-human-wallet.ts':'../wallet/web3auth-near.ts','human-approval-journal.ts':'agent-proposals.ts','arc-read-transport.ts':'../near/rpc.ts'}.items():add('services/server/'+old,Path('services/server',new).resolve().relative_to(root).as_posix(),'Native account, transaction, provider or durable approval implementation replaces the unused legacy service.')
for old,new in {'usyc':'near-rhea','vault-status':'near-contracts','treasury-vault':'near-contracts','payment-repository':'vault-payment-journal','finance':'near-foundations','circle-human-wallet':'near-wallet-proof','circle-contract-challenge':'near-vault-admin','arc-ui-assets':'near-ui-assets','arc-read-recovery':'near-read-recovery','circle-config':'near-executor-journal'}.items():add('tests/'+old+'.test.mjs','tests/'+new+'.test.mjs','Native verification replaces legacy chain fixtures; Rust treasury/gift tests and the native journal/settlement suites cover contract policy and financial execution invariants.')
add('app/api/earn/usyc/route.ts','app/api/earn/near/route.ts','Native Rhea reserve state, reviewed supply/withdrawal and verified completion replace the old provider endpoint.')
add('presentation/app/earn/UsycPosition.tsx','presentation/app/earn/page.tsx','Native reserve reads and reviewed actions are integrated into the preserved Earn page.')
add('scripts/verify-circle-testnet.mjs','scripts/verify-near-testnet.mjs','Native local, network and deployed-identity checks replace Circle verification; flags explicitly identify which checks ran.')
add('tsconfig.arc.json','tsconfig.near.json','Native foundation and full-project TypeScript checks replace the retired EVM check target.')
for kind,crate in [('GiftEscrow','gift-escrow'),('TreasuryVault','treasury-vault')]:
 add('contracts/Settlbox'+kind+'.sol','contracts/near/'+crate+'/src/lib.rs','Native NEP-141 contract replaces Solidity execution and asynchronous receipt handling is covered by the Rust suite.')
 add('contracts/artifacts/Settlbox'+kind+'.json','docs/NEAR-CONTRACT-ARTIFACTS.json','Approved native WASM sizes, hashes, exports and imports replace the EVM ABI/bytecode artifact.')
# Validate that no remaining code imports a retired implementation.
retired=set(replacements)
issues=[]
for folder in ['app','components','contexts','hooks','presentation','services','scripts','tests','types']:
 for p in (root/folder).rglob('*'):
  if not p.is_file() or p.suffix not in ['.ts','.tsx','.mjs','.js'] or p.relative_to(root).as_posix() in retired:continue
  text=p.read_text(encoding='utf-8-sig')
  for spec in re.findall(r'(?:from\s*|import\s*\(|require\s*\()\s*[\"\']([^\"\']+)',text):
   base=(root/spec[2:]) if spec.startswith('@/') else (p.parent/spec) if spec.startswith('.') else None
   if base is None:continue
   for ext in ['', '.ts','.tsx','.mjs','.js','.json']:
    candidate=Path(str(base)+ext).resolve()
    if candidate.is_relative_to(root) and candidate.relative_to(root).as_posix() in retired:issues.append((p.relative_to(root).as_posix(),spec))
if issues:raise RuntimeError('Retired imports still used: '+str(issues))
for old,entry in replacements.items():
 target=(root/old).resolve();replacement=(root/entry['replacement']).resolve()
 if not target.is_relative_to(root) or not replacement.is_relative_to(root) or not replacement.is_file():raise RuntimeError('Invalid replacement '+old)
ledger=root/'docs/FILE-REPLACEMENTS.json';mapping=json.loads(ledger.read_text(encoding='utf-8'));mapping.update(replacements)
ledger.write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf-8')
for old in replacements:(root/old).unlink()
print('Retired '+str(len(replacements))+' legacy paths with explicit native replacements.')
