"""Attach current copy evidence without claiming semantic or visual parity."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
states={row['path']:row for row in json.loads((root/'docs/REPLICATION-STATUS.json').read_text(encoding='utf-8'))['files']}
native_test_files={'tests/business-records.test.mjs','tests/workspace-records.test.mjs','tests/payroll-contracts.test.mjs','tests/reimbursements.test.mjs','tests/payment-schedules.test.mjs','tests/seeded-workspace.test.mjs','tests/team-members.test.mjs','tests/payment-links.test.mjs','tests/group-collections.test.mjs'}
path=root/'docs/FILE-MIGRATION-LEDGER.md'
lines=[]
for line in path.read_text(encoding='utf-8').splitlines():
    if line.startswith('| `'):
        name=line.split('`',2)[1]
        state=states[name]['status']
        evidence='copy hash matches baseline; semantic/visual review pending' if state=='replicated unchanged' else 'adapted; full parity review pending'
        if name in native_test_files: evidence='native fixtures ported; included in native regression suite; see README-NEAR.md for current results'
        if state=='replaced by native implementation':evidence='native replacement: `'+states[name]['replacement']+'`; '+states[name]['reason']
        parts=line.rsplit('|',2)
        line=parts[0]+'| '+evidence+' |'
    lines.append(line)
path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
