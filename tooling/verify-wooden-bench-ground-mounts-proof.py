"""Actual retained-source/dispatch/hash-valid PNG controls with byte-exact restore."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'docs/research/2026-10-03-wooden-bench-ground-mounts'
SCRATCH=ROOT/'assets/intermediate/wooden-bench-ground-mounts-proof-controls'
PRODUCER=ROOT/'tooling/blender/render-wooden-bench-ground-mounts-oblique.py'
STANDALONE=ROOT/'tooling/blender/render-wooden-bench-oblique.py'
SOURCE=ROOT/'assets/source/blender/furniture.corridor.bench.grounded-detail.blend'
MANIFEST=ROOT/'public/game-content/oblique-canteen-bench.v1.json'
BLENDER=os.environ.get('LOCKSTATE_BLENDER',r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
CLI=[BLENDER,'--background','--factory-startup','--threads','1','--python-exit-code','1']
sha=lambda b:hashlib.sha256(b).hexdigest()
def run_unit(label,red=False):
 node=Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
 r=subprocess.run([str(node),'node_modules/vitest/vitest.mjs','run','tests/unit/oblique-wooden-bench-ground-mounts-integrity.test.ts','--reporter=dot'],cwd=ROOT,capture_output=True,timeout=30)
 out=(r.stdout+r.stderr).decode('utf-8',errors='replace')
 (REPORT/(label+'.log')).write_text('\n'.join(line.rstrip()for line in out.splitlines()).rstrip()+'\n',encoding='utf-8',newline='\n')
 if (red and(r.returncode==0 or 'AssertionError'not in out))or(not red and r.returncode):raise AssertionError(label+'\n'+out)
 print(label,'RED'if red else'GREEN',r.returncode,flush=True)
 return {'label':label,'exitCode':r.returncode,'expectedRed':red}
def run(label,script=PRODUCER,args=(),error=None):
 r=subprocess.run(CLI+['--python',str(script),'--',*args],cwd=ROOT,capture_output=True,timeout=60)
 out=(r.stdout+r.stderr).decode('utf-8',errors='replace')
 (REPORT/(label+'.log')).write_text('\n'.join(line.rstrip() for line in out.splitlines()).rstrip()+'\n',encoding='utf-8',newline='\n')
 if (error and (r.returncode==0 or error not in out)) or (not error and r.returncode):raise AssertionError(label+'\n'+out)
 print(label,'RED' if error else 'GREEN',r.returncode,flush=True)
 return {'label':label,'exitCode':r.returncode,'expectedFailure':error}
def main():
 SCRATCH.mkdir(parents=True,exist_ok=True)
 source_only='--source-only' in sys.argv
 protected={SOURCE,PRODUCER,STANDALONE,ROOT/'tooling/blender/build-wooden-bench-ground-mounts.py',SOURCE.with_suffix('.provenance.json'),ROOT/'assets/source/blender/furniture.corridor.bench.angled-detail.blend',ROOT/'public/game-content/oblique-module-registry.v1.json',ROOT/'src/rendering/assets/oblique-object-mapping.ts'}
 if not source_only:
  catalog=json.loads(MANIFEST.read_text());protected.add(MANIFEST);protected.update(ROOT/'public'/f['image'].lstrip('/') for f in catalog['frames'])
  old_catalog=json.loads((REPORT/'previous-42part-runtime-descriptor.json').read_text())
  protected.update(ROOT/'public'/f['image'].lstrip('/')for f in old_catalog['frames'])
 before={p.relative_to(ROOT).as_posix():sha(p.read_bytes())for p in sorted(protected)};receipt={'controls':[],'protectedBefore':before}
 source_bytes=SOURCE.read_bytes();producer_bytes=PRODUCER.read_bytes()
 try:
  mutation=SCRATCH/'disconnect-real-seat-pad.py'
  mutation.write_text("from pathlib import Path\nimport bpy\nsource=Path.cwd()/'assets/source/blender/furniture.corridor.bench.grounded-detail.blend'\nbpy.ops.wm.open_mainfile(filepath=str(source))\nbpy.data.objects['physical-bench.ground mounting shoe 0'].location.z+=1\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(source))\n",encoding='utf-8',newline='\n')
  try:
   receipt['controls'].append(run('actual-source-mutation-written',mutation))
   receipt['actualMutantSourceSha256']=sha(SOURCE.read_bytes())
   if receipt['actualMutantSourceSha256']==sha(source_bytes):raise AssertionError('Actual source did not mutate')
   receipt['controls'].append(run('actual-disconnected-source-red',args=('--verify',),error='Bench floor mounting shoe actual contact disconnected'))
   if not source_only:receipt['controls'].append(run_unit('actual-saved-model-integrity-unit-red',True))
  finally:SOURCE.write_bytes(source_bytes)
  receipt['controls'].append(run('exact-source-restore-green',args=('--verify',)))
  if not source_only:receipt['controls'].append(run_unit('exact-model-integrity-unit-restore-green'))
  try:
   text=producer_bytes.decode().replace("ASSET_ID = 'furniture.corridor.bench.variants'","ASSET_ID = 'furniture.chair.wooden'")
   if text==producer_bytes.decode():raise AssertionError('Real producer dispatch did not mutate')
   PRODUCER.write_text(text,encoding='utf-8',newline='\n')
   receipt['controls'].append(run('actual-producer-dispatch-red',args=('--verify',),error='Bench ground mounting shoes dedicated producer dispatch changed'))
  finally:PRODUCER.write_bytes(producer_bytes)
  receipt['controls'].append(run('exact-dispatch-restore-green',args=('--verify',)))
  if not source_only:
   standalone_bytes=STANDALONE.read_bytes()
   try:
    text=standalone_bytes.decode().replace('return bench_ground_mount_exporter().configure(model)','return bench_crossrail_exporter().configure(model)')
    if text==standalone_bytes.decode():raise AssertionError('Actual standalone source dispatch did not mutate')
    STANDALONE.write_text(text,encoding='utf-8',newline='\n')
    receipt['controls'].append(run('actual-standalone-old-source-dispatch-red',script=STANDALONE,args=('--verify',),error='Bench producer dispatch source changed'))
   finally:STANDALONE.write_bytes(standalone_bytes)
   receipt['controls'].append(run('exact-standalone-dispatch-restore-green',script=STANDALONE,args=('--verify',)))
   manifest_bytes=MANIFEST.read_bytes();bad_image=None
   try:
    f=next(f for f in catalog['frames']if(f['yawDegrees'],f['elevationDegrees'])==(60,40));original=ROOT/'public'/f['image'].lstrip('/')
    with Image.open(original)as image:
     bad=image.convert('RGBA');bad.putpixel((0,0),(120,90,60,255));staging=SCRATCH/'hash-valid-bad-border.png';bad.save(staging)
    body=staging.read_bytes();digest=sha(body);bad_image=original.with_name(f'furniture.corridor.bench.variants-yaw+60-elev40.{digest[:12]}.png');bad_image.write_bytes(body)
    with Image.open(bad_image)as decoded:
     decoded.load()
     if decoded.size!=(256,256)or decoded.getpixel((0,0))!=(120,90,60,255):raise AssertionError('Bad PNG must actually decode')
    record=next(f for f in catalog['frames']if(f['yawDegrees'],f['elevationDegrees'])==(60,40));record['sha256']=digest;record['image']='/assets/environment/oblique/'+bad_image.name
    MANIFEST.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8',newline='\n')
    receipt['hashValidBadPNG']={'sha256':digest,'validDecodedRGBA':[256,256],'actualBorderPixel':[120,90,60,255],'descriptorAndFilenameHashesMatch':True}
    receipt['controls'].append(run('actual-hash-valid-png-border-red',args=('--verify-exports',),error='Bench ground mount decoded silhouette clips frame border'))
   finally:
    MANIFEST.write_bytes(manifest_bytes)
    if bad_image:bad_image.unlink(missing_ok=True)
   receipt['controls'].append(run('exact-png-descriptor-restore-green',args=('--verify-exports',)))
   receipt['controls'].append(run('four-canonical-producer-repeats-green',args=('--repeat-four',)))
 finally:SOURCE.write_bytes(source_bytes);PRODUCER.write_bytes(producer_bytes)
 after={p.relative_to(ROOT).as_posix():sha(p.read_bytes())for p in sorted(protected)}
 if before!=after:raise AssertionError('Exact original/model/producer/PNG/registry/context restore failed')
 receipt['protectedAfter']=after;receipt['exactRestoredFiles']=len(before)
 (REPORT/('actual-source-controls.json'if source_only else'actual-production-controls.json')).write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
 print('BENCH_GROUND_MOUNTS_PRODUCTION_CONTROLS_GREEN',len(before),'exact restored files',flush=True)
if __name__=='__main__':main()
