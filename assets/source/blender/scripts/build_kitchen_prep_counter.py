"""Build a deterministic 2x1 kitchen prep counter oblique module.

Run with Blender in background mode. The generated source and 72 RGBA views share
one footprint with the in-game object.prep-counter consumer.
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "assets/source/blender/furniture.kitchen.prep-counter.variants.blend"
OUT = ROOT / "public/assets/environment/oblique"
MANIFEST = ROOT / "public/game-content/oblique-furniture.kitchen-prep-counter.v1.json"
ASSET_ID = "furniture.kitchen.prep-counter.variants"
YAW = list(range(0, 360, 30))
ELEVATION = [20, 30, 40, 50, 60, 70]

def material(name: str, color: tuple[float, float, float], metallic=0.0, roughness=.45):
    mat = bpy.data.materials.new(name); mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat

def cube(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object; obj.name = name; obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("soft edges", "BEVEL"); modifier.width = bevel; modifier.segments = 3
    obj.data.materials.append(mat); return obj

def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(mat); return obj

def build_scene():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    steel = material("brushed stainless", (.42, .49, .52), .72, .23)
    dark = material("recess shadow", (.035, .045, .05), .22, .3)
    wood = material("butcher block", (.48, .22, .09), .02, .48)
    ceramic = material("prep basin", (.82, .86, .84), .12, .28)
    food = material("ingredient pans", (.67, .31, .08), .05, .38)
    green = material("sanitation light", (.18, .75, .32), .03, .26)
    # two tile wide, one tile deep counter; front faces -Y like other kitchen assets
    cube("counter-body", (0, 0, .48), (1.0, .44, .48), steel, .05)
    cube("worktop", (0, 0, 1.03), (1.03, .47, .07), wood, .025)
    cube("rear-splash", (0, .38, 1.32), (1.0, .055, .30), steel, .025)
    # inset prep basin and three readable ingredient wells
    cube("basin", (-.58, -.03, 1.12), (.30, .28, .055), ceramic, .045)
    cube("basin-inner", (-.58, -.03, 1.17), (.23, .21, .025), dark, .03)
    for x in (-.05, .30, .65):
        cube("ingredient-pan", (x, -.02, 1.115), (.13, .21, .045), food, .025)
        cube("ingredient", (x, -.02, 1.17), (.095, .16, .018), wood, .012)
    # front drawers/handles and sanitation indicator make orientation legible
    for x in (-.66, -.22, .22, .66):
        cube("drawer", (x, -.465, .55), (.17, .025, .15), dark, .015)
        cube("drawer-handle", (x, -.50, .64), (.08, .018, .018), steel, .008)
    cube("status-light", (.86, -.51, 1.03), (.035, .018, .035), green, .01)
    for x in (-.78, .78):
        for y in (-.27, .27): cube("foot", (x, y, .06), (.09, .09, .05), dark, .018)
    bpy.ops.object.camera_add(); camera = bpy.context.object; camera.name = "ObliqueCamera"
    camera.data.type = "ORTHO"; camera.data.ortho_scale = 3.8; bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(-3, -4, 6)); key = bpy.context.object; key.data.energy = 500; key.data.shape = "DISK"; key.data.size = 5
    bpy.ops.object.light_add(type="AREA", location=(4, 2, 3)); fill = bpy.context.object; fill.data.energy = 260; fill.data.size = 4
    return camera

def aim(camera, yaw, elevation):
    target = Vector((0, 0, .78)); radius = 7.; yr = math.radians(yaw); er = math.radians(elevation)
    camera.location = target + Vector((radius * math.cos(er) * math.sin(yr), -radius * math.cos(er) * math.cos(yr), radius * math.sin(er)))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()

def main():
    camera = build_scene(); scene = bpy.context.scene; scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 128; scene.render.resolution_y = 128; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"; scene.render.image_settings.color_depth = "8"; scene.render.film_transparent = True
    scene.world.color = (.035, .045, .05); OUT.mkdir(parents=True, exist_ok=True)
    for yaw in YAW:
        for elevation in ELEVATION:
            aim(camera, yaw, elevation)
            filename = f"furniture.kitchen.prep-counter.variants-yaw+{yaw:02d}-elev{elevation}.png"
            scene.render.filepath = str(OUT / filename); bpy.ops.render.render(write_still=True)
    SOURCE.parent.mkdir(parents=True, exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    frames = []
    for yaw in YAW:
        for elevation in ELEVATION:
            filename = f"furniture.kitchen.prep-counter.variants-yaw+{yaw:02d}-elev{elevation}.png"; path = OUT / filename
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation, "image": f"/assets/environment/oblique/{filename}", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest = {"schemaVersion": 1, "assetId": ASSET_ID, "source": "assets/source/blender/furniture.kitchen.prep-counter.variants.blend", "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "resolutionPx": [128, 128], "nominalPixelsPerTile": 64, "pivotPx": [64, 64], "cameraTargetTiles": [1.0, .5, .5], "projection": "orthographic", "yawDegrees": YAW, "elevationDegrees": ELEVATION, "frames": frames}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__": main()
