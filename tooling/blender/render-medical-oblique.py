import bpy,sys,os,math,hashlib,json
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path('public/assets/environment/oblique')
root.mkdir(parents=True,exist_ok=True)
assets=[('furniture.medical-bed.variants','furniture.medical-bed.variants.blend'),('fixture.medicine-cabinet.variants','fixture.medicine-cabinet.variants.blend')]
yaws=list(range(0,360,30)); elevs=list(range(20,80,10));
def render(asset,file,foot):
 bpy.ops.wm.open_mainfile(filepath=str(Path('assets/source/blender')/file)); scene=bpy.context.scene; scene.render.engine='BLENDER_WORKBENCH'; scene.render.resolution_x=128; scene.render.resolution_y=128; scene.render.resolution_percentage=100; scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.display.shading.light='STUDIO'; scene.display.shading.studio_light='paint.sl'; scene.display.shading.color_type='MATERIAL'; scene.display.shading.show_shadows=True
 cam=bpy.data.cameras.new('ObliqueCamera'); co=bpy.data.objects.new('ObliqueCamera',cam); bpy.context.collection.objects.link(co); scene.camera=co; cam.type='ORTHO'; cam.ortho_scale=max(foot)*1.35
 for yd in yaws:
  for ed in elevs:
   y=math.radians(yd); e=math.radians(ed); co.location=(4*math.cos(e)*math.cos(y),4*math.cos(e)*math.sin(y),4*math.sin(e)); co.rotation_euler=(math.pi/2-e,0,y+math.pi/2); scene.render.filepath=str(root/f'{asset}-yaw{yd:+03d}-elev{ed:02d}.png'); bpy.ops.render.render(write_still=True)
 frames=[]
 for yd in yaws:
  for ed in elevs:
   p=root/f'{asset}-yaw{yd:+03d}-elev{ed:02d}.png'; frames.append({'yawDegrees':yd,'elevationDegrees':ed,'image':'/assets/environment/oblique/'+p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 return frames
for asset,file,foot in [(a,f,(1,2) if 'bed' in a else (1,1)) for a,f in assets]:
 frames=render(asset,file,foot); man={'schemaVersion':1,'assetId':asset,'source':'assets/source/blender/'+file,'sourceSha256':hashlib.sha256((Path('assets/source/blender')/file).read_bytes()).hexdigest(),'resolutionPx':[128,128],'nominalPixelsPerTile':64,'pivotPx':[64,64],'cameraTargetTiles':[foot[0]/2,foot[1]/2,0.5],'projection':'orthographic','yawDegrees':yaws,'elevationDegrees':elevs,'frames':frames}; (root.parent.parent.parent/'game-content'/('oblique-'+asset.replace('.variants','')+'.v1.json')).parent.mkdir(parents=True,exist_ok=True); (root.parent.parent.parent/'game-content'/('oblique-'+asset.replace('.variants','')+'.v1.json')).write_text(json.dumps(man,indent=2)+'\n')
