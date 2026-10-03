"""Retain the complete authored guard and connect its existing duty belt at the rear."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import struct
import sys
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
ROOT=HERE.parents[1]
ORIGINAL=ROOT/'assets/source/blender/actor.guard.base.blend'
SOURCE=ROOT/'assets/source/blender/actor.guard.base.angled-detail.blend'
ORIGINAL_SHA256='4a900b2d61ad2c7386f48176381a08ee6f796da9d57f096b478f7ba7e42501c7'
NAME='physical-guard.rear duty belt band'
TARGETS={NAME:['Duty belt side.-1','Duty belt side.1','Jumpsuit hips']}
spec=importlib.util.spec_from_file_location('retained_mesh_audit',HERE/'refine-cell-cot-detail.py')
assert spec and spec.loader
mesh_audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(mesh_audit)
raw_record=mesh_audit.raw_record
materials_record=mesh_audit.materials_record
capture=mesh_audit.capture
actual_triangle_contacts=mesh_audit.actual_triangle_contacts


def animation_record():
    """Retain actual layered action curves, not only action names or frame counts."""
    rows=[]
    for action in sorted(bpy.data.actions,key=lambda a:a.name):
        curves=[]
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        curves.append({'path':curve.data_path,'index':curve.array_index,'keys':[
                            {'co':list(key.co),'left':list(key.handle_left),'right':list(key.handle_right),
                             'interpolation':key.interpolation,'leftType':key.handle_left_type,'rightType':key.handle_right_type}
                            for key in curve.keyframe_points]})
        rows.append({'name':action.name,'curves':curves})
    return rows


def pose_record(scene,names):
    rows=[]
    for frame in range(1,9):
        scene.frame_set(frame);values=capture(scene)
        rows.append({'frame':frame,'retained':{name:{'evaluatedPositionSha256':values[name]['evaluatedPositionSha256'],
            'matrixWorld':[list(row) for row in bpy.data.objects[name].matrix_world]} for name in names}})
    scene.frame_set(1)
    return rows


def normal_record(scene):
    """Independent evaluated world topology; retain any original degenerates explicitly."""
    bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();rows=[]
    for obj in sorted(scene.objects,key=lambda o:o.name):
        if obj.type!='MESH':continue
        value=obj.evaluated_get(graph);mesh=value.to_mesh()
        try:
            points=[value.matrix_world@v.co for v in mesh.vertices];center=sum(points,Vector())/len(points);dots=[];zero=[]
            for face in mesh.polygons:
                vertices=[points[index] for index in face.vertices];area=Vector()
                for a,b in zip(vertices[1:-1],vertices[2:]):area+=(a-vertices[0]).cross(b-vertices[0])
                if area.length_squared<=1e-20:zero.append(face.index);continue
                dots.append(area.normalized().dot(sum(vertices,Vector())/len(vertices)-center))
            rows.append({'name':obj.name,'polygons':len(mesh.polygons),'degenerateIndices':zero,
                'minimumOutwardDistance':min(dots),'inwardPolygons':sum(dot<-1e-6 for dot in dots),
                'transformDeterminant':value.matrix_world.to_3x3().determinant()})
        finally:value.to_mesh_clear()
    return rows


def bounds(scene):
    points=[p for row in capture(scene).values() for p in row['points']]
    return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}


def main():
    original_bytes=ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest()!=ORIGINAL_SHA256:raise ValueError('Original guard source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene;scene.frame_set(1)
    names=sorted(obj.name for obj in scene.objects if obj.type=='MESH')
    if len(names)!=68:raise ValueError('Original complete guard inventory differs')
    raw_before=[raw_record(bpy.data.objects[name]) for name in names];materials_before=materials_record();poses_before=pose_record(scene,names)
    animations_before=animation_record();normals_before=normal_record(scene);bounds_before=bounds(scene)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.2825,1.72));band=bpy.context.object;band.name=NAME;band.dimensions=(.82,.095,.13)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    band.data.materials.append(bpy.data.materials['Guard duty belt']);band.parent=bpy.data.objects['SpriteRoot'];band.matrix_parent_inverse=band.parent.matrix_world.inverted()
    modifier=band.modifiers.new('Retained belt edge style','BEVEL');modifier.width=.012;modifier.segments=3
    if bpy.data.objects.get(NAME) is None:raise ValueError('Real rear guard belt band omitted')
    raw_after=[raw_record(bpy.data.objects[name]) for name in names];poses_after=pose_record(scene,names);normals_after=normal_record(scene)
    if raw_before!=raw_after or poses_before!=poses_after:raise ValueError('Original guard raw geometry/modifiers/eight animation poses changed')
    if materials_record()!=materials_before or animation_record()!=animations_before:raise ValueError('Original complete guard graphs/actions changed')
    if bounds(scene)!=bounds_before:raise ValueError('Guard accepted full source bounds changed')
    added=next(row for row in normals_after if row['name']==NAME)
    if added['inwardPolygons'] or added['degenerateIndices'] or added['minimumOutwardDistance']<=0:raise ValueError('Actual rear belt topology invalid')
    if [row for row in normals_after if row['name']!=NAME]!=normals_before:raise ValueError('Original evaluated guard topology audit changed')
    contacts=actual_triangle_contacts(scene,TARGETS)
    if len(contacts)!=3:raise ValueError('Actual rear guard belt must connect both retained sidebands and hips')
    # Preserve the original stored unused Material graph through a saved reopen.
    stored_unused=[material.name for material in bpy.data.materials if material.users==0]
    for name in stored_unused:bpy.data.materials[name].use_fake_user=True
    SOURCE.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    provenance={'schemaVersion':1,'assetId':'actor.guard.base','originalSource':ORIGINAL.relative_to(ROOT).as_posix(),
        'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_after,'retainedMaterialValues':materials_before,
        'unusedOriginalGraphsRetainedForStorage':stored_unused,
        'retainedAnimations':animations_before,'retainedEightAnimationPoses':poses_after,
        'authoredEightAnimationPoses':pose_record(scene,sorted(names+[NAME])),
        'originalGeometricNormalAudit':normals_before,
        'evaluatedGeometricNormalAudit':normals_after,'sourceEvaluatedBounds':bounds_before,'addedMeshNames':[NAME],
        'allAuthoredRawMeshes':[raw_record(obj) for obj in sorted(scene.objects,key=lambda o:o.name) if obj.type=='MESH'],
        'actualContactTargets':TARGETS,'actualTriangleInteriorContacts':contacts,
        'acceptedCamera':{'resolutionPx':[512,512],'orthoScale':8,'exportRootScale':.5,'historicalProducerCommit':'428cd89e48cdbb30c2b5dfda4476dec3a2e9cad0','target':[0,0,0],'pivotPx':[256,256],'nominalPixelsPerTile':64},
        'packedImages':[{'name':im.name,'size':list(im.size),'packedSha256':[hashlib.sha256(p.packed_file.data).hexdigest() for p in im.packed_files]} for im in bpy.data.images]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(provenance,indent=2)+'\n')
    if ORIGINAL.read_bytes()!=original_bytes:raise ValueError('Original guard source was modified')
    print('GUARD_REAR_BELT69 meshes/11 complete graphs/retained8 animation poses/3 actual interior contacts',flush=True)


if __name__=='__main__':main()
