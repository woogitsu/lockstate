from pathlib import Path
import bpy,importlib.util,sys,json
root=Path.cwd();here=root/'tooling/blender';sys.path.insert(0,str(here))
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
door=load('actual_door_material_audit',here/'render-interior-north-door-oblique.py')
door.validate_dispatch();door.setup_scene();door.append_collection(door.WALL,'wall.interior.doorframe.full');door.append_collection(door.LEAF,'door.interior.leaf.open');bpy.context.view_layer.update();door.verify_assembly();door.verify_studio();saved=door.assembly_record()
door_report={'engine':bpy.context.scene.render.engine,'samples':bpy.context.scene.eevee.taa_render_samples,'partCount':len(saved['parts']),'graphs':saved['materialGraphs'],'sources':[{'source':p.name,'sha256':__import__('hashlib').sha256(p.read_bytes()).hexdigest()} for p in (door.LEAF,door.WALL)],'descriptors':[{k:v for k,v in json.loads((root/('public/game-content/'+name)).read_text()).items() if k!='frames'} | {'frameCount':len(json.loads((root/('public/game-content/'+name)).read_text())['frames'])} for name in ('oblique-cell-door-open.v1.json','oblique-cell-door-north-cutaway.v1.json','oblique-cell-door-west-full.v1.json','oblique-cell-door-west-cutaway.v1.json')]}
student=load('actual_student_material_audit',here/'render-classroom-student-chair-oblique.py');scene,camera=student.configure(student.MODEL)
materials=[]
for m in sorted(bpy.data.materials,key=lambda m:m.name):
 n=next((n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeBsdfPrincipled'),None) if m.node_tree else None
 materials.append({'name':m.name,'diffuseRGBA':list(m.diffuse_color),'roughnessProperty':m.roughness,'baseRGBA':list(n.inputs['Base Color'].default_value) if n else None,'shaderRoughness':n.inputs['Roughness'].default_value if n else None,'shaderMetallic':n.inputs['Metallic'].default_value if n else None})
report={'door':door_report,'student':{'engine':scene.render.engine,'parts':len([o for o in scene.objects if o.type=='MESH']),'materials':materials}}
(root/'docs/research/2026-10-04-classroom-student-chair-retained-cycles/actual-door-student-source-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('ACTUAL_MATERIAL_AUDIT',json.dumps({'doorEngine':door_report['engine'],'doorParts':door_report['partCount'],'doorGraphs':len(door_report['graphs']),'doorFrames':[r['frameCount'] for r in door_report['descriptors']], 'student':report['student']}),flush=True)
