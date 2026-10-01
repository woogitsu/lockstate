"""Build and render the library bookshelf oblique module with Blender."""
from __future__ import annotations
import hashlib,json,math
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'assets/source/blender/furniture.library.bookshelf.variants.blend'
OUT=ROOT/'public/assets/environment/oblique'
MANIFEST=ROOT/'public/game-content/oblique-furniture.library-bookshelf.v1.json'
ASSET_ID='furniture.library.bookshelf.variants'
YAW=list(range(0,360,30)); ELEV=[20,30,40,50,60,70]
def mat(name,color,metallic=0.0,roughness=.42):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Metallic'].default_value=metallic; bs.inputs['Roughness'].default_value=roughness
 return m
def cube(name,loc,scale,material,bevel=0):
 bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('soft edges','BEVEL'); mod.width=bevel; mod.segments=2
 return o
def build():
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 wood=mat('warm oak',(0.25,.12,.055),0,.44); edge=mat('edge oak',(.42,.23,.11),0,.36); steel=mat('steel',(.26,.31,.34),.65,.23); paper=mat('paper',(.72,.52,.28),0,.62); red=mat('red book',(.60,.10,.07),0,.45); teal=mat('teal book',(.08,.34,.38),.05,.4); blue=mat('blue book',(.10,.22,.50),.02,.42); green=mat('green book',(.15,.40,.18),.02,.42)
 cube('carcass',(0,0,1.05),(0.97,.38,1.05),wood,.055); cube('back-panel',(0,.36,1.05),(.86,.035,.94),edge,.02)
 for z in (.16,1.02,1.9): cube('shelf',(0,-.03,z),(.89,.42,.055),edge,.025)
 for x in (-.91,.91): cube('side-frame',(x,-.02,1.05),(.065,.43,1.02),edge,.025)
 for x in (-.47,0,.47): cube('steel-divider',(x,-.43,1.08),(.025,.025,.88),steel,.01)
 colors=[red,teal,blue,green,paper]
 for row,z in enumerate((.48,1.43)):
  for i,x in enumerate((-.73,-.49,-.25,-.01,.23,.47,.71)):
   h=.23 + ((i+row)%3)*.035; cube('book',(x,-.44,z+h/2-.04),(.075,.055,h/2),colors[(i+row)%len(colors)],.012)
 cube('catalogue',(0,-.5,.23),(.19,.06,.05),paper,.012)
 for x in (-.72,.72): cube('foot',(x,-.05,.045),(.12,.28,.045),steel,.018)
 bpy.ops.object.camera_add(); c=bpy.context.object; c.name='ObliqueCamera'; c.data.type='ORTHO'; c.data.ortho_scale=2.95; bpy.context.scene.camera=c
 bpy.ops.object.light_add(type='AREA',location=(-3,-4,6)); bpy.context.object.data.energy=470; bpy.context.object.data.size=5
 bpy.ops.object.light_add(type='AREA',location=(4,2,3)); bpy.context.object.data.energy=240; bpy.context.object.data.size=4
 return c
def pose(camera,yaw,elev):
 target=Vector((0,0,1.05)); radius=6.5; yr=math.radians(yaw); er=math.radians(elev)
 camera.location=target+Vector((radius*math.cos(er)*math.sin(yr),-radius*math.cos(er)*math.cos(yr),radius*math.sin(er))); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
def main():
 camera=build(); scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=128; scene.render.resolution_y=128; scene.render.resolution_percentage=100; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='8'; scene.render.film_transparent=True; scene.world.color=(.035,.045,.05); OUT.mkdir(parents=True,exist_ok=True)
 for yaw in YAW:
  for elev in ELEV:
   pose(camera,yaw,elev); filename=f'furniture.library.bookshelf.variants-yaw+{yaw:02d}-elev{elev}.png'; scene.render.filepath=str(OUT/filename); bpy.ops.render.render(write_still=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE)); source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest(); frames=[]
 for yaw in YAW:
  for elev in ELEV:
   filename=f'furniture.library.bookshelf.variants-yaw+{yaw:02d}-elev{elev}.png'; path=OUT/filename; frames.append({'yawDegrees':yaw,'elevationDegrees':elev,'image':f'/assets/environment/oblique/{filename}','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 MANIFEST.write_text(json.dumps({'schemaVersion':1,'assetId':ASSET_ID,'source':'assets/source/blender/furniture.library.bookshelf.variants.blend','sourceSha256':source_hash,'resolutionPx':[128,128],'nominalPixelsPerTile':64,'pivotPx':[64,64],'cameraTargetTiles':[1,.5,.5],'projection':'orthographic','yawDegrees':YAW,'elevationDegrees':ELEV,'frames':frames},indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
