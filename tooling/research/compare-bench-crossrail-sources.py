"""Actual source before/after exposure and triangle surface disconnection record, no canonical writes."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
old=load('original_bench_pipeline','render-wooden-bench-oblique.py');old.exporter.MODELS=(('furniture.corridor.bench.variants','furniture.corridor.bench.blend','oblique-canteen-bench.v1.json',2,1,1.,1.,.44325),);new=load('physical_bench_pipeline','render-wooden-bench-crossrails-oblique.py');scratch=ROOT/'assets/intermediate/bench-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
s,c,t=old.configure(old.exporter.MODELS[0]);graph=bpy.context.evaluated_depsgraph_get();names=['Lower steel tie','Angled support.-0.7.-0.41','Angled support.-0.7.0.41'];trees={};bounds={}
for name in names:
 value=bpy.data.objects[name].evaluated_get(graph);mesh=value.to_mesh()
 try:
  pts=[value.matrix_world@v.co for v in mesh.vertices];trees[name]=BVHTree.FromPolygons(pts,[tuple(p.vertices) for p in mesh.polygons],all_triangles=False);bounds[name]=[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]]
 finally:value.to_mesh_clear()
witnesses=[]
for name,sign in [(names[1],-1),(names[2],1)]:
 x=(bounds[name][0][0]+bounds[name][1][0])/2;candidate=Vector((x,.5+sign*.0275,.24));tie,_,face,_=trees['Lower steel tie'].find_nearest(candidate);leg,_,legface,distance=trees[name].find_nearest(tie);witnesses.append({'leg':name,'actualTieSurfacePoint':list(tie),'actualTieFace':face,'actualLegClosestSurfacePoint':list(leg),'actualLegFace':legface,'realNearestSurfaceGap':distance})
for pipeline,label in [(old,'original'),(new,'connected')]:
 s,c,t=pipeline.configure(pipeline.exporter.MODELS[0])
 for yaw in (0,60,180,300):
  pipeline.point_camera(c,t,yaw,40);q=scratch/f'{label}-bench-yaw{yaw:+03d}-elev40.png';s.render.filepath=str(q);bpy.ops.render.render(write_still=True);pipeline.exporter.normalize_and_check_border(q)
new.pipeline_common.write_text(scratch/'original-disconnected-tie-surface-witnesses.json',json.dumps(witnesses,indent=2)+'\n');print('BENCH_ACTUAL_SOURCE4YAW_PAIRED/ORIGINAL_TRIANGLE_SURFACE_GAPS',flush=True)
