from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent
manifest=json.loads((root/'MANIFEST.json').read_text(encoding='utf-8'))
errors=[]
for name,meta in manifest['files'].items():
    path=root/name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=meta['sha256']: errors.append(name)
if errors: raise SystemExit('FAILED: '+', '.join(errors))
print('OK:',len(manifest['files']),'files match SHA-256 manifest')
