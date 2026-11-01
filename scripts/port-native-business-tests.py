from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
for name in ['business-records', 'workspace-records', 'payroll-contracts', 'reimbursements', 'payment-schedules']:
    path = root / f'tests/{name}.test.mjs'
    text = path.read_text(encoding='utf-8')
    text = text.replace('`0x${"1".repeat(40)}`', '"alice.testnet"')
    text = re.sub(r'"0x(?!0{40}")[0-9a-f]{40}"', '"alice.testnet"', text)
    text = text.replace('"demo-address"', '"invalid account"')
    for char in ['a','b','c']:
        text = text.replace('`0x${"' + char + '".repeat(64)}`', f'encodeBase58(new Uint8Array(32).fill({ord(char)-90}))')
    if 'encodeBase58(' in text:
        text = 'import { encodeBase58 } from "../services/near/base58.ts";\n' + text
    text = text.replace('1.000000000000000001', '1.000001')
    text = text.replace('0.000001000000000000', '0.000001')
    text = text.replace('/six decimals/', '/precision/').replace('/six decimal/', '/precision/')
    text = text.replace('/Arc wallet/', '/NEAR account/').replace('/Arc/', '/NEAR/')
    text = text.replace('invalid Arc addresses', 'invalid NEAR account IDs')
    text = text.replace('employee.network.chainId, 5042002', 'employee.network.networkId, "testnet"')
    path.write_text(text, encoding='utf-8')
