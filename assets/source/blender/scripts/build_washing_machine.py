"""Build and render the washing-machine oblique module.

Usage: blender -b --python build_washing_machine.py
Produces the source .blend plus a deterministic 12 yaw x 6 elevation PNG set.
"""
from __future__ import annotations
import hashlib, json, math, os
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "assets/source/blender/utility.washing-machine.variants.blend"
OUT = ROOT / "public/assets/environment/oblique"
MANIFEST = ROOT / "public/game-content/oblique-utility.washing-machine.v1.json"
ASSET_ID = "utility.washing-machine.variants"
YAW = list(range(0, 360, 30))
ELEV = [20, 30, 40, 50, 60, 70]

def mat(name, color, metallic=0.0, rough=0.45):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1)
    m.use_nodes = True; bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = rough
    return m

def cube(name, loc, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new("soft edges", "BEVEL"); mod.width=bevel; mod.segments=3
    o.data.materials.append(material); return o

def cyl(name, loc, radius, depth, material, rot=(math.pi/2,0,0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o=bpy.context.object; o.name=name; o.data.materials.append(material); return o

def build():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    for d in (bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass
    white=mat("enamel", (0.72,0.77,0.78), metallic=0.18, rough=0.3)
    dark=mat("rubber", (0.045,0.06,0.065), metallic=0.05, rough=0.3)
    steel=mat("steel", (0.38,0.43,0.45), metallic=0.65, rough=0.25)
    glass=mat("blue glass", (0.06,0.16,0.2), metallic=0.1, rough=0.16)
    green=mat("status green", (0.16,0.72,0.31), metallic=0.05, rough=0.28)
    # Two-tile footprint cabinet, with a readable circular front door and top controls.
    cube("washing-machine-body", (0,0,0.78), (0.85,0.42,0.78), white, 0.08)
    cube("control-strip", (0,-0.44,1.38), (0.78,0.06,0.14), steel, 0.025)
    cube("display", (0.38,-0.505,1.39), (0.16,0.025,0.07), glass, 0.015)
    for x in (-0.45,-0.17,0.14): cyl("control-knob", (x,-0.51,1.39), 0.075, 0.035, dark, rot=(math.pi/2,0,0), verts=32)
    # Door ring axis faces the -Y side.
    cyl("door-ring", (0,-0.47,0.76), 0.48, 0.08, dark, rot=(math.pi/2,0,0))
    cyl("door-glass", (0,-0.53,0.76), 0.38, 0.035, glass, rot=(math.pi/2,0,0))
    cyl("door-handle", (0.27,-0.57,0.78), 0.06, 0.04, steel, rot=(math.pi/2,0,0), verts=24)
    cube("status-light", (-0.52,-0.51,1.39), (0.035,0.02,0.035), green, 0.01)
    # feet keep the silhouette grounded on the tile.
    for x in (-0.58,0.58):
      for y in (-0.27,0.27): cube("foot", (x,y,0.05), (0.1,0.1,0.05), dark, 0.02)
    # Camera and lighting. The object uses an orthographic, transparent render.
    bpy.ops.object.camera_add(); camera=bpy.context.object; camera.name="ObliqueCamera"; camera.data.type='ORTHO'; camera.data.ortho_scale=3.35; bpy.context.scene.camera=camera
    bpy.ops.object.light_add(type='AREA', location=(-3,-4,6)); key=bpy.context.object; key.data.energy=480; key.data.shape='DISK'; key.data.size=5
    bpy.ops.object.light_add(type='AREA', location=(4,2,3)); fill=bpy.context.object; fill.data.energy=260; fill.data.size=4
    return camera

def point_camera(camera, yaw, elev):
    radius=7.0; target=Vector((0,0,0.78)); yr=math.radians(yaw); er=math.radians(elev)
    camera.location=target + Vector((radius*math.cos(er)*math.sin(yr), -radius*math.cos(er)*math.cos(yr), radius*math.sin(er)))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()

def main():
    camera=build(); scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=128; scene.render.resolution_y=128; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=True
    scene.render.image_settings.color_depth='8'; scene.world.color=(0.035,0.045,0.05)
    OUT.mkdir(parents=True, exist_ok=True)
    for yaw in YAW:
      for elev in ELEV:
        point_camera(camera,yaw,elev)
        name=f"utility.washing-machine.variants-yaw+{yaw:02d}-elev{elev}.png"
        scene.render.filepath=str(OUT/name); bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    frames=[]
    for yaw in YAW:
      for elev in ELEV:
        name=f"utility.washing-machine.variants-yaw+{yaw:02d}-elev{elev}.png"; path=OUT/name
        frames.append({"yawDegrees":yaw,"elevationDegrees":elev,"image":f"/assets/environment/oblique/{name}","sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    data={"schemaVersion":1,"assetId":ASSET_ID,"source":"assets/source/blender/utility.washing-machine.variants.blend","sourceSha256":source_hash,"resolutionPx":[128,128],"nominalPixelsPerTile":64,"pivotPx":[64,64],"cameraTargetTiles":[1.0,0.5,0.5],"projection":"orthographic","yawDegrees":YAW,"elevationDegrees":ELEV,"frames":frames}
    MANIFEST.write_text(json.dumps(data, indent=2)+"\n", encoding="utf-8")
if __name__ == '__main__': main()
