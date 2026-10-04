"""Actual medicine cabinet producer/source/consumer negatives with exact file restoration."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/research/2026-10-04-medical-bed-retained-cycles'
SCRATCH = ROOT / 'assets/intermediate/medical-bed-cycles-controls'
SOURCE = ROOT / 'assets/source/blender/furniture.medical-bed.soft-light.blend'
PRODUCER = ROOT / 'tooling/blender/render-medical-bed-cycles.py'
MANIFEST = ROOT / 'public/game-content/oblique-furniture.medical-bed.v1.json'
HISTORY = ROOT / 'assets/source/blender/furniture.medical-bed.workbench-descriptor.v1.json'
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
               'tests/unit/oblique-medical-bed-modern-consumer.test.ts', '--maxWorkers=4'], expected)

def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    protected = {SOURCE, PRODUCER, MANIFEST, HISTORY, REGISTRY,
                 ROOT / 'tooling/blender/prepare-medical-bed-cycles.py'}
    for folder in ('src', 'tests/browser'):
        protected.update(p for p in (ROOT / folder).rglob('*') if p.is_file())
    protected.update((ROOT / 'assets/source/blender').glob('furniture.medical-bed.*'))
    for path in (MANIFEST, HISTORY):
        protected.update(ROOT / 'public' / row['image'].lstrip('/') for row in json.loads(path.read_text())['frames'])
    before = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in sorted(protected)}
    originals = {p: p.read_bytes() for p in (SOURCE, PRODUCER, MANIFEST, REGISTRY)}
    controls = []; receipt = {'controls': controls, 'protectedBefore': before, 'nativeRun': False}
    try:
        mutant = SCRATCH / 'disconnect-actual-pin.py'
        mutant.write_text("from pathlib import Path\nimport bpy\np=Path.cwd()/'assets/source/blender/furniture.medical-bed.soft-light.blend'\nbpy.ops.wm.open_mainfile(filepath=str(p))\nbpy.data.objects['angled-medical-bed.left foot caster continuous axle'].location.z+=1\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(p))\n", encoding='utf-8', newline='\n')
        try:
            controls.append(blender('actual-saved-source-mutant-written', (), script=mutant))
            receipt['actualSavedMutantSourceSha256'] = sha(SOURCE.read_bytes())
            if receipt['actualSavedMutantSourceSha256'] == sha(originals[SOURCE]): raise AssertionError('Saved model did not mutate')
            controls.append(blender('actual-source-fixing-RED', ('--verify',), 'Medical bed actual fixing lacks triangle-interior contact'))
        finally: SOURCE.write_bytes(originals[SOURCE])
        controls.append(blender('exact-source-restore-GREEN', ('--verify',)))
        try:
            current = originals[PRODUCER].decode()
            omitted = current.replace('    exporter.configure = lambda model: (*configure(), TARGET)', '    # Actual dedicated configure installation omitted for production control.')
            if omitted == current: raise AssertionError('Real selected producer callback was not omitted')
            PRODUCER.write_text(omitted, encoding='utf-8', newline='\n')
            controls.append(blender('actual-selected-producer-omission-RED', ('--verify-selected',), 'Medical bed retained/authored mesh set changed'))
        finally: PRODUCER.write_bytes(originals[PRODUCER])
        controls.append(blender('exact-selected-producer-restore-GREEN', ('--verify-selected',)))
        try:
            MANIFEST.write_bytes(HISTORY.read_bytes())
            controls.append(consumer('actual-old-Workbench-consumer-RED', 'AssertionError'))
        finally: MANIFEST.write_bytes(originals[MANIFEST])
        controls.append(consumer('exact-current-consumer-restore-GREEN'))
        try:
            registry = json.loads(originals[REGISTRY]); registry['entries'] = [r for r in registry['entries'] if r['assetId'] != 'furniture.medical-bed.variants']
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
    print('MEDICAL_BED_ACTUAL_FOUR_NEGATIVES_EXACT_RESTORE_GREEN', len(before), flush=True)

if __name__ == '__main__': main()
