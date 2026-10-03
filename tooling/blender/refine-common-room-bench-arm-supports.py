"""Retain the complete upholstered bench and support its two front timber arm ends."""
from pathlib import Path
import sys, json, hashlib, importlib.util
import bpy
HERE = Path(__file__).resolve().parent; ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('common_room_complete_preservation', HERE / 'refine-guard-belt-detail.py')
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)
ORIGINAL = ROOT / 'assets/source/blender/furniture.common-room.upholstered-bench.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.blend'
ORIGINAL_SHA = 'cfb1af97817ff0f5944626c2888a498bf96d60c3880544cc5f6d6544b9613b92'
NAMES = ['physical-common-room-bench.front arm riser 0', 'physical-common-room-bench.front arm riser 1']
TARGETS = {NAMES[0]:['side seat bearer','sealed timber arm'], NAMES[1]:['side seat bearer.001','sealed timber arm.001']}
raw_record = a.raw_record; materials_record = a.materials_record; capture = a.capture
normal_record = a.normal_record; bounds = a.bounds; actual_contacts = a.actual_triangle_contacts

def build():
    original = ORIGINAL.read_bytes()
    assert hashlib.sha256(original).hexdigest() == ORIGINAL_SHA, 'Original upholstered bench identity changed'
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    before = capture(scene); names = sorted(before); assert len(names) == 33
    raw = [raw_record(bpy.data.objects[n]) for n in names]; graphs = materials_record(); assert len(graphs) == 8
    matrices = {n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names}
    oldnormals = normal_record(scene); oldbounds = bounds(scene); actions = a.animation_record()
    # The rear upright already carries each timber arm. These are the missing
    # front supports, continuing the same steel frame up from each side bearer.
    for index, x in enumerate((.22, 1.78)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x,.25,.55))
        obj = bpy.context.object; obj.name = NAMES[index]; obj.dimensions = (.04,.04,.25)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        obj.data.materials.append(bpy.data.materials['powder-coated petrol steel'])
        bevel = obj.modifiers.new('Retained powder-coated edge style','BEVEL'); bevel.width=.004; bevel.segments=3
        obj.modifiers.new('Retained weighted normals','WEIGHTED_NORMAL')
    after = capture(scene); assert len(after) == 35 and sorted(set(after)-set(before)) == NAMES
    assert [raw_record(bpy.data.objects[n]) for n in names] == raw, 'Original raw geometry/topology/material indices/modifiers changed'
    assert materials_record() == graphs and a.animation_record() == actions, 'Full stored graphs/actions changed'
    assert {n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names} == matrices
    assert all(before[n]['evaluatedPositionSha256'] == after[n]['evaluatedPositionSha256'] for n in names)
    assert bounds(scene) == oldbounds, 'Accepted full source bounds changed'
    normals = normal_record(scene); assert [row for row in normals if row['name'] in before] == oldnormals
    for row in normals:
        if row['name'] in NAMES:
            assert row['inwardPolygons'] == 0 and not row['degenerateIndices'] and row['minimumOutwardDistance'] > 0
    contacts = actual_contacts(scene, TARGETS); assert len(contacts) == 4
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    bpy.context.preferences.filepaths.save_version=0; bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    assert ORIGINAL.read_bytes() == original
    receipt = {'assetId':'furniture.common-room.upholstered-bench','originalSource':ORIGINAL.relative_to(ROOT).as_posix(),
        'originalSourceSha256':ORIGINAL_SHA,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesBefore':raw,'retainedMeshesAfter':raw,'retainedMaterialValues':graphs,'retainedObjectMatrices':matrices,
        'retainedEvaluatedHashes':{n:before[n]['evaluatedPositionSha256'] for n in names},'retainedActions':actions,
        'sourceEvaluatedBounds':oldbounds,'originalEvaluatedNormals':oldnormals,'authoredEvaluatedNormals':normals,
        'allAuthoredRawMeshes':[raw_record(bpy.data.objects[n]) for n in sorted(after)],
        'allAuthoredEvaluatedHashes':{n:after[n]['evaluatedPositionSha256'] for n in sorted(after)},'addedMeshNames':NAMES,
        'actualContactTargets':TARGETS,'actualTriangleInteriorContacts':contacts,
        'originalFrontArmOpenHeightTiles':min(p.z for p in before['sealed timber arm']['points'])-max(p.z for p in before['side seat bearer']['points']),
        'acceptedCamera':{'resolution':[256,256],'orthoScale':4,'nominalPixelsPerTile':64,'target':[1,.5,.52],'sourceFit':[1,1,1],'footprint':[2,1]}}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('COMMON_ROOM33_RETAINED/8_GRAPHS/35_AUTHORED/4_ACTUAL_CONTACTS',receipt['sourceSha256'],json.dumps(contacts),flush=True)

if __name__ == '__main__': build()
