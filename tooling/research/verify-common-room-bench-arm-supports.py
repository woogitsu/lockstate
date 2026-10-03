"""Exercise actual saved Blender production mutations, then restore exact bytes.

Run outside Blender with Python. Optional positional argument names Blender.
All source/producer mutations are local to this worktree and restored in finally.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'docs/research/2026-10-03-common-room-bench-front-arm-supports'
SCRATCH = ROOT / 'assets/intermediate/common-room-arm-support-audit'
BLENDER = sys.argv[1] if len(sys.argv) > 1 else r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
PRODUCER = ROOT / 'tooling/blender/render-common-room-bench-oblique.py'
SOURCE = ROOT / 'assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
MANIFEST = ROOT / 'public/game-content/oblique-furniture.common-room-bench.v1.json'
UNIT_FILES = ['tests/unit/oblique-common-room-bench-art.test.ts', 'tests/unit/oblique-common-room-bench-arm-supports-integrity.test.ts', 'tests/unit/oblique-common-room-bench-context.test.ts']
NODE = Path(r'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
PNPM = Path(os.environ['LOCALAPPDATA']) / 'node/corepack/v1/pnpm/11.22.0/bin/pnpm.cjs'
os.environ['PATH'] = str(NODE.parent) + os.pathsep + os.environ['PATH']
PROOF.mkdir(parents=True, exist_ok=True)
SCRATCH.mkdir(parents=True, exist_ok=True)
backups = {path: path.read_bytes() for path in [PRODUCER, SOURCE, PROVENANCE, MANIFEST]}
catalog = json.loads(backups[MANIFEST])
export_bytes = {ROOT / ('public' + frame['image']): (ROOT / ('public' + frame['image'])).read_bytes() for frame in catalog['frames']}
results = []

def run(label, args, green, expected=None):
    process = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding='utf-8', errors='replace')
    (PROOF / (label + '.log')).write_text(process.stdout, encoding='utf-8')
    assert (process.returncode == 0) == green, (label, process.returncode, process.stdout[-3000:])
    if expected:
        assert expected in process.stdout, (label, process.stdout[-3000:])
    results.append({'control': label, 'exitCode': process.returncode, 'expected': expected, 'expectGreen': green})
    print(label, process.returncode, flush=True)

def blender_args(script, *tail):
    return [BLENDER, '--background', '--factory-startup', '--python-exit-code', '1', '--python', str(script), '--', *tail]

def restore():
    for path, data in backups.items():
        path.write_bytes(data)

new_png = None
try:
    run('actual-producer-green-before', blender_args(PRODUCER, '--verify'), True, 'COMMON_ROOM35/8GRAPHS/4CONTACTS/72CAMERAS/4OCCUPIED_GREEN')
    # A genuine source mutation with its updated source digest gets past the
    # identity check; the actual contact geometry must still refuse it.
    mutation = SCRATCH / 'actual-riser-disconnect.py'
    mutation.write_text("import bpy\nfrom pathlib import Path\nimport json,hashlib\nsource=Path(" + repr(str(SOURCE)) + ")\nbpy.ops.wm.open_mainfile(filepath=str(source))\nbpy.data.objects['physical-common-room-bench.front arm riser 0'].location.z += .15\nbpy.context.preferences.filepaths.save_version=0\nbpy.ops.wm.save_as_mainfile(filepath=str(source))\np=source.with_suffix('.provenance.json');r=json.loads(p.read_text());r['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest();p.write_text(json.dumps(r))\n", encoding='utf-8')
    run('actual-saved-riser-mutation', blender_args(mutation), True)
    run('actual-producer-disconnected-riser-red', blender_args(PRODUCER, '--verify'), False, 'lacks real triangle-interior contact')
    restore()
    original_dispatch = "SOURCE = ROOT / 'assets/source/blender/furniture.common-room.upholstered-bench.blend'\n"
    text = backups[PRODUCER].decode('utf-8').replace("PROVENANCE = SOURCE.with_suffix('.provenance.json')", "PROVENANCE = SOURCE.with_suffix('.provenance.json')\n" + original_dispatch)
    PRODUCER.write_text(text, encoding='utf-8')
    run('actual-producer-wrong-dispatch-red', blender_args(PRODUCER, '--verify'), False, 'Common Room producer dispatch source changed')
    restore()
    text = backups[PRODUCER].decode('utf-8').replace('camera_data.ortho_scale = ORTHO_SCALE_TILES', 'camera_data.ortho_scale = ORTHO_SCALE_TILES * .5')
    PRODUCER.write_text(text, encoding='utf-8')
    run('actual-producer-wrong-camera-span-red', blender_args(PRODUCER, '--verify'), False, 'Common Room actual accepted camera span changed')
    restore()
    # Hash and hashed filename stay mutually consistent; only real decoded
    # image content exposes this deliberately opaque boundary pixel.
    frame = catalog['frames'][0]
    original_png = ROOT / ('public' + frame['image'])
    image = Image.open(original_png).convert('RGBA')
    image.putpixel((0, 0), (48, 78, 80, 255))
    bad_png = SCRATCH / 'hash-valid-opaque-border.png'
    image.save(bad_png)
    digest = hashlib.sha256(bad_png.read_bytes()).hexdigest()
    new_png = original_png.with_name(original_png.name.replace(frame['sha256'][:12], digest[:12]))
    new_png.write_bytes(bad_png.read_bytes())
    bad_catalog = json.loads(backups[MANIFEST])
    bad_catalog['frames'][0]['sha256'] = digest
    bad_catalog['frames'][0]['image'] = '/assets/environment/oblique/' + new_png.name
    MANIFEST.write_text(json.dumps(bad_catalog), encoding='utf-8')
    run('actual-hash-valid-opaque-png-red', [str(NODE), str(PNPM), '--config.verify-deps-before-run=false', 'test', UNIT_FILES[1]], False, 'expected false to be true')
    restore()
    new_png.unlink()
    new_png = None
    run('actual-producer-green-restored', blender_args(PRODUCER, '--verify'), True, 'COMMON_ROOM35/8GRAPHS/4CONTACTS/72CAMERAS/4OCCUPIED_GREEN')
    run('actual-producer-72-rerender-restored', blender_args(PRODUCER), True, 'rendered 72 verified poses')
    assert MANIFEST.read_bytes() == backups[MANIFEST], 'Restored real producer changed descriptor bytes'
    assert all(path.read_bytes() == data for path, data in export_bytes.items()), 'Restored real producer changed export bytes'
    run('actual-unit-green-restored', [str(NODE), str(PNPM), '--config.verify-deps-before-run=false', 'test', *UNIT_FILES], True, '9 passed')
finally:
    restore()
    if new_png is not None:
        new_png.unlink(missing_ok=True)

assert all(path.read_bytes() == data for path, data in backups.items())
assert all(path.read_bytes() == data for path, data in export_bytes.items())
results.append({'exactRestoration': {'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'producerSha256': hashlib.sha256(PRODUCER.read_bytes()).hexdigest(), 'provenanceSha256': hashlib.sha256(PROVENANCE.read_bytes()).hexdigest(), 'manifestSha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(), 'all72ExportsByteEqual': True}})
(PROOF / 'actual-negative-controls-and-exact-restoration.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')

# Native producer output, enlarged by integer nearest-neighbour scaling only.
sheet = Image.new('RGB', (4 * 512, 2 * 548), '#e7e5e0')
draw = ImageDraw.Draw(sheet)
pixels = []
for column, yaw in enumerate((30, 120, 210, 300)):
    before = Image.open(SCRATCH / f'original-yaw{yaw:+03d}-elev40.png').convert('RGBA')
    frame = next(row for row in catalog['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 40)
    after = Image.open(ROOT / ('public' + frame['image'])).convert('RGBA')
    delta = sum(a != b for a, b in zip(before.getdata(), after.getdata()))
    pixels.append({'yawDegrees': yaw, 'elevationDegrees': 40, 'changedRGBAPixels': delta, 'nativeSourcePixels': [256, 256], 'scale': 2})
    for row, image in enumerate((before, after)):
        large = image.resize((512, 512), Image.Resampling.NEAREST)
        sheet.paste(large, (column * 512, row * 548 + 28), large)
        draw.text((column * 512 + 10, row * 548 + 8), f'{"Original 33" if row == 0 else "Retained 33 + 2 risers"} | yaw {yaw}, elev 40', fill='#172624')
sheet.save(PROOF / 'actual-four-yaw-original-and-detailed.png')
(PROOF / 'actual-four-yaw-pixel-deltas.json').write_text(json.dumps(pixels, indent=2) + '\n', encoding='utf-8')
print('COMMON_ROOM_ACTUAL_PRODUCER_NEGATIVES_EXACT_RESTORE_72_GREEN', flush=True)
