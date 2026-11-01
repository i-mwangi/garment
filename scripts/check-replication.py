from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
inventory=json.loads((root/'docs/source-inventory.json').read_text(encoding='utf-8'))
replacement_file=root/'docs/FILE-REPLACEMENTS.json'
replacements=json.loads(replacement_file.read_text(encoding='utf-8')) if replacement_file.exists() else {}
rows=[]
for item in inventory['files']:
 p=root/item['target']
 status='missing' if not p.is_file() else 'replicated unchanged' if hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'] else 'adapted; verification pending'
 row={'path':item['target'],'status':status}
 if status=='missing' and item['target'] in replacements:
  entry=replacements[item['target']]
  replacement=(root/entry['replacement']).resolve()
  if not replacement.is_relative_to(root):raise ValueError('Replacement must stay inside the target project')
  if replacement.is_file():row.update(status='replaced by native implementation',replacement=entry['replacement'],reason=entry['reason'])
 rows.append(row)
counts={status:sum(r['status']==status for r in rows) for status in sorted(set(r['status'] for r in rows))}
(root/'docs/REPLICATION-STATUS.json').write_text(json.dumps({'counts':counts,'files':rows},indent=2),encoding='utf-8')
print(json.dumps(counts))
if counts.get('missing',0): raise SystemExit(1)
