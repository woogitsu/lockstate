"""Publish a valid-hash clipped decoded Guard PNG, observe real consumer RED, restore exactly."""
from pathlib import Path
import json,hashlib,subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
node=Path(r'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
manifest=ROOT/'public/game-content/oblique-actor-guard.v1.json';original=manifest.read_bytes();catalog=json.loads(original);frame=catalog['frames'][0];source=ROOT/'public'/frame['image'].lstrip('/');bytes_=source.read_bytes();image=Image.open(source).convert('RGBA');image.putpixel((256,0),(30,50,70,255))
scratch=ROOT/'assets/intermediate/guard-legacy-render-fit';scratch.mkdir(parents=True,exist_ok=True);temp=scratch/'clipped-valid-hash.png';image.save(temp);digest=hashlib.sha256(temp.read_bytes()).hexdigest();target=source.with_name(source.name.replace(frame['sha256'][:12],digest[:12]));assert target.parent==source.parent and target.name.startswith('actor-guard-') and not target.exists()
command=[str(node),'node_modules/vitest/vitest.mjs','run','tests/unit/oblique-guard-belt-detail-integrity.test.ts']
try:
 target.write_bytes(temp.read_bytes());frame['image']='/assets/environment/oblique/'+target.name;frame['sha256']=digest;manifest.write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8',newline='\n')
 red=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8');(scratch/'decoded-consumer-red.log').write_text(red.stdout+red.stderr,encoding='utf-8')
 if red.returncode==0 or target.name not in red.stdout+red.stderr:raise AssertionError('Actual valid-signature/hash PNG did not fail its decoded border consumer')
finally:
 manifest.write_bytes(original)
 if target.exists():target.unlink()
assert source.read_bytes()==bytes_ and manifest.read_bytes()==original
final=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8');(scratch/'decoded-consumer-final.log').write_text(final.stdout+final.stderr,encoding='utf-8');assert final.returncode==0
(ROOT/'docs/research/2026-10-03-guard-legacy-render-fit/decoded-consumer-control.json').write_text(json.dumps({'actualValidSignatureHashAndFilenameMutation':True,'actualTopBorderOpaquePixel':[256,0],'expectedRedExit':red.returncode,'exactManifestAndOriginalPngBytesRestored':True,'finalRealConsumerGreen':True,'nativeAcceptanceClaimed':False},indent=2)+'\n')
print('ACTUAL_DECODED_VALIDHASH_EDGE_RED/EXACT_SOURCE_MANIFEST_RESTORE/FINAL_CONSUMER_GREEN')
