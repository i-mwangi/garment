from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
def edit(name, changes):
    path = root / name
    text = path.read_text(encoding='utf-8')
    for before, after in changes:
        text = text.replace(before, after)
    path.write_text(text, encoding='utf-8')

# Invoice management uses the native workspace; the original outgoing executor
# remains separate until the native treasury has passed its execution tests.
p = root / 'app/api/business-records/[id]/route.ts'
t = p.read_text(encoding='utf-8')
t = t.replace('import { parseAmount }', 'import { readNearTreasuryIdentity } from "@/services/server/near-treasury-config";\nimport { isAddress } from "viem";\nimport { parseAmount }', 1)
t = t.replace('let config: ReturnType<typeof readTreasuryConfiguration>;', 'let config: ReturnType<typeof readNearTreasuryIdentity>;')
t = t.replace('try { config = readTreasuryConfiguration(); }', 'try { config = readNearTreasuryIdentity(); }')
t = t.replace('config.wallet.companyId', 'config.companyId').replace('config.wallet.address', 'config.accountId')
t = t.replace('    if (body.action === "pay") repository.claimPaymentRoute', '    const legacyConfig = readTreasuryConfiguration();\n    if (legacyConfig.wallet.companyId !== config.companyId || !isAddress(record.recipient)) throw new Error("This obligation requires the native NEAR treasury execution workflow");\n    if (body.action === "pay") repository.claimPaymentRoute')
t = t.replace('walletId: config.wallet.id', 'walletId: legacyConfig.wallet.id')
p.write_text(t, encoding='utf-8')

edit('components/Business/BusinessWorkspace.tsx', [
    ('import type { EvmAddress, WalletReference } from "@/types/finance";', 'import { getNearNetwork } from "@/services/near/network";'),
    ('["business-treasury"]', '["invoice-collection-account"]'),
    ('request<{\n        wallet: WalletReference;\n        policy: { allowedRecipients: EvmAddress[] };\n      }>("/api/treasury")', 'request<{ treasuryAddress: string | null }>("/api/seeded-workspace?entity=entity-3")'),
    ('treasury.data?.wallet.address', 'treasury.data?.treasuryAddress'),
    (') as EvmAddress', ')'),
    ('Arc Testnet', '{getNearNetwork().name}'),
    ('"Manage payments from your company treasury on {getNearNetwork().name}."', '`Manage payments from your company treasury on ${getNearNetwork().name}.`'),
    ('Recipient Arc wallet', 'Recipient NEAR account'),
    ('pattern="0x[0-9a-fA-F]{40}"', 'minLength={2} maxLength={64}'),
    ('placeholder="0x…"', 'placeholder="alice.testnet or implicit account ID"'),
    ('{1,18}', '{1,6}'),
    ('kind === "invoice" && !treasury.data', 'kind === "invoice" && !treasury.data?.treasuryAddress'),
])

for name in ['CreateEmployeeContactModal', 'EditEmployeeContactModal']:
    path = root / f'components/Modal/Contact/{name}.tsx'
    text = path.read_text(encoding='utf-8')
    text = text.replace('"use client";', '"use client";\nimport { getNearNetwork } from "@/services/near/network";\nimport { isNearAccountId } from "@/services/near/account-id";', 1)
    text = re.sub(r'  const networkChainIds: Record<string, number> = useMemo\(.*?\n  \);', '', text, flags=re.S)
    text = text.replace('chainId: networkChainIds[selectedNetwork.value] ?? 0', 'networkId: getNearNetwork().networkId')
    text = text.replace('name: "Arc Testnet"', 'name: getNearNetwork().name').replace('value: "5042002"', 'value: getNearNetwork().networkId')
    text = text.replace('"/chain/arc-testnet.svg"', '"/chain/near.svg"')
    text = text.replace('value: 10,\n      message: "Address is too short"', 'value: 2,\n      message: "Account ID is too short"')
    text = re.sub(r'    pattern: \{\s*value: /\^0x\[0-9a-f\]\{40\}\$/i,\s*message: "Enter a valid Arc EVM address",\s*\},\s*validate: (?:\(\)|value) => \{', '    validate: value => {\n      if (!isNearAccountId(value)) return "Enter a valid NEAR account ID";', text)
    if name.startswith('Edit'):
        start = text.index('  const normalizedName = networkName.trim();')
        end = text.index('\n};', start)
        text = text[:start] + '  const network = getNearNetwork();\n  return networkName === network.name ? { icon: "/chain/near.svg", name: network.name, value: network.networkId } : null;' + text[end:]
    path.write_text(text, encoding='utf-8')

edit('components/Modal/SelectNetworkModal.tsx', [
    ('import React from "react";', 'import React from "react";\nimport { getNearNetwork } from "@/services/near/network";'),
    ('icon: "/chain/arc-testnet.svg", name: "Arc Testnet", value: "5042002"', 'icon: "/chain/near.svg", name: getNearNetwork().name, value: getNearNetwork().networkId'),
])
edit('components/Modal/SelectTokenModal.tsx', [
    ('@/services/arc/amount', '@/services/near/amount'),
    ('import BaseModal', 'import { getNearNetwork } from "@/services/near/network";\nimport BaseModal'),
    ('(BigInt(wallet.balanceBaseUnits || "0") / 1000000000000n).toString()', 'wallet.balanceBaseUnits || "0"'),
    ('USDC · Arc Testnet', 'USDC · {getNearNetwork().name}'),
])
