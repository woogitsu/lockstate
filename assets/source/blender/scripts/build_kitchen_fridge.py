"""Build and render the kitchen fridge oblique module."""
from __future__ import annotations
import hashlib,json,math
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]; SOURCE=ROOT/'assets/source/blender/furniture.kitchen.fridge.variants.blend'; OUT=ROOT/'public/assets/environment/oblique'; MANIFEST=ROOT/'public/game-content/oblique-furniture.kitchen-fridge.v1.json'; ASSET_ID='furniture.kitchen.fridge.variants'; YAW=list(range(0,360,30)); ELEV=[20,30,40,50,60,70]
def mat(n,c,m=0,r=.4):
 x=bpy.data.materials.new(n); x.diffuse_color=(*c,1); x.use_nodes=True; b=x.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*c,1); b.inputs['Metallic'].default_value=m; b.inputs['Roughness'].default_value=r; return x
def cube(n,l,s,m,b=0):
 bpy.ops.mesh.primitive_cube_add(location=l); o=bpy.context.object; o.name=n; o.scale=s; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
 if b: q=o.modifiers.new('soft edges','BEVEL'); q.width=b; q.segments=3
 return o
def build():
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 steel=mat('steel',(.36,.45,.5),.75,.22); enamel=mat('enamel',(.82,.83,.79),.12,.3); dark=mat('rubber',(.04,.055,.06),.15,.3); glass=mat('freezer glass',(.08,.2,.26),.2,.16); green=mat('status green',(.15,.72,.3),.05,.28); gold=mat('handle',(.66,.5,.2),.7,.2)
 cube('fridge-body',(0,0,1.15),(.48,.45,1.15),enamel,.06); cube('fridge-top',(0,0,2.34),(.5,.47,.06),steel,.03); cube('freezer-door',(0,-.47,1.9),(.4,.04,.37),glass,.02); cube('fridge-door',(0,-.47,.92),(.4,.04,.67),steel,.02); cube('freezer-handle',(.32,-.54,1.9),(.04,.03,.28),gold,.015); cube('fridge-handle',(.32,-.54,.95),(.04,.03,.42),gold,.015); cube('status-light',(-.34,-.53,2.18),(.035,.02,.035),green,.01)
 for y in (-.28,.28): cube('foot',(0,y,.06),(.25,.13,.05),dark,.02)
 bpy.ops.object.camera_add(); c=bpy.context.object; c.name='ObliqueCamera'; c.data.type='ORTHO'; c.data.ortho_scale=3.25; bpy.context.scene.camera=c
 bpy.ops.object.light_add(type='AREA',location=(-3,-4,6)); bpy.context.object.data.energy=480; bpy.context.object.data.size=5
 bpy.ops.object.light_add(type='AREA',location=(4,2,3)); bpy.context.object.data.energy=260; bpy.context.object.data.size=4
 return c
def pose(c,y,e):
 t=Vector((0,0,1.1)); r=7.; yr=math.radians(y); er=math.radians(e); c.location=t+Vector((r*math.cos(er)*math.sin(yr),-r*math.cos(er)*math.cos(yr),r*math.sin(er))); c.rotation_euler=(t-c.location).to_track_quat('-Z','Y').to_euler()
def main():
 c=build(); s=bpy.context.scene; s.render.engine='BLENDER_EEVEE'; s.render.resolution_x=128; s.render.resolution_y=128; s.render.resolution_percentage=100; s.render.image_settings.file_format='PNG'; s.render.image_settings.color_mode='RGBA'; s.render.film_transparent=True; s.render.image_settings.color_depth='8'; s.world.color=(.035,.045,.05); OUT.mkdir(parents=True,exist_ok=True)
 for y in YAW:
  for e in ELEV:
   pose(c,y,e); n=f'furniture.kitchen.fridge.variants-yaw+{y:02d}-elev{e}.png'; s.render.filepath=str(OUT/n); bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE)); h=hashlib.sha256(SOURCE.read_bytes()).hexdigest(); frames=[]
 for y in YAW:
  for e in ELEV:
   n=f'furniture.kitchen.fridge.variants-yaw+{y:02d}-elev{e}.png'; p=OUT/n; frames.append({'yawDegrees':y,'elevationDegrees':e,'image':f'/assets/environment/oblique/{n}','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 MANIFEST.write_text(json.dumps({'schemaVersion':1,'assetId':ASSET_ID,'source':'assets/source/blender/furniture.kitchen.fridge.variants.blend','sourceSha256':h,'resolutionPx':[128,128],'nominalPixelsPerTile':64,'pivotPx':[64,64],'cameraTargetTiles':[.5,.5,.5],'projection':'orthographic','yawDegrees':YAW,'elevationDegrees':ELEV,'frames':frames},indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
