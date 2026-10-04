from pathlib import Path
import importlib.util,json,bpy
root=Path.cwd();folder=root/'docs/research/2026-10-04-cell-handwash-retained-cycles';folder.mkdir(parents=True,exist_ok=True)
def load(name,file):
 s=importlib.util.spec_from_file_location(name,root/'tooling/blender'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
source=load('handwash_old','render-handwash-sink-oblique.py');audit=load('cot_audit','refine-cell-cot-detail.py')
scene,camera,target=source.configure(source.exporter.MODELS[0]);graphs=audit.materials_record();rows=[]
for g in graphs:
 node=next((n for n in g['nodes'] if n['type']=='ShaderNodeBsdfPrincipled'),None)
 rows.append({'name':g['name'],'useNodes':g['useNodes'],'diffuse':g['diffuse'],'roughness':g['roughness'],'metallic':g['metallic'],'nodes':g['nodes'],'links':g['links']})
contacts={'faucet spout':['faucet neck'],'faucet neck':['faucet stem'],'faucet stem':['rear rim'],'porcelain pedestal':['ceramic washstand','pedestal foot'],'blue handle -0.2':['valve -0.2'],'blue handle 0.2':['valve 0.2']}
genuine=[];failures=[]
for a,targets in contacts.items():
 for b in targets:
  try:genuine+=audit.actual_triangle_contacts(scene,{a:[b]})
  except ValueError as e:failures.append(str(e))
result={'engine':scene.render.engine,'materials':rows,'meshCount':len(audit.capture(scene)),'target':list(target),'genuineContacts':genuine,'failedProbes':failures}
(folder/'actual-installed-source-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'engine':result['engine'],'materials':[{'name':g['name'],'useNodes':g['useNodes'],'diffuse':g['diffuse'],'roughness':g['roughness'],'metallic':g['metallic'],'nodeCount':len(g['nodes'])} for g in rows],'contacts':genuine,'failedProbes':failures},indent=2))
