"""Copy the inventoried application source, without secrets or generated state."""
import hashlib,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
inventory=json.loads((root/'docs/source-inventory.json').read_text(encoding='utf-8'))
source=Path(inventory['summary']['source'])
copied=[]
for item in inventory['files']:
    origin=source/item['source']; target=root/item['target']
    raw=origin.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=item['sha256']:
        raise RuntimeError('Source changed since inventory: '+item['source'])
    if target.exists() and target.read_bytes()!=raw:
        raise RuntimeError('Refusing to overwrite destination work: '+item['target'])
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists(): shutil.copy2(origin,target)
    copied.append(item['target'])
(root/'docs/REPLICATION-RESULT.json').write_text(json.dumps({'copied_files':len(copied),'hash_verified':True,'source_modified':False,'files':copied},indent=2),encoding='utf-8')
print('Replicated and hash-verified '+str(len(copied))+' files.')
