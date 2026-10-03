"""Actual isolated production mutations; restore every byte in finally. No renderer/browser."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'docs/research/2026-10-03-public-room-art-context-coverage'
NODE_BIN = Path(os.environ['USERPROFILE']) / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
PNPM = Path(os.environ['LOCALAPPDATA']) / 'node/corepack/v1/pnpm/11.22.0/bin/pnpm.cjs'
ENV = dict(os.environ, NO_COLOR='1', FORCE_COLOR='0')
ENV['PATH'] = str(NODE_BIN) + os.pathsep + str(Path(os.environ['TEMP']) / 'lockstate-pnpm-11-22-20261002') + os.pathsep + ENV['PATH']
TEST = 'tests/unit/public-room-oblique-context-coverage.test.ts'
MAPPING = ROOT / 'src/rendering/assets/oblique-object-mapping.ts'
REGISTRY = ROOT / 'public/game-content/oblique-module-registry.v1.json'


def digest(body):
    return hashlib.sha256(body).hexdigest()


def run(label, tests, must_fail=False):
    result = subprocess.run([str(NODE_BIN / 'node.exe'), str(PNPM), '--config.verify-deps-before-run=false',
                             'test', *tests, '--reporter=dot'], cwd=ROOT, env=ENV, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=60)
    output = result.stdout + result.stderr
    (REPORT / (label + '.log')).write_text('\n'.join(line.rstrip() for line in output.splitlines()).rstrip() + '\n', encoding='utf-8')
    if (result.returncode != 0) != must_fail:
        raise AssertionError(f'{label}: unexpected actual exit {result.returncode}')
    print(label, result.returncode)
    return {'label': label, 'exitCode': result.returncode}


def protected_files():
    paths = {MAPPING, REGISTRY}
    authored = (ROOT / TEST).read_text(encoding='utf-8-sig').split('const expected:', 1)[1].split('const publicRoot', 1)[0]
    selected_assets = set(re.findall(r"'((?:furniture|fixture|utility)\.[^']+)'", authored))
    for entry in json.loads(REGISTRY.read_text(encoding='utf-8-sig'))['entries']:
        if entry['assetId'] not in selected_assets:
            continue
        path = ROOT / ('public' + entry['manifest'])
        paths.add(path)
        descriptor = json.loads(path.read_text(encoding='utf-8-sig'))
        paths.add(ROOT / descriptor['source'])
        for dep in descriptor.get('sourceDependencies', []):
            paths.add(ROOT / dep['source'])
        for frame in descriptor['frames']:
            paths.add(ROOT / ('public' + frame['image']))
    for name in ['room-template-catalog.ts', 'room-catalog.ts', 'object-catalog.ts']:
        paths.add(ROOT / 'src/content' / name)
    paths.add(ROOT / 'src/simulation/construction/definition.ts')
    return {str(path.relative_to(ROOT)).replace('\\', '/'): digest(path.read_bytes()) for path in sorted(paths)}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    originals = {path: path.read_bytes() for path in [MAPPING, REGISTRY]}
    before = protected_files()
    runs = []
    try:
        runs.append(run('initial-183-GREEN', [TEST]))
        source = originals[MAPPING].decode('utf-8-sig')
        line = "    'object.waste-bin': 'fixture.garbage-room.waste-bin',"
        assert source.count(line) == 1
        MAPPING.write_text(source.replace(line, ''), encoding='utf-8')
        runs.append(run('actual-Garbage-context-omission-RED', [TEST], must_fail=True))
        runs.append(run('old-default-only-coverage-still-GREEN-under-context-omission',
                        ['tests/unit/room-template-oblique-art-coverage.test.ts']))
        MAPPING.write_bytes(originals[MAPPING])
        registry = json.loads(originals[REGISTRY].decode('utf-8-sig'))
        entries = registry['entries']
        assert sum(entry['assetId'] == 'furniture.classroom.student-chair' for entry in entries) == 1
        registry['entries'] = [entry for entry in entries if entry['assetId'] != 'furniture.classroom.student-chair']
        REGISTRY.write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8')
        runs.append(run('actual-Student-registry-omission-RED', [TEST], must_fail=True))
    finally:
        for path, body in originals.items():
            path.write_bytes(body)
    after = protected_files()
    assert after == before, 'Protected source/render/catalogue or production bytes drifted after restoration'
    runs.append(run('exact-restored-183-GREEN', [TEST]))
    receipt = {'base': 'a7db8b1fe3c2ee7340213b71dad4580a40d6bc10', 'runs': runs,
               'protectedFiles': len(before), 'allProtectedBytesExactlyRestored': before == after,
               'protectedSha256': before, 'browserOrServer': False, 'newModelOrRender': False}
    (REPORT / 'actual-two-production-controls-exact-restoration.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print('EXACT_RESTORE', len(before), 'protected files')


if __name__ == '__main__':
    main()
