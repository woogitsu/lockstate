"""Real production source/dispatch/hash-valid PNG/consumer REDs and exact restores."""
from pathlib import Path
import copy
import hashlib
import json
import os
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / 'docs/research/2026-10-03-modern-square-wall-material-study'
BLENDER = Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
NODE = Path('C:/Users/matma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
PRODUCER = ROOT / 'tooling/blender/render-square-wall-retained-cycles.py'
SOURCE = ROOT / 'assets/source/blender/wall.square.brick.full.soft-light.blend'
MANIFEST = ROOT / 'public/game-content/oblique-square-brick-full-wall.v1.json'
REGISTRY = ROOT / 'public/game-content/oblique-module-registry.v1.json'
SELECTOR = ROOT / 'src/rendering/camera/oblique-world-projection.ts'


def sha(body):
    return hashlib.sha256(body).hexdigest()


def run(name, command, expected):
    environment = dict(os.environ)
    environment['PATH'] = str(NODE.parent) + os.pathsep + environment.get('PATH', '')
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', env=environment)
    (REPORT / (name + '.log')).write_text((result.stdout + result.stderr).rstrip() + '\n', encoding='utf-8', newline='\n')
    if result.returncode != expected:
        raise RuntimeError(name + ': expected exit' + str(expected) + ', got' + str(result.returncode))
    return {'name': name, 'exitCode': result.returncode, 'log': name + '.log'}


def blender(flag):
    return [str(BLENDER), '--background', '--factory-startup', '--threads', '1', '--python-exit-code', '1', '--python', str(PRODUCER), '--', flag]


def consumer():
    return [str(NODE), str(ROOT / 'node_modules/vitest/vitest.mjs'), 'run',
            'tests/unit/square-wall-retained-cycles-production.test.ts', '-t', 'existing full square wall consumers require']


def main():
    historical = json.loads((REPORT / 'actual-before-after.json').read_text(encoding='utf-8'))
    paths = {ROOT / path for path in historical['protectedBefore']}
    paths.update([SOURCE, PRODUCER, MANIFEST, REGISTRY, SELECTOR,
                  ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'src/rendering/world/appearance.ts',
                  ROOT / 'assets/source/blender/wall.square.brick.full.workbench-descriptor.v1.json',
                  REPORT / 'draft.wall.square.brick.full.literal-graphs.blend',
                  REPORT / 'draft.wall.square.brick.full.approved-materials.blend'])
    current = json.loads(MANIFEST.read_text(encoding='utf-8'))
    paths.update(ROOT / 'public' / frame['image'].lstrip('/') for frame in current['frames'])
    original = {path: path.read_bytes() for path in [SOURCE, PRODUCER, MANIFEST, REGISTRY, SELECTOR]}
    before = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(paths)}
    controls = []
    bad_path = None
    try:
        controls.append(run('production-actual-cap-mutant-write', blender('--mutate-saved-source'), 0))
        mutant_source = sha(SOURCE.read_bytes())
        if mutant_source == sha(original[SOURCE]): raise RuntimeError('Saved production cap source was not mutated')
        controls.append(run('production-source-semantic-RED', blender('--verify-only'), 1))
        SOURCE.write_bytes(original[SOURCE])
        controls.append(run('production-source-exact-restore-GREEN', blender('--verify-only'), 0))

        text = original[PRODUCER].decode('utf-8')
        old = "ASSET_ID = 'wall.square.brick.full'"
        if text.count(old) != 1: raise RuntimeError('Actual dispatch mutation target is not unique')
        PRODUCER.write_bytes(text.replace(old, "ASSET_ID = 'wall.square.brick.low'", 1).encode('utf-8'))
        controls.append(run('production-dispatch-RED', blender('--verify-only'), 1))
        PRODUCER.write_bytes(original[PRODUCER])
        controls.append(run('production-dispatch-exact-restore-GREEN', blender('--verify-only'), 0))

        frame = next(row for row in current['frames'] if row['yawDegrees'] == -45 and row['elevationDegrees'] == 45)
        good = ROOT / 'public' / frame['image'].lstrip('/')
        image = Image.open(good).convert('RGBA')
        image.putpixel((0, 0), (120, 90, 60, 255))
        temporary = ROOT / 'public/assets/environment/oblique/square-wall-owned-hash-valid-control.png'
        image.save(temporary)
        digest = sha(temporary.read_bytes())
        bad_path = temporary.with_name('square-brick-full-wall-yaw-045-elev45.' + digest[:12] + '.png')
        temporary.replace(bad_path)
        decoded = Image.open(bad_path)
        decoded.load()
        if decoded.size != (512, 512) or decoded.mode != 'RGBA' or decoded.getpixel((0, 0)) != (120, 90, 60, 255):
            raise RuntimeError('Actual hash-valid PNG mutation did not decode correctly')
        bad = copy.deepcopy(current)
        changed = next(row for row in bad['frames'] if row['yawDegrees'] == -45 and row['elevationDegrees'] == 45)
        changed['image'] = '/assets/environment/oblique/' + bad_path.name
        changed['sha256'] = digest
        MANIFEST.write_bytes((json.dumps(bad, indent=2) + '\n').encode('utf-8'))
        controls.append(run('production-hash-valid-PNG-RED', blender('--verify-exports'), 1))
        MANIFEST.write_bytes(original[MANIFEST])
        bad_path.unlink()
        bad_path = None
        controls.append(run('production-PNG-exact-restore-GREEN', blender('--verify-exports'), 0))

        MANIFEST.write_bytes((ROOT / 'assets/source/blender/wall.square.brick.full.workbench-descriptor.v1.json').read_bytes())
        controls.append(run('production-old-Workbench-consumer-RED', consumer(), 1))
        MANIFEST.write_bytes(original[MANIFEST])
        controls.append(run('production-current-consumer-exact-restore-GREEN', consumer(), 0))

        registry = json.loads(original[REGISTRY].decode('utf-8'))
        registry['entries'] = [row for row in registry['entries'] if row['assetId'] != 'wall.square.brick.full']
        REGISTRY.write_bytes((json.dumps(registry, indent=2) + '\n').encode('utf-8'))
        controls.append(run('production-registry-omission-RED', consumer(), 1))
        REGISTRY.write_bytes(original[REGISTRY])
        controls.append(run('production-registry-exact-restore-GREEN', consumer(), 0))

        text = original[SELECTOR].decode('utf-8')
        old = "? cutaway ? 'wall.square.brick.low' : 'wall.square.brick.full'"
        if text.count(old) != 1: raise RuntimeError('Actual existing world consumer mutation target is not unique')
        SELECTOR.write_bytes(text.replace(old, "? cutaway ? 'wall.square.brick.low' : 'wall.square.brick.low'", 1).encode('utf-8'))
        controls.append(run('production-built-square-selector-RED', consumer(), 1))
        SELECTOR.write_bytes(original[SELECTOR])
        controls.append(run('production-built-selector-exact-restore-GREEN', consumer(), 0))
        controls.append(run('production-four-independent-repeats-GREEN', blender('--repeat-four'), 0))
    finally:
        for path, body in original.items(): path.write_bytes(body)
        if bad_path is not None and bad_path.is_file(): bad_path.unlink()
    after = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(paths)}
    if before != after: raise RuntimeError('Protected source/72frames/floor/aliases/consumer bytes changed')
    receipt = {'controls': controls, 'actualSavedMutantSourceSha256': mutant_source,
               'hashValidBadPNG': {'matchingDescriptorAndFilenameSHA': True, 'sha256': digest,
                                  'actualDecodedRGBA': [512, 512], 'borderPixel': [120, 90, 60, 255]},
               'protectedCount': len(paths), 'protectedBefore': before, 'protectedAfter': after,
               'exactBytesRestored': True, 'nativeRun': False}
    (REPORT / 'actual-production-controls.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'controls': controls, 'protectedCount': len(paths), 'exactBytesRestored': True}))


if __name__ == '__main__':
    main()
