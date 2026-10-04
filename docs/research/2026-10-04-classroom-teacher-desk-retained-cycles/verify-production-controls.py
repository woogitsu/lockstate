"""Bounded actual source/producer/decoded-PNG/consumer mutations; exact restoration."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
from PIL import Image
ROOT=Path.cwd()
REPORT=ROOT/'docs/research/2026-10-04-classroom-teacher-desk-retained-cycles'
BLENDER=Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
NODE=Path('C:/Users/matma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
SOURCE=ROOT/'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'
PRODUCER=ROOT/'tooling/blender/render-classroom-teacher-desk-cycles.py'
CANONICAL=ROOT/'tooling/blender/render-classroom-teacher-desk-oblique.py'
MANIFEST=ROOT/'public/game-content/oblique-furniture-classroom-teacher-desk.v1.json'
REGISTRY=ROOT/'public/game-content/oblique-module-registry.v1.json'
HISTORY=ROOT/'assets/source/blender/furniture.classroom.teacher-desk.workbench-descriptor.v1.json'
controls=[]
held={p:p.read_bytes() for folder in ['assets/source/blender','public/game-content','public/assets/environment/oblique','tooling/blender','tests/browser','src/rendering','src/ui'] for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
def hashes():return {p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in held}
before=hashes()
def command(label,args,needle=None):
 env=os.environ.copy();env['PATH']=str(NODE.parent)+os.pathsep+env['PATH']
 result=subprocess.run(args,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
 (REPORT/(label+'.log')).write_text(result.stdout,encoding='utf-8')
 controls.append({'label':label,'exitCode':result.returncode,'expectedFailure':needle})
 if needle is None:
  if result.returncode!=0:raise ValueError('Actual restored GREEN failed '+label)
 elif result.returncode==0 or needle not in result.stdout:raise ValueError('Actual expected RED absent '+label)
 return result

def blender(label,script,flag,needle=None):
 return command(label,[str(BLENDER),'--background','--threads','1','--python-exit-code','1','--python',str(script),'--',flag],needle)
def consumer(label,needle=None):
 return command(label,[str(NODE),'node_modules/vitest/vitest.mjs','run','tests/unit/oblique-classroom-teacher-desk-modern-consumer.test.ts','--reporter=verbose'],needle)
def mutate_source(label,body,needle):
 script=REPORT/(label+'-mutator.py')
 script.write_text("from pathlib import Path\nimport bpy\nbpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'))\n"+body+"\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'))\n",encoding='utf-8')
 command(label+'-actual-save',[str(BLENDER),'--background','--threads','1','--python-exit-code','1','--python',str(script)])
 mutant=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
 try:blender(label,PRODUCER,'--verify',needle)
 finally:SOURCE.write_bytes(held[SOURCE])
 blender(label+'-exact-restore',PRODUCER,'--verify')
 return mutant
try:
 mutant=mutate_source('actual-source-contact-RED',"bpy.data.objects['Classroom teacher desk.desktop textbook rack base'].location.z += .8",'Classroom teacher desk actual contact disconnected: Classroom teacher desk.desktop textbook rack base / laminate desktop')
 graph_mutant=mutate_source('actual-source-authored-input-RED',"bpy.data.materials['warm oak laminate'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.8,.8,.8,1)",'Teacher full shader graph changes exceed exact authored RGBA/roughness repair')
 light_mutant=mutate_source('actual-source-light-RED',"bpy.data.objects.remove(bpy.data.objects['Modern draft soft warm key'],do_unlink=True)",'actual bounded saved soft lighting changed')
 PRODUCER.write_text(held[PRODUCER].decode().replace("SOURCE_NAME = 'furniture.classroom.teacher-desk.soft-light.blend'","SOURCE_NAME = 'furniture.classroom.teacher-desk.blend'"),encoding='utf-8')
 try:blender('actual-producer-dispatch-RED',PRODUCER,'--verify','dedicated producer dispatch changed')
 finally:PRODUCER.write_bytes(held[PRODUCER])
 blender('actual-producer-dispatch-exact-restore',PRODUCER,'--verify')
 catalog=json.loads(held[MANIFEST]);row=catalog['frames'][0];original=ROOT/'public'/row['image'].lstrip('/')
 image=Image.open(original).convert('RGBA');image.putpixel((0,0),(120,90,60,255))
 temporary=REPORT/'hash-valid-border-mutant.png';image.save(temporary)
 bad=temporary.read_bytes();badsha=hashlib.sha256(bad).hexdigest();badpath=original.with_name(original.name.replace(row['sha256'][:12],badsha[:12]));badpath.write_bytes(bad)
 row['sha256']=badsha;row['image']='/'+badpath.relative_to(ROOT/'public').as_posix();MANIFEST.write_text(json.dumps(catalog),encoding='utf-8')
 try:blender('actual-hash-valid-PNG-RED',PRODUCER,'--verify-exports','decoded silhouette clips frame border')
 finally:MANIFEST.write_bytes(held[MANIFEST]);badpath.unlink()
 blender('actual-hash-valid-PNG-exact-restore',PRODUCER,'--verify-exports')
 MANIFEST.write_bytes(HISTORY.read_bytes())
 try:consumer('actual-old-Workbench-consumer-RED','soft-light.blend')
 finally:MANIFEST.write_bytes(held[MANIFEST])
 consumer('actual-old-Workbench-consumer-exact-restore')
 registry=json.loads(held[REGISTRY]);registry['entries']=[row for row in registry['entries'] if row['assetId']!='furniture.classroom.teacher-desk'];REGISTRY.write_text(json.dumps(registry),encoding='utf-8')
 try:consumer('actual-registry-omission-RED','furniture.classroom.teacher-desk')
 finally:REGISTRY.write_bytes(held[REGISTRY])
 consumer('actual-registry-omission-exact-restore')
 text=held[CANONICAL].decode();text=text.replace('    modern.main()','    scene, camera, target = configure(MODEL)\n    modern.prepare.verify_scene(scene, camera, modern.EXPECTED)')
 CANONICAL.write_text(text,encoding='utf-8')
 try:blender('actual-canonical-callback-RED',CANONICAL,'--verify','Teacher full shader graph changes exceed exact authored RGBA/roughness repair')
 finally:CANONICAL.write_bytes(held[CANONICAL])
 blender('actual-canonical-callback-exact-restore',CANONICAL,'--verify')
 after=hashes()
 if after!=before:
  (REPORT/'actual-restoration-differences.json').write_text(json.dumps({key:[before[key],after[key]] for key in before if before[key]!=after[key]},indent=2),encoding='utf-8')
  raise ValueError('Protected bytes not exactly restored')
 receipt={'actualSavedMutantSourceSha256':mutant,'actualSavedLightMutantSourceSha256':light_mutant,'actualSavedAuthoredInputMutantSourceSha256':graph_mutant,'controls':controls,'protectedBefore':before,'protectedAfter':after,'exactRestoredFiles':len(held),'nativeRun':False,'hashValidBadPNG':{'matchingDescriptorAndFilenameSHA':True,'actualDecodedRGBA':list(image.size),'badSha256':badsha}}
 (REPORT/'actual-production-controls.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
 print('ACTUAL_TEACHER8_RED_EXACT_RESTORE_GREEN',len(held),flush=True)
finally:
 for p,body in held.items():
  if p.read_bytes()!=body:p.write_bytes(body)
