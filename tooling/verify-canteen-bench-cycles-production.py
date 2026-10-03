"""Bounded real saved-source/producer/PNG/context controls and exact restoration."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/research/2026-10-04-canteen-bench-retained-cycles'
SCRATCH = ROOT / 'assets/intermediate/canteen-bench-cycles-production-controls'
SOURCE = ROOT / 'assets/source/blender/furniture.corridor.bench.soft-light.blend'
PRODUCER = ROOT / 'tooling/blender/render-canteen-bench-cycles.py'
MANIFEST = ROOT / 'public/game-content/oblique-canteen-bench.v1.json'
HISTORY = ROOT / 'assets/source/blender/furniture.corridor.bench.workbench-descriptor.v1.json'
REGISTRY = ROOT / 'public/game-content/oblique-module-registry.v1.json'
BLENDER = os.environ.get('LOCKSTATE_BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
CLI = [BLENDER, '--background', '--factory-startup', '--threads', '1', '--python-exit-code', '1']
NODE = Path(os.environ['USERPROFILE']) / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
sha = lambda body: hashlib.sha256(body).hexdigest()


def run(label, command, error=None, timeout=60):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, timeout=timeout)
    text = (result.stdout + result.stderr).decode('utf-8', errors='replace')
    (REPORT / (label + '.log')).write_text('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n', encoding='utf-8', newline='\n')
    if (error and (result.returncode == 0 or error not in text)) or (not error and result.returncode):
        raise AssertionError(label + '\n' + text)
    print(label, 'RED' if error else 'GREEN', result.returncode, flush=True)
    return {'label': label, 'exitCode': result.returncode, 'expectedFailure': error}


def blender(label, args, error=None, script=PRODUCER):
    return run(label, CLI + ['--python', str(script), '--', *args], error)


def consumer(label, red=False):
    return run(label, [str(NODE), 'node_modules/vitest/vitest.mjs', 'run',
                      'tests/unit/oblique-canteen-bench-modern-consumer.test.ts', '--reporter=dot'], 'AssertionError' if red else None)


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    protected = {SOURCE,PRODUCER,MANIFEST,HISTORY,REGISTRY,
      ROOT/'tooling/blender/render-wooden-bench-oblique.py',ROOT/'tooling/blender/render-wooden-bench-ground-mounts-oblique.py',
      ROOT/'tooling/blender/render-kitchen-fixtures-oblique.py',ROOT/'tooling/blender/prepare-canteen-bench-cycles.py',
      ROOT/'assets/source/blender/furniture.corridor.bench.grounded-detail.blend',ROOT/'assets/source/blender/furniture.corridor.bench.grounded-detail.provenance.json',
      ROOT/'assets/source/blender/furniture.corridor.bench.angled-detail.blend',
      ROOT/'assets/source/blender/furniture.corridor.bench.angled-detail.provenance.json',
      ROOT/'assets/source/blender/furniture.corridor.bench.blend',ROOT/'assets/source/blender/furniture.corridor.bench.provenance.json',
      ROOT/'assets/source/blender/furniture.corridor.bench.soft-light.provenance.json',ROOT/'src/content/room-catalog.ts',ROOT/'src/content/room-template-catalog.ts'}
    original_receipt=json.loads((ROOT/'assets/source/blender/furniture.corridor.bench.provenance.json').read_text())
    protected.add(ROOT/original_receipt['originalSource'])
    protected.update((ROOT/'public/assets/environment/oblique').glob('furniture.corridor.bench.variants-*.png'))
    for path in (MANIFEST,HISTORY):
        protected.update(ROOT/'public'/frame['image'].lstrip('/') for frame in json.loads(path.read_text())['frames'])
    for folder in ['tests/browser','src/rendering','src/ui']:
        protected.update(path for path in (ROOT/folder).rglob('*') if path.is_file())
    before = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(protected)}
    originals = {path: path.read_bytes() for path in (SOURCE, PRODUCER, MANIFEST, REGISTRY)}
    controls = []
    receipt = {'controls': controls, 'protectedBefore': before}
    bad_image = None
    try:
        mutation = SCRATCH / 'disconnect-actual-canteen-rail.py'
        mutation.write_text("from pathlib import Path\nimport bpy\np=Path.cwd()/'assets/source/blender/furniture.corridor.bench.soft-light.blend'\nbpy.ops.wm.open_mainfile(filepath=str(p))\nbpy.data.objects['physical-bench.ground mounting shoe 0'].location.z+=1\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(p))\n", encoding='utf-8', newline='\n')
        try:
            controls.append(blender('actual-saved-source-mutant-written', (), script=mutation))
            receipt['actualSavedMutantSourceSha256'] = sha(SOURCE.read_bytes())
            if receipt['actualSavedMutantSourceSha256'] == sha(originals[SOURCE]):
                raise AssertionError('Actual saved source did not mutate')
            controls.append(blender('actual-source-contact-RED', ('--verify',), 'Bench floor mounting shoe actual contact disconnected'))
        finally:
            SOURCE.write_bytes(originals[SOURCE])
        controls.append(blender('exact-source-restore-GREEN', ('--verify',)))
        try:
            text = originals[PRODUCER].decode().replace("ASSET_ID = 'furniture.corridor.bench.variants'", "ASSET_ID = 'furniture.dining.table.wooden'")
            if text == originals[PRODUCER].decode():
                raise AssertionError('Real producer dispatch did not mutate')
            PRODUCER.write_text(text, encoding='utf-8', newline='\n')
            controls.append(blender('actual-producer-dispatch-RED', ('--verify',), 'Canteen wooden bench Cycles dedicated producer dispatch changed'))
        finally:
            PRODUCER.write_bytes(originals[PRODUCER])
        controls.append(blender('exact-dispatch-restore-GREEN', ('--verify',)))
        try:
            catalog = json.loads(originals[MANIFEST])
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (60, 40))
            with Image.open(ROOT / 'public' / frame['image'].lstrip('/')) as image:
                bad = image.convert('RGBA')
                bad.putpixel((0, 0), (120, 90, 60, 255))
                temporary = SCRATCH / 'valid-bad-border.png'
                bad.save(temporary)
            digest = sha(temporary.read_bytes())
            bad_image = ROOT / 'public/assets/environment/oblique' / f'furniture.corridor.bench.variants-yaw+60-elev40.{digest[:12]}.png'
            bad_image.write_bytes(temporary.read_bytes())
            with Image.open(bad_image) as decoded:
                decoded.load()
                assert decoded.size == (256, 256) and decoded.getpixel((0, 0)) == (120, 90, 60, 255)
            frame['sha256'] = digest
            frame['image'] = '/assets/environment/oblique/' + bad_image.name
            MANIFEST.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8', newline='\n')
            receipt['hashValidBadPNG'] = {'sha256': digest, 'actualDecodedRGBA': [256, 256], 'borderPixel': [120, 90, 60, 255], 'matchingDescriptorAndFilenameSHA': True}
            controls.append(blender('actual-hash-valid-PNG-RED', ('--verify-exports',), 'Bench ground mount decoded silhouette clips frame border'))
        finally:
            MANIFEST.write_bytes(originals[MANIFEST])
            if bad_image:
                bad_image.unlink(missing_ok=True)
        controls.append(blender('exact-PNG-descriptor-restore-GREEN', ('--verify-exports',)))
        try:
            MANIFEST.write_bytes(HISTORY.read_bytes())
            controls.append(consumer('actual-old-Workbench-consumer-RED', True))
        finally:
            MANIFEST.write_bytes(originals[MANIFEST])
        controls.append(consumer('exact-modern-descriptor-restore-GREEN'))
        try:
            catalog = json.loads(originals[REGISTRY])
            catalog['entries'] = [row for row in catalog['entries'] if row['assetId'] != 'furniture.corridor.bench.variants']
            REGISTRY.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8', newline='\n')
            controls.append(consumer('actual-registry-omission-RED', True))
        finally:
            REGISTRY.write_bytes(originals[REGISTRY])
        controls.append(consumer('exact-registry-restore-GREEN'))
        controls.append(blender('four-real-canonical-repeats-GREEN', ('--repeat-four',)))
    finally:
        for path, body in originals.items():
            path.write_bytes(body)
        if bad_image:
            bad_image.unlink(missing_ok=True)
    after = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(protected)}
    if before != after:
        raise AssertionError('Production/art/history/palette/consumer exact restoration failed')
    receipt.update({'protectedAfter': after, 'exactRestoredFiles': len(before), 'nativeRun': False})
    (REPORT / 'actual-production-controls.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('CANTEEN_BENCH_CYCLES_PRODUCTION_CONTROLS_EXACT_RESTORE_GREEN', len(before), flush=True)


def canonical_entry_controls():
    # Separate bounded continuation: no duplicate72 or four-repeat render.
    receipt_path = REPORT / 'actual-production-controls.json'
    receipt = json.loads(receipt_path.read_text())
    canonical = ROOT / 'tooling/blender/render-wooden-bench-oblique.py'
    detail = ROOT / 'tooling/blender/render-wooden-bench-ground-mounts-oblique.py'
    held = canonical.read_bytes()
    before = {name: sha((ROOT / name).read_bytes()) for name in receipt['protectedBefore']}
    if before != receipt['protectedAfter']:
        raise AssertionError('Canonical continuation requires exact previous restoration')
    try:
        text = held.decode().replace("CYCLES_PRODUCER = 'render-canteen-bench-cycles.py'", "CYCLES_PRODUCER = 'render-wooden-bench-oblique.py'")
        if text == held.decode():
            raise AssertionError('Actual original entry-point callback did not mutate')
        canonical.write_text(text, encoding='utf-8', newline='\n')
        receipt['controls'].append(blender('actual-canonical-callback-RED', ('--verify',), 'Canteen wooden bench canonical Cycles producer dispatch changed', script=canonical))
    finally:
        canonical.write_bytes(held)
    receipt['controls'].append(blender('exact-canonical-callback-restore-GREEN', ('--verify',), script=canonical))
    receipt['controls'].append(blender('actual-original-detail-entry-GREEN', ('--verify',), script=detail))
    after = {name: sha((ROOT / name).read_bytes()) for name in receipt['protectedBefore']}
    if after != before:
        raise AssertionError('Canonical continuation exact restoration failed')
    receipt['canonicalEntryProtectedBefore'] = before
    receipt['canonicalEntryProtectedAfter'] = after
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('CANTEEN_BENCH_ORIGINAL_ENTRYPOINT_REAL_CALLBACK_RESTORED_GREEN', flush=True)


if __name__ == '__main__':
    if '--canonical-entry-controls' in sys.argv:
        canonical_entry_controls()
    else:
        main()
