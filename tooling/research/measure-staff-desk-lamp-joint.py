"""Measure actual arm/pivot triangle surfaces; do not infer complete lamp disconnection."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
s=importlib.util.spec_from_file_location('staff_lamp_preservation_audit',HERE/'refine-guard-belt-detail.py');a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
source=ROOT/'assets/source/blender/furniture.office.desk.employee.blend';before=source.read_bytes();bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();trees={}
for name in ('Lamp articulated arm','Lamp swivel collar'):
 value=bpy.data.objects[name].evaluated_get(graph);mesh=value.to_mesh()
 try:
  pts=[value.matrix_world@v.co for v in mesh.vertices];mesh.calc_loop_triangles();trees[name]=BVHTree.FromPolygons(pts,[tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
 finally:value.to_mesh_clear()
witness=Vector((-.425,-.27,1.234));rows=[]
for iteration in range(12):
 arm,_,ai,_=trees['Lamp articulated arm'].find_nearest(witness);collar,_,ci,distance=trees['Lamp swivel collar'].find_nearest(arm);rows.append({'iteration':iteration,'actualArmTriangle':ai,'actualArmSurfacePoint':list(arm),'actualCollarTriangle':ci,'actualCollarSurfacePoint':list(collar),'actualSurfaceWitnessDistance':distance});witness=collar
receipt={'sourceSha256':hashlib.sha256(before).hexdigest(),'actualTriangleSurfaceIterations':rows,'claimBoundary':'No direct arm/pivot collar connection. Arm already intersects lamp hood and collar already intersects hood seam; not a claim that complete lamp assembly is disconnected.','browserStarted':False,'canonicalProducerEdited':False};assert source.read_bytes()==before
import pipeline_common;pipeline_common.write_text(ROOT/'assets/intermediate/staff-desk-connection-audit/actual-lamp-arm-pivot-surface-witnesses.json',json.dumps(receipt,indent=2)+'\n');print(json.dumps(rows[-1]),flush=True)
