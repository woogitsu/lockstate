"""Actual medicine cabinet producer/source/consumer negatives with exact file restoration."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/research/2026-10-04-medicine-cabinet-retained-cycles'
SCRATCH = ROOT / 'assets/intermediate/medicine-cabinet-cycles-controls'
SOURCE = ROOT / 'assets/source/blender/fixture.medicine-cabinet.soft-light.blend'
PRODUCER = ROOT / 'tooling/blender/render-medicine-cabinet-cycles.py'
MANIFEST = ROOT / 'public/game-content/oblique-fixture.medicine-cabinet.v1.json'
HISTORY = ROOT / 'assets/source/blender/fixture.medicine-cabinet.workbench-descriptor.v1.json'
REGISTRY = ROOT / 'public/game-content/oblique-module-registry.v1.json'
BLENDER = os.environ.get('LOCKSTATE_BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
CLI = [BLENDER, '--background', '--factory-startup', '--threads', '1', '--python-exit-code', '1']
NODE = Path(os.environ['USERPROFILE']) / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
sha = lambda body: hashlib.sha256(body).hexdigest()

def run(label, command, expected=None):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, timeout=60)
    text = (result.stdout + result.stderr).decode('utf-8', errors='replace')
    (REPORT / (label + '.log')).write_text(text, encoding='utf-8', newline='\n')
    if expected is None and result.returncode: raise AssertionError(label + '\n' + text)
    if expected is not None and (result.returncode == 0 or expected not in text): raise AssertionError(label + '\n' + text)
    print(label, 'RED' if expected else 'GREEN', result.returncode, flush=True)
    return {'label': label, 'exitCode': result.returncode, 'expectedFailure': expected}

def blender(label, flags, expected=None, script=PRODUCER):
    return run(label, CLI + ['--python', str(script), '--', *flags], expected)

def consumer(label, expected=None):
    return run(label, [str(NODE), 'node_modules/vitest/vitest.mjs', 'run',
               'tests/unit/oblique-medicine-cabinet-modern-consumer.test.ts', '--maxWorkers=4'], expected)

def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    protected = {SOURCE, PRODUCER, MANIFEST, HISTORY, REGISTRY,
                 ROOT / 'tooling/blender/prepare-medicine-cabinet-cycles.py'}
    for folder in ('src', 'tests/browser'):
        protected.update(p for p in (ROOT / folder).rglob('*') if p.is_file())
    protected.update((ROOT / 'assets/source/blender').glob('fixture.medicine-cabinet.*'))
    for path in (MANIFEST, HISTORY):
        protected.update(ROOT / 'public' / row['image'].lstrip('/') for row in json.loads(path.read_text())['frames'])
    before = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted(protected)}
    originals = {p: p.read_bytes() for p in (SOURCE, PRODUCER, MANIFEST, REGISTRY)}
    controls = []; receipt = {'controls': controls, 'protectedBefore': before, 'nativeRun': False}
    try:
        mutant = SCRATCH / 'disconnect-actual-pin.py'
        mutant.write_text("from pathlib import Path\nimport bpy\np=Path.cwd()/'assets/source/blender/fixture.medicine-cabinet.soft-light.blend'\nbpy.ops.wm.open_mainfile(filepath=str(p))\nbpy.data.objects['angled-medicine-cabinet.left lower hinge continuous fixing shaft'].location.z+=1\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(p))\n", encoding='utf-8', newline='\n')
        try:
            controls.append(blender('actual-saved-source-mutant-written', (), script=mutant))
            receipt['actualSavedMutantSourceSha256'] = sha(SOURCE.read_bytes())
            if receipt['actualSavedMutantSourceSha256'] == sha(originals[SOURCE]): raise AssertionError('Saved model did not mutate')
            controls.append(blender('actual-source-fixing-RED', ('--verify',), 'Medicine cabinet actual fixing lacks triangle-interior contact'))
        finally: SOURCE.write_bytes(originals[SOURCE])
        controls.append(blender('exact-source-restore-GREEN', ('--verify',)))
        try:
            current = originals[PRODUCER].decode()
            omitted = current.replace('    exporter.configure = lambda model: (*configure(), TARGET)', '    # Actual dedicated configure installation omitted for production control.')
            if omitted == current: raise AssertionError('Real selected producer callback was not omitted')
            PRODUCER.write_text(omitted, encoding='utf-8', newline='\n')
            controls.append(blender('actual-selected-producer-omission-RED', ('--verify-selected',), 'Medicine cabinet retained/authored mesh set changed'))
        finally: PRODUCER.write_bytes(originals[PRODUCER])
        controls.append(blender('exact-selected-producer-restore-GREEN', ('--verify-selected',)))
        try:
            MANIFEST.write_bytes(HISTORY.read_bytes())
            controls.append(consumer('actual-old-Workbench-consumer-RED', 'AssertionError'))
        finally: MANIFEST.write_bytes(originals[MANIFEST])
        controls.append(consumer('exact-current-consumer-restore-GREEN'))
        try:
            registry = json.loads(originals[REGISTRY]); registry['entries'] = [r for r in registry['entries'] if r['assetId'] != 'fixture.medicine-cabinet.variants']
            REGISTRY.write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8', newline='\n')
            controls.append(consumer('actual-registry-omission-RED', 'AssertionError'))
        finally: REGISTRY.write_bytes(originals[REGISTRY])
        controls.append(consumer('exact-registry-restore-GREEN'))
        controls.append(blender('decoded-actual72-exports-GREEN', ('--verify-exports',)))
    finally:
        for path, body in originals.items(): path.write_bytes(body)
    after = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted(protected)}
    if after != before: raise AssertionError('Actual model/producer/history/consumer restoration was not byte exact')
    receipt.update({'protectedAfter': after, 'exactRestoredFiles': len(before)})
    (REPORT / 'actual-production-controls.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('MEDICINE_CABINET_ACTUAL_FOUR_NEGATIVES_EXACT_RESTORE_GREEN', len(before), flush=True)

def canonical_entry_controls():
    # Bounded continuation: invoke the real entries/configure without rerender72.
    SCRATCH.mkdir(parents=True, exist_ok=True)
    canonical = ROOT / 'tooling/blender/render-medicine-cabinet-detail-oblique.py'
    shared = ROOT / 'tooling/blender/render-medical-oblique.py'
    originals = {p: p.read_bytes() for p in (canonical, shared)}
    previous = json.loads((REPORT / 'actual-production-controls.json').read_text())
    protected = set(previous['protectedAfter']) | {p.relative_to(ROOT).as_posix() for p in originals}
    before = {p: sha((ROOT / p).read_bytes()) for p in sorted(protected)}
    controls = []
    canonical_check = SCRATCH / 'actual-canonical-medicine-entry.py'
    canonical_check.write_text("from pathlib import Path\nimport runpy,sys,bpy\nr=Path.cwd()\nsys.argv=['render-medicine-cabinet-detail-oblique.py','--','--verify']\ntry:runpy.run_path(str(r/'tooling/blender/render-medicine-cabinet-detail-oblique.py'),run_name='__main__')\nexcept SystemExit as e:\n if e.code not in (None,0):raise\ns=bpy.context.scene\nassert Path(bpy.data.filepath)==r/'assets/source/blender/fixture.medicine-cabinet.soft-light.blend' and s.render.engine=='CYCLES','Actual canonical Medicine entry did not select saved Cycles'\nassert s.cycles.samples==128 and s.cycles.use_denoising and sum(o.type=='MESH' for o in s.objects)==71\nprint('ACTUAL_CANONICAL_MEDICINE_SAVED_CYCLES_GREEN',flush=True)\n", encoding='utf-8', newline='\n')
    shared_check = SCRATCH / 'actual-shared-medicine-configure.py'
    shared_check.write_text("from pathlib import Path\nimport importlib.util,bpy\nr=Path.cwd()\nspec=importlib.util.spec_from_file_location('actual_shared_medical',r/'tooling/blender/render-medical-oblique.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nassert m.exporter.MODELS[0]==('furniture.medical-bed.variants','furniture.medical-bed.angled-detail.blend','oblique-furniture.medical-bed.v1.json',1,2,1.,1.,.675000011920929)\nmodel=m.exporter.MODELS[1]\nassert model==('fixture.medicine-cabinet.variants','fixture.medicine-cabinet.soft-light.blend','oblique-fixture.medicine-cabinet.v1.json',1,1,1.,1.,.5899999737739563)\nscene,camera,target=m.exporter.configure(model)\nassert Path(bpy.data.filepath)==r/'assets/source/blender/fixture.medicine-cabinet.soft-light.blend'\nassert scene.render.engine=='CYCLES' and scene.cycles.samples==128 and scene.cycles.use_denoising\nassert list(target)==[.5,.5,.5899999737739563] and camera.data.ortho_scale==4\nfor yaw in m.exporter.YAW:\n for elevation in m.exporter.ELEVATION:m.exporter.point_camera(camera,target,yaw,elevation)\nprint('ACTUAL_SHARED_MEDICINE_SAVED_CYCLES_CAMERA72_GREEN',flush=True)\n", encoding='utf-8', newline='\n')
    try:
        dispatch = "if __name__ == '__main__':\n    modern = load_module('medicine_cabinet_retained_cycles_entry', HERE / 'render-medicine-cabinet-cycles.py')\n    modern.main()\n    raise SystemExit(0)\n"
        text = originals[canonical].decode().replace('\r\n', '\n')
        if text.count(dispatch) != 1: raise AssertionError('Canonical actual entry dispatch was not uniquely found')
        try:
            canonical.write_text(text.replace(dispatch, ''), encoding='utf-8', newline='\n')
            controls.append(blender('actual-canonical-entry-omission-RED', (), 'Actual canonical Medicine entry did not select saved Cycles', script=canonical_check))
        finally: canonical.write_bytes(originals[canonical])
        controls.append(blender('exact-canonical-entry-restore-GREEN', (), script=canonical_check))
        callback = "    if model[0] == 'fixture.medicine-cabinet.variants':\n        dedicated_spec = importlib.util.spec_from_file_location(\n            'medicine_cabinet_saved_cycles', HERE / 'render-medicine-cabinet-cycles.py')\n        dedicated = importlib.util.module_from_spec(dedicated_spec)\n        dedicated_spec.loader.exec_module(dedicated)\n        scene, camera = dedicated.configure()\n        return scene, camera, dedicated.TARGET\n"
        text = originals[shared].decode().replace('\r\n', '\n')
        if text.count(callback) != 1: raise AssertionError('Shared actual entry callback was not uniquely found')
        try:
            shared.write_text(text.replace(callback, ''), encoding='utf-8', newline='\n')
            controls.append(blender('actual-shared-Infirmary-omission-RED', (), 'Medicine cabinet retained/authored mesh set changed', script=shared_check))
        finally: shared.write_bytes(originals[shared])
        controls.append(blender('exact-shared-Infirmary-restore-GREEN', (), script=shared_check))
        controls.append(blender('actual-canonical-decoded72-GREEN', ('--verify-exports',), script=canonical))
    finally:
        for path, body in originals.items(): path.write_bytes(body)
    after = {p: sha((ROOT / p).read_bytes()) for p in sorted(protected)}
    if before != after: raise AssertionError('Canonical/shared entry restoration is not byte exact')
    receipt = {'controls': controls, 'protectedBefore': before, 'protectedAfter': after,
               'exactRestoredFiles': len(before), 'nativeRun': False, 'realAdditionalRenders': 0}
    (REPORT / 'actual-canonical-entry-controls.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('MEDICINE_CANONICAL_SHARED_ACTUAL_OMISSIONS_EXACT_RESTORE_GREEN', len(before), flush=True)

if __name__ == '__main__':
    if '--canonical-entry-controls' in sys.argv: canonical_entry_controls()
    else: main()
