from pathlib import Path
root=Path(__file__).resolve().parents[1]
replacements={
 '@/contexts/ArcWalletProvider':'@/contexts/NearWalletProvider',
 '"./ArcWalletProvider"':'"./NearWalletProvider"',
 '@/contexts/ArcNetworkProvider':'@/contexts/NearNetworkProvider',
 '@/presentation/contexts/ArcNetworkProvider':'@/contexts/NearNetworkProvider',
 '@/presentation/contexts/ArcPaymentProvider':'@/presentation/contexts/NearPaymentProvider',
 'useArcWallet':'useNearWallet', 'ArcWalletProvider':'NearWalletProvider',
 'useArcNetworkStore':'useNearNetworkStore','ArcNetworkProvider':'NearNetworkProvider',
 'useArcPayment':'useNearPayment','ArcPaymentProvider':'NearPaymentProvider',
 '@/components/Common/ArcNetworkIcon':'@/components/Common/NearNetworkIcon',
 '"./ArcNetworkIcon"':'"./NearNetworkIcon"','ArcNetworkIcon':'NearNetworkIcon',
}
excluded={'contexts/ArcWalletProvider.tsx','contexts/ArcNetworkProvider.tsx','presentation/contexts/ArcNetworkProvider.tsx','presentation/contexts/ArcPaymentProvider.tsx'}
changed=[]
for folder in ['app','components','contexts','hooks','presentation']:
 for p in (root/folder).rglob('*'):
  if p.suffix not in {'.ts','.tsx'} or p.relative_to(root).as_posix() in excluded: continue
  before=p.read_text(encoding='utf-8-sig'); after=before
  for a,b in replacements.items(): after=after.replace(a,b)
  if after!=before: p.write_text(after,encoding='utf-8');changed.append(str(p.relative_to(root)))
print('\n'.join(changed))
