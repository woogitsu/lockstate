from pathlib import Path
import sys, importlib.util, json
import bpy
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path.cwd()/'tooling/blender'))
import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('actual_old_prep',Path.cwd()/'tooling/blender/render-kitchen-prep-counter-oblique.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
scene,_,_=m.configure(m.exporter.MODELS[0]);graph=bpy.context.evaluated_depsgraph_get()
def surfaces(name):
 value=bpy.data.objects[name].evaluated_get(graph);mesh=value.to_mesh()
 try:
  verts=[value.matrix_world@v.co for v in mesh.vertices];mesh.calc_loop_triangles();tris=[tuple(t.vertices) for t in mesh.loop_triangles];tree=BVHTree.FromPolygons(verts,tris,all_triangles=True)
  return verts,tris,tree
 finally:value.to_mesh_clear()
rows=[]
for i in range(3):
 pan='ingredient-pan' if i==0 else f'ingredient-pan.{i:03d}'
 vs,ts,tree=surfaces(pan)
 for kind,ends in [('long',[-1,1]),('end',['-0.202','0.166'])]:
  for end in ends:
   name=f'angled-prep.pan rim {kind} {i} {end}';rv,rt,rttree=surfaces(name)
   overlaps=rttree.overlap(tree)
   candidates=[]
   for v in rv:
    loc,normal,index,dist=tree.find_nearest(v);candidates.append((dist,list(v),list(loc)))
   for v in vs:
    loc,normal,index,dist=rttree.find_nearest(v);candidates.append((dist,list(loc),list(v)))
   distance,a,b=min(candidates,key=lambda x:x[0])
   rows.append({'rim':name,'pan':pan,'actualTriangleSurfaceIntersections':len(overlaps),'nearestVertexTriangleDistanceTiles':distance,'rimSurfacePoint':a,'panSurfacePoint':b,'vertexDistancePixelsAt64':distance*64,'vertexDistanceIsUpperBoundOnly':True})
p=Path.cwd()/'docs/research/2026-10-04-kitchen-prep-counter-retained-cycles/actual-rim-surfaces.json';p.write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows),flush=True)
