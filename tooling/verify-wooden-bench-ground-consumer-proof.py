"""Actual previous descriptor, default mapping and registry negatives with exact restoration."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/research/2026-10-03-wooden-bench-ground-mounts'
MAPPING=ROOT/'src/rendering/assets/oblique-object-mapping.ts'
REGISTRY=ROOT/'public/game-content/oblique-module-registry.v1.json'
DESCRIPTOR=ROOT/'public/game-content/oblique-canteen-bench.v1.json'
NODE=Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
TEST='tests/unit/oblique-wooden-bench-ground-mounts-consumer.test.ts'
sha=lambda b:hashlib.sha256(b).hexdigest()

def run(label,red=False):
 r=subprocess.run([str(NODE),'node_modules/vitest/vitest.mjs','run',TEST,'--reporter=dot'],cwd=ROOT,capture_output=True,timeout=30)
 out=(r.stdout+r.stderr).decode('utf-8',errors='replace')
 (REPORT/(label+'.log')).write_text('\n'.join(line.rstrip()for line in out.splitlines()).rstrip()+'\n',encoding='utf-8',newline='\n')
 if (red and(r.returncode==0 or 'AssertionError'not in out))or(not red and r.returncode):raise AssertionError(label+'\n'+out)
 print(label,'RED'if red else'GREEN',r.returncode,flush=True)
 return {'label':label,'exitCode':r.returncode,'expectedRed':red}

def main():
 originals={p:p.read_bytes()for p in(MAPPING,REGISTRY,DESCRIPTOR)}
 before={p.relative_to(ROOT).as_posix():sha(b)for p,b in originals.items()};controls=[]
 try:
  try:
   DESCRIPTOR.write_bytes((REPORT/'previous-42part-runtime-descriptor.json').read_bytes())
   controls.append(run('actual-previous42-descriptor-selected-red',True))
  finally:DESCRIPTOR.write_bytes(originals[DESCRIPTOR])
  controls.append(run('exact-current46-descriptor-restore-green'))
  try:
   line="  'object.bench': 'furniture.corridor.bench.variants',"
   text=originals[MAPPING].decode();assert text.count(line)==1
   MAPPING.write_text(text.replace(line,''),encoding='utf-8',newline='\n')
   controls.append(run('actual-default-bench-mapping-omission-red',True))
  finally:MAPPING.write_bytes(originals[MAPPING])
  controls.append(run('exact-default-mapping-restore-green'))
  try:
   registry=json.loads(originals[REGISTRY]);count=len(registry['entries'])
   registry['entries']=[entry for entry in registry['entries']if entry['assetId']!='furniture.corridor.bench.variants']
   assert len(registry['entries'])==count-1
   REGISTRY.write_text(json.dumps(registry,indent=2)+'\n',encoding='utf-8',newline='\n')
   controls.append(run('actual-bench-registry-omission-red',True))
  finally:REGISTRY.write_bytes(originals[REGISTRY])
  controls.append(run('exact-bench-registry-restore-green'))
 finally:
  for path,body in originals.items():path.write_bytes(body)
 after={p.relative_to(ROOT).as_posix():sha(p.read_bytes())for p in originals};assert after==before
 (REPORT/'actual-consumer-controls.json').write_text(json.dumps({'controls':controls,'protectedBefore':before,'protectedAfter':after,'exactRestore':True},indent=2)+'\n',encoding='utf-8',newline='\n')
 print('BENCH_GROUND_CONSUMER_CONTROLS_GREEN exact descriptor/registry/mapping restoration',flush=True)

if __name__=='__main__':main()
