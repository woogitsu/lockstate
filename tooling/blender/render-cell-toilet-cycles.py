"""Dedicated retained Cell toilet full-shader Cycles72 through the accepted camera."""
from pathlib import Path
import hashlib
import json
import sys
import time
import bpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
import importlib.util
spec=importlib.util.spec_from_file_location('toilet_soft_saved_source',HERE/'prepare-cell-toilet-cycles.py')
prepare=importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
exporter=prepare.source
ASSET_ID='fixture.cell.toilet_sink'
SOURCE_NAME='fixture.cell.toilet_sink.soft-light.blend'
SOURCE_SHA='1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5'
MANIFEST_NAME='oblique-cell-toilet.v1.json'
EXPECTED=json.loads(prepare.PROVENANCE.read_text())
REPORT=prepare.REPORT


def configure():
    if ASSET_ID!='fixture.cell.toilet_sink' or SOURCE_NAME!='fixture.cell.toilet_sink.soft-light.blend' or MANIFEST_NAME!='oblique-cell-toilet.v1.json':
        raise ValueError('Toilet Cycles dedicated producer dispatch changed')
    path=ROOT/'assets/source/blender'/SOURCE_NAME
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene=bpy.context.scene
    prepare.verify_scene(scene,EXPECTED)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=SOURCE_SHA:
        raise ValueError('Toilet Cycles actual saved source SHA changed')
    for field,digest in [('retainedSource','retainedSourceSha256'),('originalSource','originalSourceSha256')]:
        if hashlib.sha256((ROOT/EXPECTED[field]).read_bytes()).hexdigest()!=EXPECTED[digest]:
            raise ValueError('Toilet Cycles full historical source bytes changed')
    registry=json.loads(exporter.REGISTRY.read_text())
    if [row for row in registry['entries'] if row['assetId']==ASSET_ID]!=[{'assetId':ASSET_ID,'manifest':'/game-content/'+MANIFEST_NAME}]:
        raise ValueError('Toilet Cycles actual registry dispatch missing or changed')
    return scene


def verify_exports():
    catalog=json.loads(exporter.MANIFEST.read_text())
    expected={'assetId':ASSET_ID,'source':'assets/source/blender/'+SOURCE_NAME,'sourceSha256':SOURCE_SHA,'sourceDependencies':[],
      'resolutionPx':[512,512],'nominalPixelsPerTile':64,'pivotPx':[256,256],'cameraTargetTiles':[.5,.5,.5537500381469727],
      'yawDegrees':list(exporter.YAW),'elevationDegrees':list(exporter.ELEVATION)}
    if any(catalog.get(key)!=value for key,value in expected.items()):
        raise ValueError('Toilet Cycles descriptor source/dispatch/camera changed')
    if len(catalog['frames'])!=72 or {(row['yawDegrees'],row['elevationDegrees']) for row in catalog['frames']}!={(yaw,elevation) for yaw in exporter.YAW for elevation in exporter.ELEVATION}:
        raise ValueError('Toilet Cycles real72 pose coverage changed')
    for frame in catalog['frames']:
        body=(ROOT/'public'/frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest()!=frame['sha256'] or not frame['image'].endswith('.'+frame['sha256'][:12]+'.png'):
            raise ValueError('Toilet Cycles PNG body/path SHA changed')
        prepare.validate_png(body)
    print('TOILET_CYCLES_EXPORT72_DECODED_GREEN',flush=True)
    return catalog


def main():
    REPORT.mkdir(parents=True,exist_ok=True)
    if '--verify' in sys.argv:
        scene=configure()
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:exporter.point_camera(scene,yaw,elevation)
        print('TOILET_CYCLES_SOURCE45_GRAPH8_CONTACT2_CAMERA72_GREEN',flush=True)
    elif '--verify-exports' in sys.argv:
        configure()
        verify_exports()
    elif '--repeat-four' in sys.argv:
        catalog=verify_exports()
        scene=configure()
        rows=[]
        for yaw in (-135,-45,45,135):
            exporter.point_camera(scene,yaw,40)
            path=REPORT/f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath=str(path)
            began=time.monotonic()
            bpy.ops.render.render(write_still=True)
            exporter.strip_png_metadata(path)
            prepare.validate_png(path.read_bytes())
            frame=next(row for row in catalog['frames'] if (row['yawDegrees'],row['elevationDegrees'])==(yaw,40))
            if path.read_bytes()!=(ROOT/'public'/frame['image'].lstrip('/')).read_bytes():
                raise ValueError('Toilet Cycles actual canonical repeat not byte exact')
            rows.append({'yawDegrees':yaw,'elevationDegrees':40,'sha256':frame['sha256'],'byteExact':True,'renderSeconds':time.monotonic()-began})
        pipeline_common.write_text(REPORT/'actual-four-repeats.json',json.dumps(rows,indent=2)+'\n')
        print('TOILET_CYCLES_FOUR_REAL_REPEATS_BYTE_EXACT_GREEN',flush=True)
    else:
        if not prepare.HISTORY.exists():prepare.HISTORY.write_bytes(exporter.MANIFEST.read_bytes())
        began=time.monotonic()
        scene=configure()
        frames=exporter.render_frames(scene)
        catalog={'schemaVersion':1,'assetId':ASSET_ID,'source':'assets/source/blender/'+SOURCE_NAME,'sourceSha256':SOURCE_SHA,
          'sourceDependencies':[],'resolutionPx':[512,512],'nominalPixelsPerTile':64,'pivotPx':[256,256],
          'cameraTargetTiles':[.5,.5,.5537500381469727],'projection':'orthographic','yawDegrees':list(exporter.YAW),
          'elevationDegrees':list(exporter.ELEVATION),'frames':frames}
        pipeline_common.write_text(exporter.MANIFEST,json.dumps(catalog,indent=2)+'\n')
        verify_exports()
        pipeline_common.write_text(REPORT/'actual-matrix.json',json.dumps({'genuineBlenderVersion':list(bpy.app.version),
          'engine':'CYCLES','device':'CPU','threads':1,'samples':64,'seed':0,'adaptiveSampling':False,'denoising':False,
          'viewTransform':'AgX','actualExportSeconds':time.monotonic()-began,'realRenderCount':72,'sourceSha256':SOURCE_SHA,
          'descriptorSha256':hashlib.sha256(exporter.MANIFEST.read_bytes()).hexdigest(),'frames':frames,
          'groundPlaneAdded':False,'nativeAcceptance':False},indent=2)+'\n')


if __name__=='__main__':main()
