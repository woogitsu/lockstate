"""Retain the accepted anchored Cell cot camera and export real headboard supports."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    assert spec and spec.loader
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
exporter=load_module('retained_cot_camera',HERE/'render-cell-cot-oblique.py')
audit=load_module('authored_cot_audit',HERE/'refine-cell-cot-detail.py')
SOURCE=exporter.ROOT/'assets/source/blender/furniture.cell.cot.single.angled-detail.blend'
PROVENANCE=SOURCE.with_suffix('.provenance.json')
exporter.SOURCE=SOURCE


def verify_source(scene,camera):
    receipt=json.loads(PROVENANCE.read_text())
    for key,digest in [('source','sourceSha256'),('originalSource','originalSourceSha256')]:
        if hashlib.sha256((exporter.ROOT/receipt[key]).read_bytes()).hexdigest()!=receipt[digest]:raise ValueError('Cell cot original/dedicated source bytes changed')
    registry=json.loads((exporter.ROOT/'public/game-content/oblique-module-registry.v1.json').read_text())
    entry=next(row for row in registry['entries'] if row['assetId']==exporter.ASSET_ID)
    if entry['manifest']!='/game-content/'+exporter.MANIFEST.name:raise ValueError('Cell cot exporter targets the wrong canonical descriptor')
    rows=audit.capture(scene)
    if sorted(rows)!=sorted(row['name'] for row in receipt['meshes']):raise ValueError('Cell cot retained/authored mesh set changed')
    audit.actual_triangle_contacts(scene,receipt['actualContactTargets'])
    audit.convex_normal_audit(scene)
    if [audit.raw_record(obj) for obj in sorted(scene.objects,key=lambda obj:obj.name) if obj.type=='MESH']!=receipt['allAuthoredRawMeshes']:raise ValueError('Cell cot actual topology/material assignment/modifiers changed')
    for expected in receipt['meshes']:
        if rows[expected['name']]['evaluatedPositionSha256']!=expected['evaluatedPositionSha256']:raise ValueError('Cell cot actual evaluated retained/authored geometry changed')
    retained=[exporter.bpy.data.objects[row['name']] for row in receipt['retainedMeshesAfter']]
    if [audit.raw_record(obj) for obj in retained]!=receipt['retainedMeshesAfter']:raise ValueError('Cell cot original raw geometry/modifiers changed')
    if {obj.name:[list(row) for row in obj.matrix_world] for obj in retained}!=receipt['retainedObjectMatrices']:raise ValueError('Cell cot original assembly matrices changed')
    if audit.materials_record()!=receipt['retainedMaterialValues']:raise ValueError('Cell cot nine complete stored shader graphs changed')
    points=[p for row in rows.values() for p in row['points']]
    for axis in range(3):
        if abs(min(p[axis] for p in points)-receipt['sourceEvaluatedBounds']['min'][axis])>1e-6 or abs(max(p[axis] for p in points)-receipt['sourceEvaluatedBounds']['max'][axis])>1e-6:raise ValueError('Cell cot accepted minimum-corner geometry bounds changed')
    for turns in range(4):
        width,height=(1,2) if turns%2==0 else(2,1)
        for p in points:
            x,y=p.x-.5,p.y-1
            for _ in range(turns):x,y=-y,x
            if not(0<=x+width/2<=width and 0<=y+height/2<=height and p.z>=-1e-6):raise ValueError('Cell cot actual surfaces escape occupied quarter turn')
    if (exporter.TARGET-exporter.Vector((.5,1,.35))).length>1e-6:raise ValueError('Cell cot accepted target changed')
    if exporter.RESOLUTION_PX!=256 or exporter.NOMINAL_PIXELS_PER_TILE!=64 or abs(camera.data.ortho_scale-4)>1e-6:raise ValueError('Cell cot actual camera span differs from64pixels per tile')
    print('CELL_COT_DETAIL_BOUNDS',[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)],flush=True)


def verify_camera(camera,yaw,elevation):
    target=exporter.TARGET
    azimuth,tilt=math.radians(yaw),math.radians(elevation);offset=camera.location-target
    expected=exporter.Vector((6*math.cos(tilt)*math.sin(azimuth),-6*math.cos(tilt)*math.cos(azimuth),6*math.sin(tilt)))
    if (offset-expected).length>1e-5:raise ValueError('Cell cot actual camera ground basis changed')
    forward=camera.rotation_euler.to_quaternion()@exporter.Vector((0,0,-1))
    if forward.dot((-offset).normalized())<1-1e-6:raise ValueError('Cell cot actual camera does not aim at accepted target')


configure_retained=exporter.configure
point_retained=exporter.point_camera
def configure():
    scene,camera=configure_retained();verify_source(scene,camera);return scene,camera
def point_camera(camera,yaw,elevation):
    point_retained(camera,yaw,elevation);verify_camera(camera,yaw,elevation)
exporter.configure=configure
exporter.point_camera=point_camera
if __name__=='__main__':
    if '--verify' in sys.argv:
        _,camera=configure()
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:point_camera(camera,yaw,elevation)
        print('CELL_COT_DETAIL_VERIFY72 cameras/four occupied orientations/outward actual geometry',flush=True)
    else:exporter.main()
