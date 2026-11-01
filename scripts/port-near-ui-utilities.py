from pathlib import Path
root=Path(__file__).resolve().parents[1]
for folder in ['app','components','contexts','hooks','presentation','services/utils']:
 for p in (root/folder).rglob('*'):
  if p.suffix not in {'.ts','.tsx'}: continue
  before=p.read_text(encoding='utf-8-sig');after=before.replace('ARC_EXPLORER_URL','NEAR_EXPLORER_URL').replace('ARC_NETWORK_ID','NEAR_NETWORK_ID')
  after=after.replace('${NEAR_EXPLORER_URL}/tx/','${NEAR_EXPLORER_URL}/txns/')
  after=after.replace('@/services/utils/arc-token','@/services/utils/near-token').replace('@/presentation/services/utils/arc-token','@/services/utils/near-token')
  if after!=before:p.write_text(after,encoding='utf-8')
p=root/'presentation/services/utils/tokenSelection.ts'
before=p.read_text(encoding='utf-8');p.write_text(before.replace('decimals: 8','decimals: 6'),encoding='utf-8')
