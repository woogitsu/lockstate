from pathlib import Path
import sys, importlib.util,json,bpy
root=Path.cwd(); here=root/'tooling/blender';sys.path.insert(0,str(here))
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
source=load('bookshelf_inspect',here/'render-library-bookshelf-detail-oblique.py')
scene,camera,target=source.configure(source.exporter.MODELS[0]);audit=source.audit
rows=[]
for m in sorted(bpy.data.materials,key=lambda x:x.name):
 n=next((n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeBsdfPrincipled'),None) if m.node_tree else None
 rows.append({'name':m.name,'meshUsers':[o.name for o in scene.objects if o.type=='MESH' and any(s.material==m for s in o.material_slots)],'diffuse':list(m.diffuse_color),'roughness':m.roughness,'base':list(n.inputs['Base Color'].default_value) if n else None,'shaderRough':n.inputs['Roughness'].default_value if n else None,'shaderMetallic':n.inputs['Metallic'].default_value if n else None,'links':[[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in m.node_tree.links] if m.node_tree else []})
points=audit.capture(scene)
report={'materials':rows,'meshes':[{'name':name,'min':[min(p[a] for p in row['points']) for a in range(3)],'max':[max(p[a] for p in row['points']) for a in range(3)]} for name,row in points.items()],'target':list(target),'engine':scene.render.engine}
(root/'docs/research/2026-10-04-library-bookshelf-retained-cycles/actual-bookshelf-inspection.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
