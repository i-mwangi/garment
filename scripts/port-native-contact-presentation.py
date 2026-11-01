from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
for name in ['CreateEmployeeContactModal','EditEmployeeContactModal']:
    path=root/f'presentation/components/Modal/Contact/{name}.tsx'
    text=path.read_text(encoding='utf-8')
    text=text.replace('"use client";', '"use client";\nimport { getNearNetwork } from "@/services/near/network";\nimport { isNearAccountId } from "@/services/near/account-id";',1)
    text=re.sub(r'    const networkChainIds: Record<string, number> = useMemo\(.*?\n    \);','',text,flags=re.S)
    text=text.replace('chainId: networkChainIds[selectedNetwork.value] ?? 0','networkId: getNearNetwork().networkId')
    text=text.replace('name: "Arc Testnet"','name: getNearNetwork().name').replace('value: "5042002"','value: getNearNetwork().networkId')
    text=text.replace('"/chain/arc.svg"','"/chain/near.svg"').replace('|| "Arc Testnet"','|| getNearNetwork().name')
    text=text.replace('value: 10,\n            message: "Address is too short"','value: 2,\n            message: "Account ID is too short"')
    text=re.sub(r'        pattern: \{\s*value: /\^0x\[0-9a-f\]\{40\}\$/i,\s*message: "Enter a valid Arc wallet address \(0x followed by 40 hexadecimal characters\)",\s*\},\s*validate: (?:\(\)|value) => \{','        validate: value => {\n            if (!isNearAccountId(value)) return "Enter a valid NEAR account ID";',text)
    if name.startswith('Edit'):
        start=text.index('    const normalizedName = networkName.trim();')
        end=text.index('\n};',start)
        text=text[:start]+'    const network=getNearNetwork();\n    return networkName === network.name ? { icon: "/chain/near.svg", name: network.name, value: network.networkId } : null;'+text[end:]
    path.write_text(text,encoding='utf-8')
for folder in ['components','presentation/components']:
    for name in ['CreateNewGroupModal','EditGroupModal']:
        path=root/f'{folder}/Modal/Group/{name}.tsx'
        if not path.exists(): continue
        text=path.read_text(encoding='utf-8')
        text=text.replace('"use client";','"use client";\nimport { assertNearAccountId } from "@/services/near/account-id";',1)
        text=text.replace('if (!/^0x[0-9a-fA-F]{40}$/.test(manualAddress)) throw new Error("Invalid Arc address");','assertNearAccountId(manualAddress);')
        text=text.replace('if (!/^0x[0-9a-fA-F]{40}$/.test(member.address)) throw new Error("Invalid Arc address");','assertNearAccountId(member.address);')
        path.write_text(text,encoding='utf-8')
