"""Recover the actual e08129b96 north open-door producer; retain source, aliases and camera.
Only this door is rendered. Registry and West descriptors are never rewritten.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import argparse
import itertools
import struct
import zlib
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common
pipeline_common.require_blender_version()


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/environment/oblique"
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
WALL = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
LEAF = ROOT / "assets/source/blender/door.interior.leaf.open.blend"
YAW = tuple(range(-180, 180, 15))
ELEVATION = (25, 45, 65)
TARGET = Vector((0, 0, 0))
RADIUS = 12.0


def append_collection(path: Path, name: str):
    with bpy.data.libraries.load(str(path), link=False) as (available, loaded):
        if name not in available.collections:
            raise RuntimeError(f"{path.name} lacks {name}")
        loaded.collections = [name]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    return collection


def setup_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    pipeline_common.apply_deterministic_render_settings(scene)
    configure_oblique_module_lighting(scene)
    camera_data = bpy.data.cameras.new("oblique module camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.0
    camera = bpy.data.objects.new("oblique module camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera


def render_module(asset_id: str, slug: str, source: Path, dependencies: list[Path],
                  resolution_px: int = 512, render_yaws=YAW, render_elevations=ELEVATION) -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = resolution_px
    scene.camera.data.ortho_scale = resolution_px / 64.0
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw in render_yaws:
        for elevation in render_elevations:
            azimuth = math.radians(yaw)
            pitch = math.radians(elevation)
            scene.camera.location = (TARGET.x + RADIUS * math.sin(azimuth),
                                     TARGET.y - RADIUS * math.cos(azimuth),
                                     TARGET.z + RADIUS * math.tan(pitch))
            scene.camera.rotation_euler = (TARGET - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
            stem = f"{slug}-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(staging)
            validate_png(staging.read_bytes())
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            final = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(final)
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                           "image": f"/assets/environment/oblique/{final.name}",
                           "sha256": digest})
    manifest = {"schemaVersion": 1, "assetId": asset_id, "source": source.name,
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sourceDependencies": [{"source": path.name,
                                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                                       for path in dependencies],
                "resolutionPx": [resolution_px, resolution_px], "nominalPixelsPerTile": 64,
                "pivotPx": [resolution_px // 2, resolution_px // 2], "cameraTargetTiles": list(TARGET),
                "projection": "orthographic", "yawDegrees": list(YAW),
                "elevationDegrees": list(ELEVATION), "frames": frames}
    if tuple(render_yaws) != YAW or tuple(render_elevations) != ELEVATION:
        print("NORTH_DOOR_BOUNDED_RENDER_GREEN", len(frames), flush=True)
        return
    path = ROOT / f"public/game-content/oblique-{slug}.v1.json"
    pipeline_common.write_text(path, json.dumps(manifest, indent=2) + "\n")


def configure_oblique_module_lighting(scene: bpy.types.Scene) -> None:
    """Give isolated oblique assets one authored light direction and colour grade.

    Actor source files contain the lighting for their older directional atlas.
    Disable it before adding the same studio used by environment modules.
    """
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.hide_render = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("neutral oblique studio")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.72, 0.77, 0.82, 1)
    background.inputs["Strength"].default_value = 0.7
    light_data = bpy.data.lights.new("soft north-west light", "AREA")
    light_data.energy = 600
    light_data.shape = "DISK"
    light_data.size = 5
    light = bpy.data.objects.new("soft north-west light", light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)


def strip_png_metadata(path: Path) -> None:
    """Remove Blender's per-render EXIF/text chunks from an otherwise stable PNG."""
    source = path.read_bytes()
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    result = bytearray(source[:8])
    offset = 8
    while offset < len(source):
        size = struct.unpack(">I", source[offset:offset + 4])[0]
        kind = source[offset + 4:offset + 8]
        data = source[offset + 8:offset + 8 + size]
        if kind in (b"IHDR", b"sRGB", b"gAMA", b"cHRM", b"IDAT", b"IEND"):
            result += struct.pack(">I", size) + kind + data
            result += struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        offset += 12 + size
    path.write_bytes(result)


def source_contacts(scene, pairs):
    """Evaluated triangle-interior witnesses, not an AABB-only contact claim."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    trees, bounds = {}, {}
    for name in sorted({name for pair in pairs for name in pair}):
        value = bpy.data.objects[name].evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            trees[name] = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
            bounds[name] = ([min(p[a] for p in vertices) for a in range(3)], [max(p[a] for p in vertices) for a in range(3)])
        finally:
            value.to_mesh_clear()
    direction = Vector((.937, .223, .181)).normalized()
    def inside(name, point):
        origin, crossings = point.copy(), 0
        for _ in range(100):
            hit, _, _, _ = trees[name].ray_cast(origin, direction, 100)
            if hit is None:
                return crossings % 2 == 1
            crossings += 1
            origin = hit + direction * 1e-5
        raise ValueError('North door retained hinge interior ray did not terminate')
    rows = []
    for first, second in pairs:
        low = [max(bounds[first][0][a], bounds[second][0][a]) for a in range(3)]
        high = [min(bounds[first][1][a], bounds[second][1][a]) for a in range(3)]
        witness = None
        if all(high[a] - low[a] > 1e-5 for a in range(3)):
            for fractions in itertools.product((.5, .25, .75, .125, .875, .375, .625), repeat=3):
                point = Vector(tuple(low[a] + (high[a] - low[a]) * fractions[a] for a in range(3)))
                if inside(first, point) and inside(second, point):
                    witness = point
                    break
        if witness is None:
            raise ValueError(f'North door retained hinge actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows



ASSET = "door.interior.open.full"
SLUG = "cell-door-open"
LEAF_SHA = "48a27d1b212e88121e6b55661452f70df1129e78f8825eebc3913db1d5aeaf5f"
WALL_SHA = "98b264c5b3ea15658d7d8996f403024928c660135a66025adccba1d385927e6c"
CONTRACT = ROOT / "assets/source/blender/door.interior.open.full.export-contract.json"
PAIRS = [("Hinge barrel 0.38", "door metal reveal -1"), ("Hinge barrel 1.89", "door metal reveal -1")]
_audit_spec = importlib.util.spec_from_file_location("north_door_retained_audit", Path(__file__).with_name("refine-guard-belt-detail.py"))
audit = importlib.util.module_from_spec(_audit_spec)
_audit_spec.loader.exec_module(audit)


def validate_dispatch():
    if (ASSET, SLUG, LEAF.name, WALL.name, tuple(TARGET), RADIUS, YAW, ELEVATION) != (
        "door.interior.open.full", "cell-door-open", "door.interior.leaf.open.blend", "wall.interior.cutaway.blend",
        (0, 0, 0), 12.0, tuple(range(-180, 180, 15)), (25, 45, 65)):
        raise ValueError("North door source/camera/asset dispatch changed")
    for path, expected in [(LEAF, LEAF_SHA), (WALL, WALL_SHA)]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("North door original source bytes changed: " + path.name)


def assembly_record():
    scene = bpy.context.scene
    rows = audit.capture(scene)
    names = sorted(rows)
    return {"source": LEAF.name, "sourceSha256": LEAF_SHA,
            "dependency": WALL.name, "dependencySha256": WALL_SHA,
            "collections": {c.name: sorted(o.name for o in c.all_objects if o.type == "MESH")
                            for c in scene.collection.children if c.name in ("wall.interior.doorframe.full", "door.interior.leaf.open")},
            "parts": names,
            "rawMeshes": [audit.raw_record(bpy.data.objects[name]) for name in names],
            "worldMatrices": {name: [list(row) for row in bpy.data.objects[name].matrix_world] for name in names},
            "evaluatedHashes": {name: rows[name]["evaluatedPositionSha256"] for name in names},
            "bounds": audit.bounds(scene), "materialGraphs": audit.materials_record()}


def verify_assembly():
    contacts = source_contacts(bpy.context.scene, PAIRS)
    actual = assembly_record()
    expected = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if actual != expected:
        raise ValueError("North door original selected assembly/material geometry contract changed")
    print("NORTH_DOOR_RETAINED_ASSEMBLY_GREEN", len(actual["parts"]), "meshes", len(actual["materialGraphs"]),
          "material graphs", json.dumps(contacts), flush=True)


def verify_studio():
    scene = bpy.context.scene
    camera = scene.camera
    background = scene.world.node_tree.nodes.get("Background")
    lights = [o for o in scene.objects if o.type == "LIGHT" and not o.hide_render]
    if (scene.render.engine != "BLENDER_EEVEE" or scene.eevee.taa_render_samples != 64 or
        scene.eevee.use_raytracing or camera.data.type != "ORTHO" or camera.data.ortho_scale != 8 or
        (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (512,512,100) or
        scene.view_settings.view_transform != "Standard" or scene.view_settings.look != "Medium High Contrast"):
        raise ValueError("North door retained render quality/camera/color-management changed")
    if (len(lights) != 1 or lights[0].data.type != "AREA" or lights[0].data.shape != "DISK" or
        lights[0].data.energy != 600 or lights[0].data.size != 5 or tuple(lights[0].location) != (-3,-4,7) or
        max(abs(a-b) for a,b in zip(background.inputs["Color"].default_value,(.72,.77,.82,1))) > 1e-6 or
        abs(background.inputs["Strength"].default_value-.7) > 1e-6):
        raise ValueError("North door retained actual studio lighting changed")
    print("NORTH_DOOR_STUDIO_GREEN original EEVEE64/512/8span/64ppU lighting",flush=True)


def initialize_bounded_pose(yaw, elevation):
    """Reproduce original canonical first render before a later isolated EEVEE pose.

    Full72 output is exactly historical; a fresh later-pose-only first render differs.
    Initialization stays in ignored scratch and never replaces descriptor-owned PNGs.
    """
    global OUTPUT
    if (yaw,elevation) == (YAW[0],ELEVATION[0]):return
    destination = OUTPUT
    try:
        OUTPUT = ROOT / "assets/intermediate/interior-north-door-repeat-initialization"
        render_module(ASSET,SLUG,LEAF,[WALL],512,(YAW[0],),(ELEVATION[0],))
    finally:
        OUTPUT = destination
    verify_assembly()
    print("NORTH_DOOR_CANONICAL_INITIALIZATION_GREEN -180/25 before bounded later pose",flush=True)


def validate_png(body):
    """Decode all five PNG filters; reject clipping after the real render, before hashing."""
    if body[:8] != b"\x89PNG\r\n\x1a\n": raise ValueError("North door frame is not PNG")
    offset, chunks, header = 8, [], None
    while offset < len(body):
        size = struct.unpack(">I", body[offset:offset+4])[0]
        kind, data = body[offset+4:offset+8], body[offset+8:offset+8+size]
        crc = struct.unpack(">I", body[offset+8+size:offset+12+size])[0]
        if zlib.crc32(kind+data) & 0xffffffff != crc: raise ValueError("North door PNG CRC invalid")
        if kind == b"IHDR": header = struct.unpack(">IIBBBBB", data)
        if kind == b"IDAT": chunks.append(data)
        offset += size+12
    if header != (512, 512, 8, 6, 0, 0, 0): raise ValueError("North door PNG dimensions/RGBA format changed")
    raw = zlib.decompress(b"".join(chunks)); stride=512*4
    if len(raw) != 512*(stride+1): raise ValueError("North door PNG decoded length changed")
    previous = bytearray(stride); pixels=[]
    def paeth(a,b,c):
        p=a+b-c; pa,pb,pc=abs(p-a),abs(p-b),abs(p-c)
        return a if pa <= pb and pa <= pc else b if pb <= pc else c
    for y in range(512):
        start=y*(stride+1); mode=raw[start]; row=bytearray(raw[start+1:start+1+stride])
        if mode > 4: raise ValueError("North door PNG filter invalid")
        for x in range(stride):
            a=row[x-4] if x>=4 else 0; b=previous[x]; c=previous[x-4] if x>=4 else 0
            predictor=(0,a,b,(a+b)//2,paeth(a,b,c))[mode]
            row[x]=(row[x]+predictor)&255
        if row[3] or row[-1] or (y in (0,511) and any(row[3::4])):
            raise ValueError("North door decoded silhouette clips frame border")
        pixels.extend(row[3::4]); previous=row
    if not any(pixels): raise ValueError("North door decoded frame has no visible model")


def verify_exports():
    validate_dispatch()
    path=ROOT / "public/game-content/oblique-cell-door-open.v1.json"
    manifest=json.loads(path.read_text(encoding="utf-8"))
    expected={"schemaVersion":1,"assetId":ASSET,"source":LEAF.name,"sourceSha256":LEAF_SHA,
              "sourceDependencies":[{"source":WALL.name,"sha256":WALL_SHA}],"resolutionPx":[512,512],
              "nominalPixelsPerTile":64,"pivotPx":[256,256],"cameraTargetTiles":[0.0,0.0,0.0],
              "projection":"orthographic","yawDegrees":list(YAW),"elevationDegrees":list(ELEVATION)}
    if {k:v for k,v in manifest.items() if k != "frames"} != expected:
        raise ValueError("North door exported descriptor source/camera dispatch changed")
    if [(f["yawDegrees"],f["elevationDegrees"]) for f in manifest["frames"]] != list(itertools.product(YAW,ELEVATION)):
        raise ValueError("North door exported canonical 72 pose grid changed")
    for frame in manifest["frames"]:
        body=(ROOT/"public"/frame["image"].lstrip("/")).read_bytes()
        validate_png(body)
        digest=hashlib.sha256(body).hexdigest()
        stem=f'{SLUG}-yaw{frame["yawDegrees"]:+03d}-elev{frame["elevationDegrees"]:02d}'
        if digest != frame["sha256"] or frame["image"] != f"/assets/environment/oblique/{stem}.{digest[:12]}.png":
            raise ValueError("North door exported body/hash path changed")
    print("NORTH_DOOR_EXPORTED_BODY_GREEN 72 genuinely decoded RGBA bodies",flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--capture-contract",action="store_true")
    parser.add_argument("--verify-only",action="store_true")
    parser.add_argument("--verify-exports",action="store_true")
    parser.add_argument("--yaw",type=int)
    parser.add_argument("--elevation",type=int)
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    validate_dispatch()
    if args.verify_exports:
        verify_exports();return
    setup_scene()
    append_collection(WALL,"wall.interior.doorframe.full")
    append_collection(LEAF,"door.interior.leaf.open")
    bpy.context.view_layer.update()
    if args.capture_contract:
        if CONTRACT.exists(): raise ValueError("Refusing to replace retained contract")
        pipeline_common.write_text(CONTRACT,json.dumps(assembly_record(),indent=2)+"\n")
    verify_assembly()
    verify_studio()
    if args.verify_only or args.capture_contract:return
    if (args.yaw is None)!=(args.elevation is None):raise ValueError("Bounded pose needs both yaw and elevation")
    if args.yaw is not None and (args.yaw not in YAW or args.elevation not in ELEVATION):raise ValueError("Noncanonical bounded pose")
    if args.yaw is not None:initialize_bounded_pose(args.yaw,args.elevation)
    render_module(ASSET,SLUG,LEAF,[WALL],512,
                  (args.yaw,) if args.yaw is not None else YAW,
                  (args.elevation,) if args.elevation is not None else ELEVATION)
    if args.yaw is None:verify_exports()


if __name__ == "__main__":main()
