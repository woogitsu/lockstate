"""Dedicated Bench ground mounting shoes through the existing grounded square exporter.

Same accepted bench asset ID/descriptor and grounded 2x1 occupied footprint.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('bench_ground_mount_physical_source', HERE / 'build-wooden-bench-ground-mounts.py')
exporter = load('bench_ground_mount_existing_square_exporter', HERE / 'render-kitchen-fixtures-oblique.py')
ASSET_ID = 'furniture.corridor.bench.variants'
SOURCE_NAME = 'furniture.corridor.bench.grounded-detail.blend'
MANIFEST_NAME = 'oblique-canteen-bench.v1.json'
receipt = json.loads(builder.PROVENANCE.read_text(encoding='utf-8-sig'))
if ASSET_ID != receipt['assetId'] or SOURCE_NAME != Path(receipt['source']).name or MANIFEST_NAME != 'oblique-canteen-bench.v1.json':
    raise ValueError('Bench ground mounting shoes dedicated producer dispatch changed')
TARGET_Z = .44325
if receipt['acceptedCamera']['target'] != [1, .5, TARGET_Z]:
    raise ValueError('Bench ground mounting shoes measured original camera target changed')
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 2, 1, 1., 1., TARGET_Z)
exporter.MODELS = (MODEL,)
exporter.PREVIEW = ROOT / 'assets/intermediate/wooden-bench-ground-mounts-preview'
shared_configure = exporter.configure


def prepare_source(scene, model):
    if model != MODEL or model[0] != ASSET_ID or model[1] != SOURCE_NAME or model[2] != MANIFEST_NAME:
        raise ValueError('Bench ground mounting shoes dedicated producer dispatch changed')
    builder.verify_source(scene)


def configure(model):
    scene, camera, target = shared_configure(model, prepare_source)
    if (exporter.RESOLUTION_PX, exporter.ORTHO_SCALE_TILES, exporter.NOMINAL_PIXELS_PER_TILE) != (256, 4., 64.):
        raise ValueError('Bench ground mounting shoes canonical pixel scale changed')
    if camera.data.type != 'ORTHO' or abs(camera.data.ortho_scale - 4) > 1e-6 or target != Vector((1, .5, TARGET_Z)):
        raise ValueError('Bench ground mounting shoes actual camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Bench ground mounting shoes actual resolution changed')
    return scene, camera, target


shared_point_camera = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    shared_point_camera(camera, target, yaw, elevation)
    azimuth, tilt = exporter.math.radians(yaw), exporter.math.radians(elevation)
    expected = Vector((6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
                       -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth), 6 * exporter.math.sin(tilt)))
    offset = camera.location - target
    if (offset - expected).length > 1e-5 or (camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Bench ground mounting shoes actual camera basis/aim changed')


exporter.configure = configure
exporter.point_camera = point_camera
def validate_png(body):
    import struct, zlib
    if body[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('Bench ground mount frame is not PNG')
    offset, compressed, header = 8, b'', None
    while offset < len(body):
        length = struct.unpack('>I', body[offset:offset+4])[0]
        kind = body[offset+4:offset+8]; data = body[offset+8:offset+8+length]
        if zlib.crc32(kind+data)&0xffffffff != struct.unpack('>I',body[offset+8+length:offset+12+length])[0]:
            raise ValueError('Bench ground mount PNG CRC invalid')
        if kind == b'IHDR': header=struct.unpack('>IIBBBBB',data)
        elif kind == b'IDAT': compressed += data
        offset += length+12
    if header != (256,256,8,6,0,0,0): raise ValueError('Bench ground mount PNG dimensions/RGBA format changed')
    raw=zlib.decompress(compressed);stride=1024;previous=bytearray(stride);occupied=0
    if len(raw) != 256*(stride+1): raise ValueError('Bench ground mount PNG decoded length changed')
    for y in range(256):
        mode=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        if mode>4: raise ValueError('Bench ground mount PNG filter invalid')
        for x in range(stride):
            left=row[x-4] if x>=4 else 0;above=previous[x];corner=previous[x-4] if x>=4 else 0
            estimate=left+above-corner;distances=(abs(estimate-left),abs(estimate-above),abs(estimate-corner))
            predictor=(0,left,above,(left+above)//2,(left,above,corner)[distances.index(min(distances))])[mode]
            row[x]=(row[x]+predictor)&255
        if (y in (0,255) and any(row[3::4])) or row[3] or row[-1]:
            raise ValueError('Bench ground mount decoded silhouette clips frame border')
        occupied += sum(alpha>0 for alpha in row[3::4]);previous=row
    if occupied<=500: raise ValueError('Bench ground mount decoded frame has no complete visible model')


def verify_exports():
    catalog=json.loads((ROOT/'public/game-content'/MANIFEST_NAME).read_text())
    expected={'assetId':ASSET_ID,'source':receipt['source'],'sourceSha256':receipt['sourceSha256'],
              'resolutionPx':[256,256],'nominalPixelsPerTile':64,'pivotPx':[128,128],
              'cameraTargetTiles':[1,.5,TARGET_Z],'yawDegrees':list(exporter.YAW),'elevationDegrees':list(exporter.ELEVATION)}
    if any(catalog.get(k)!=v for k,v in expected.items()): raise ValueError('Bench ground mount actual exported descriptor dispatch/camera changed')
    if {(f['yawDegrees'],f['elevationDegrees']) for f in catalog['frames']} != {(y,e) for y in exporter.YAW for e in exporter.ELEVATION} or len(catalog['frames'])!=72:
        raise ValueError('Bench ground mount actual exported72 pose coverage changed')
    for frame in catalog['frames']:
        body=(ROOT/'public'/frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest()!=frame['sha256'] or not frame['image'].endswith('.'+frame['sha256'][:12]+'.png'):
            raise ValueError('Bench ground mount actual PNG body/path hash changed')
        validate_png(body)
    print('BENCH_GROUND_MOUNTS_EXPORTED_BODY_GREEN 72 genuinely decoded RGBA bodies',flush=True)


if __name__ == '__main__':
    if exporter.MODELS != (MODEL,):
        raise ValueError('Bench ground mounting shoes dedicated producer dispatch changed')
    if '--verify-exports' in sys.argv:
        configure(MODEL)
        verify_exports()
    elif '--verify' in sys.argv:
        scene, camera, target = configure(MODEL)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                point_camera(camera, target, yaw, elevation)
        print('BENCH_GROUND_MOUNTS_VERIFY_GREEN source/semantic contacts/72 cameras/four occupied turns', flush=True)
    elif '--repeat-four' in sys.argv:
        catalog = json.loads((ROOT / 'public/game-content' / MANIFEST_NAME).read_text(encoding='utf-8-sig'))
        scene, camera, target = configure(MODEL)
        output = ROOT / 'assets/intermediate/wooden-bench-ground-mounts-proof'
        output.mkdir(parents=True, exist_ok=True)
        repeats = []
        for yaw in (30, 120, 210, 300):
            elevation = 40
            point_camera(camera, target, yaw, elevation)
            path = output / f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath = str(path)
            exporter.bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, elevation))
            canonical = ROOT / 'public' / frame['image'].lstrip('/')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != frame['sha256'] or path.read_bytes() != canonical.read_bytes():
                raise ValueError('Bench ground mounting shoes actual canonical repeat differs')
            repeats.append({'yawDegrees': yaw, 'elevationDegrees': elevation, 'sha256': digest, 'byteExactCanonicalRepeat': True})
        exporter.pipeline_common.write_text(output / 'four-real-producer-repeats.json', json.dumps(repeats, indent=2) + '\n')
        print('BENCH_GROUND_MOUNTS_REPEAT4_BYTE_EXACT_GREEN no canonical files changed', flush=True)
    else:
        exporter.main()
        if not exporter.PREVIEW_ONLY: verify_exports()
