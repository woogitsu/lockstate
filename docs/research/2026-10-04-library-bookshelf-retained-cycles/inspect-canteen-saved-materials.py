from pathlib import Path
import importlib.util,json,hashlib,bpy
root=Path.cwd();rows=[]
for label,script in [('table','render-canteen-dining-table-cycles.py'),('bench','render-canteen-bench-cycles.py')]:
 spec=importlib.util.spec_from_file_location('actual_canteen_'+label,root/'tooling/blender'/script);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
 scene,camera=p.configure();materials=[]
 for material in sorted(bpy.data.materials,key=lambda x:x.name):
  node=next(n for n in material.node_tree.nodes if n.bl_idname=='ShaderNodeBsdfPrincipled')
  materials.append({'name':material.name,'viewportRGBA':list(material.diffuse_color),'shaderRGBA':list(node.inputs['Base Color'].default_value),'shaderRGBAMatchesViewport':list(material.diffuse_color)==list(node.inputs['Base Color'].default_value),'viewportRoughnessProperty':material.roughness,'shaderRoughness':node.inputs['Roughness'].default_value,'shaderMetallic':node.inputs['Metallic'].default_value,'baseLinks':[[x.from_node.name,x.from_socket.name] for x in node.inputs['Base Color'].links],'roughnessLinks':[[x.from_node.name,x.from_socket.name] for x in node.inputs['Roughness'].links]})
 rows.append({'assetId':p.ASSET_ID,'actualSource':p.prepare.SAVED.relative_to(root).as_posix(),'actualSourceSha256':hashlib.sha256(p.prepare.SAVED.read_bytes()).hexdigest(),'meshCount':len([x for x in scene.objects if x.type=='MESH']),'engine':scene.render.engine,'threads':scene.render.threads,'materials':materials})
out=root/'docs/research/2026-10-04-library-bookshelf-retained-cycles/actual-canteen-material-comparison.json';out.write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows),flush=True)
