from pathlib import Path
root=Path(__file__).resolve().parents[1]
old='readTreasuryConfiguration().wallet.companyId'
for p in (root/'app/api').rglob('*.ts'):
 before=p.read_text(encoding='utf-8-sig')
 if old not in before:continue
 after=before.replace(old,'readNearTreasuryIdentity().companyId')
 after='import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";\n'+after
 p.write_text(after,encoding='utf-8')
 print(p.relative_to(root))
