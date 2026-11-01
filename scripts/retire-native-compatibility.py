"""One-time cleanup after native providers are wired; preserves a replacement ledger."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
mapping=json.loads((root/'docs/FILE-REPLACEMENTS.json').read_text(encoding='utf-8'))
for folder in ['app','components','contexts','hooks','presentation','services','types']:
 for path in (root/folder).rglob('*'):
  if path.suffix not in ['.ts','.tsx']:continue
  text=path.read_text(encoding='utf-8-sig')
  updated=text.replace('@/services/arc/identicon','@/services/utils/identicon').replace('ConnectArcWallet','ConnectNearWallet').replace('CONNECT_ARC_WALLET','CONNECT_NEAR_WALLET')
  if path.relative_to(root).as_posix() in ['components/Send/QuickSendForm.tsx','components/MoveCrypto/MoveCryptoContainer.tsx']:
   updated=updated.replace('ArcTransferForm','NearTransferForm')
  if path.name in ['ConnectArcWallet.tsx','ConnectNearWallet.tsx']:
   updated=re.sub(r'\{\/\* <div[\s\S]*?\*\/\}','',updated)
   updated=updated.replace('Connect EVM wallet on Arc Testnet','Sign in to NEAR with Web3Auth')
  if path.relative_to(root).as_posix()=='components/Sidebar/Account.tsx':
   updated=updated.replace('ARC_WALLET','NEAR_WALLET').replace('arc-wallet','near-wallet').replace('/logo/arc.svg','/chain/near.svg').replace('Arc network','NEAR network')
  if path.relative_to(root).as_posix()=='components/Sidebar/Connect.tsx':updated=updated.replace('Connect Arc wallet','Connect NEAR wallet')
  if updated!=text:path.write_text(updated,encoding='utf-8')
for old,new in [('services/arc/identicon.ts','services/utils/identicon.ts'),('components/Modal/Wallet/ConnectArcWallet.tsx','components/Modal/Wallet/ConnectNearWallet.tsx'),('presentation/components/Modal/Wallet/ConnectArcWallet.tsx','presentation/components/Modal/Wallet/ConnectNearWallet.tsx')]:
 src=(root/old).resolve();dst=(root/new).resolve()
 if not src.is_relative_to(root) or not dst.is_relative_to(root):raise ValueError('Invalid migration path')
 if src.exists():
  if dst.exists():raise ValueError('Refusing to overwrite an existing native replacement')
  src.rename(dst)
for old,entry in mapping.items():
 src=(root/old).resolve();replacement=(root/entry['replacement']).resolve()
 if not src.is_relative_to(root) or not replacement.is_relative_to(root) or not replacement.is_file():raise ValueError('Missing or invalid native replacement')
 if src.is_file():src.unlink()
print(f'{len(mapping)} source paths now have explicit native replacements; source project unchanged.')
