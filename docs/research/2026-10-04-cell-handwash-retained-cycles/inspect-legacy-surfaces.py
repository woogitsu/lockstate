from pathlib import Path
import importlib.util,bpy,json
from mathutils.bvhtree import BVHTree
root=Path.cwd();folder=root/'docs/research/2026-10-04-cell-handwash-retained-cycles'
s=importlib.util.spec_from_file_location('actual_old_sink',root/'tooling/blender/render-handwash-sink-oblique.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);scene,_,_=m.configure(m.exporter.MODELS[0]);graph=bpy.context.evaluated_depsgraph_get()
names=['faucet stem','ceramic washstand','rear rim','blue handle -0.2','valve -0.2','blue handle 0.2','valve 0.2'];parts={}
for name in names:
 obj=bpy.data.objects[name].evaluated_get(graph);mesh=obj.to_mesh();points=[obj.matrix_world@v.co for v in mesh.vertices];parts[name]=(points,BVHTree.FromPolygons(points,[tuple(p.vertices) for p in mesh.polygons],all_triangles=False));obj.to_mesh_clear()
rows=[]
for a,b in [('faucet stem','ceramic washstand'),('faucet stem','rear rim'),('blue handle -0.2','valve -0.2'),('blue handle 0.2','valve 0.2')]:
 witnesses=[]
 for src,dst in [(a,b),(b,a)]:
  for v in parts[src][0]:
   p,n,i,d=parts[dst][1].find_nearest(v);witnesses.append((d,list(v),list(p),src,dst))
 d,v,p,src,dst=min(witnesses);rows.append({'a':a,'b':b,'nearestVertexToEvaluatedTriangleUpperBoundTiles':d,'nominalPixelsAt64':d*64,'from':src,'to':dst,'sourceVertex':v,'surfaceWitness':p})
(folder/'actual-legacy-nearest-surfaces.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows,indent=2))
