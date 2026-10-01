"""Build/render a kitchen stove oblique module."""
from __future__ import annotations
import hashlib,json,math
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'assets/source/blender/furniture.kitchen.stove.variants.blend'
OUT=ROOT/'public/assets/environment/oblique'
MANIFEST=ROOT/'public/game-content/oblique-furniture.kitchen-stove.v1.json'
ASSET_ID='furniture.kitchen.stove.variants'
YAW=list(range(0,360,30)); ELEV=[20,30,40,50,60,70]
def mat(name,color,metallic=0.0,rough=.45):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Metallic'].default_value=metallic; bs.inputs['Roughness'].default_value=rough; return m
def cube(name,loc,scale,material,bevel=0):
 bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel: mod=o.modifiers.new('soft edges','BEVEL'); mod.width=bevel; mod.segments=3
 o.data.materials.append(material); return o
def cyl(name,loc,radius,depth,material,rot=(math.pi/2,0,0),verts=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot); o=bpy.context.object; o.name=name; o.data.materials.append(material); return o
def build():
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 steel=mat('brushed steel',(.42,.48,.5),.7,.24); dark=mat('cast iron',(.045,.055,.06),.25,.3); enamel=mat('enamel',(.79,.8,.76),.12,.33); orange=mat('burner glow',(.85,.24,.045),.1,.32); glass=mat('oven glass',(.055,.1,.12),.2,.18); green=mat('status green',(.15,.7,.3),.05,.28)
 # two-tile wide commercial range, with rear guard and four readable burners
 cube('stove-body',(0,0,.62),(1.0,.44,.62),enamel,.06); cube('steel-deck',(0,-.02,1.28),(1.03,.47,.08),steel,.025); cube('rear-splash',(0,.37,1.75),(1.0,.06,.48),steel,.025)
 for x in (-.5,.5):
  for y in (-.22,.2):
   cyl('burner',(x,y,1.38),.22,.07,dark,rot=(0,0,0),verts=48); cyl('burner-hot',(x,y,1.425),.11,.018,orange,rot=(0,0,0),verts=32)
 # twin oven faces toward -Y
 for x in (-.5,.5):
  cube('oven-door',(x,-.47,.62),(.42,.05,.4),steel,.02); cube('oven-window',(x,-.53,.66),(.31,.02,.23),glass,.015); cube('handle',(x,-.58,.97),(.28,.03,.035),dark,.015)
 cube('control-rail',(0,-.47,1.13),(1.0,.05,.09),dark,.02)
 for x in (-.72,-.42,-.12,.18,.48,.78): cyl('control-knob',(x,-.53,1.15),.055,.035,steel,rot=(math.pi/2,0,0),verts=24)
 cube('status-light',(.88,-.54,1.15),(.035,.02,.035),green,.01)
 for x in (-.78,.78):
  for y in (-.28,.28): cube('foot',(x,y,.06),(.1,.1,.05),dark,.02)
 bpy.ops.object.camera_add(); camera=bpy.context.object; camera.name='ObliqueCamera'; camera.data.type='ORTHO'; camera.data.ortho_scale=3.8; bpy.context.scene.camera=camera
 bpy.ops.object.light_add(type='AREA',location=(-3,-4,6)); key=bpy.context.object; key.data.energy=500; key.data.shape='DISK'; key.data.size=5
 bpy.ops.object.light_add(type='AREA',location=(4,2,3)); fill=bpy.context.object; fill.data.energy=260; fill.data.size=4
 return camera
def point_camera(camera,yaw,elev):
 target=Vector((0,0,.82)); r=7.; yr=math.radians(yaw); er=math.radians(elev); camera.location=target+Vector((r*math.cos(er)*math.sin(yr),-r*math.cos(er)*math.cos(yr),r*math.sin(er))); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
def main():
 camera=build(); scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=128; scene.render.resolution_y=128; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=True; scene.render.image_settings.color_depth='8'; scene.world.color=(.035,.045,.05); OUT.mkdir(parents=True,exist_ok=True)
 for yaw in YAW:
  for elev in ELEV:
   point_camera(camera,yaw,elev); name=f'furniture.kitchen.stove.variants-yaw+{yaw:02d}-elev{elev}.png'; scene.render.filepath=str(OUT/name); bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE)); source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest(); frames=[]
 for yaw in YAW:
  for elev in ELEV:
   name=f'furniture.kitchen.stove.variants-yaw+{yaw:02d}-elev{elev}.png'; p=OUT/name; frames.append({'yawDegrees':yaw,'elevationDegrees':elev,'image':f'/assets/environment/oblique/{name}','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 data={'schemaVersion':1,'assetId':ASSET_ID,'source':'assets/source/blender/furniture.kitchen.stove.variants.blend','sourceSha256':source_hash,'resolutionPx':[128,128],'nominalPixelsPerTile':64,'pivotPx':[64,64],'cameraTargetTiles':[1.0,.5,.5],'projection':'orthographic','yawDegrees':YAW,'elevationDegrees':ELEV,'frames':frames}; MANIFEST.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
