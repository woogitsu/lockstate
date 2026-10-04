from pathlib import Path
import importlib.util,json,sys
import bpy
HERE=Path.cwd()/'tooling/blender'
sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('prep_existing_producer',HERE/'render-kitchen-prep-counter-oblique.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
scene,camera,target=m.configure(m.exporter.MODELS[0])
graph=bpy.context.evaluated_depsgraph_get();rows=[]
for o in sorted(scene.objects,key=lambda o:o.name):
 if o.type!='MESH':continue
 e=o.evaluated_get(graph);me=e.to_mesh()
 try:
  pts=[e.matrix_world@v.co for v in me.vertices];rows.append({'name':o.name,'bounds':[[min(p[a] for p in pts) for a in range(3)],[max(p[a] for p in pts) for a in range(3)]],'materials':[x.name for x in o.data.materials]})
 finally:e.to_mesh_clear()
materials=[]
for mat in bpy.data.materials:
 shader=next((n for n in mat.node_tree.nodes if n.bl_idname=='ShaderNodeBsdfPrincipled'),None)
 materials.append({'name':mat.name,'users':mat.users,'diffuse':list(mat.diffuse_color),'shaderRGBA':list(shader.inputs['Base Color'].default_value),'roughness':shader.inputs['Roughness'].default_value,'metallic':shader.inputs['Metallic'].default_value})
out={'meshCount':len(rows),'materials':materials,'parts':rows,'currentRenderEngine':scene.render.engine,'target':list(target)}
(Path.cwd()/'docs/research/2026-10-04-kitchen-prep-counter-retained-cycles/actual-inventory.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'meshCount':len(rows),'materials':materials,'engine':scene.render.engine},indent=2),flush=True)
