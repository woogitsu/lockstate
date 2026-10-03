"""Actual delivered-body source assertion omission, isolated copy, exact finally restore."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'docs/research/2026-10-03-reception-registration-desk-native-preparation'
NODE_BIN = Path(os.environ['USERPROFILE']) / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
PNPM = Path(os.environ['LOCALAPPDATA']) / 'node/corepack/v1/pnpm/11.22.0/bin/pnpm.cjs'
ENV = dict(os.environ, NO_COLOR='1', FORCE_COLOR='0')
ENV['PATH'] = str(NODE_BIN) + os.pathsep + str(Path(os.environ['TEMP']) / 'lockstate-pnpm-11-22-20261002') + os.pathsep + ENV['PATH']
OBSERVER = ROOT / 'tests/browser/native-reception-room-evidence.ts'
TEST = 'tests/unit/native-reception-registration-desk-evidence.test.ts'


def fingerprints():
    paths = {OBSERVER, ROOT / 'tests/browser/native-reception-room.recipe.ts', ROOT / 'tests/fixtures/native-reception-room-plan.ts',
             ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'public/game-content/oblique-module-registry.v1.json'}
    for name in ['oblique-furniture-reception-registration-desk.v1.json', 'oblique-furniture-reception-waiting-armchair.v1.json']:
        descriptor = ROOT / 'public/game-content' / name
        paths.add(descriptor)
        data = json.loads(descriptor.read_text(encoding='utf-8-sig'))
        paths.add(ROOT / data['source'])
        for dep in data.get('sourceDependencies', []):
            paths.add(ROOT / dep['source'])
        for frame in data['frames']:
            paths.add(ROOT / ('public' + frame['image']))
    for name in ['room-template-catalog.ts', 'room-catalog.ts', 'object-catalog.ts']:
        paths.add(ROOT / 'src/content' / name)
    paths.add(ROOT / 'src/simulation/construction/definition.ts')
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}


def run(label, red=False):
    result = subprocess.run([str(NODE_BIN / 'node.exe'), str(PNPM), '--config.verify-deps-before-run=false', 'test', TEST, '--reporter=dot'],
                            cwd=ROOT, env=ENV, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
    (REPORT / (label + '.log')).write_text('\n'.join(line.rstrip() for line in (result.stdout + result.stderr).splitlines()).rstrip() + '\n', encoding='utf-8')
    assert (result.returncode != 0) == red, (label, result.returncode)
    print(label, result.returncode)
    return {'label': label, 'exitCode': result.returncode}


def main():
    before = fingerprints()
    original = OBSERVER.read_bytes()
    runs = [run('initial-local-delivered-body-5-GREEN')]
    try:
        source = original.decode('utf-8-sig')
        guard = 'sourceSha256: art.sourceSha256, '
        assert source.count(guard) == 1
        OBSERVER.write_text(source.replace(guard, ''), encoding='utf-8')
        runs.append(run('actual-native-observer-source-guard-omission-RED', red=True))
    finally:
        OBSERVER.write_bytes(original)
    assert fingerprints() == before
    runs.append(run('exact-restored-local-delivered-body-5-GREEN'))
    (REPORT / 'actual-source-guard-RED-exact-restoration-GREEN.json').write_text(json.dumps({
        'base': '09282871d9cf27f2bd222ad936826aa397861ffd', 'runs': runs,
        'protectedFiles': len(before), 'protectedSha256': before, 'allProtectedBytesExactlyRestored': True,
        'actualMutation': 'Only remove sourceSha256 from assertReceptionDeliveredArt native observer assertion',
        'nativeBrowserRun': False, 'newRender': False,
    }, indent=2) + '\n', encoding='utf-8')
    print('EXACT_RESTORE', len(before))


if __name__ == '__main__':
    main()
