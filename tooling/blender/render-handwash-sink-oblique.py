"""Render 72 deterministic oblique views of the hand-washing sink module."""
from __future__ import annotations
import hashlib, json, math, os, struct, sys, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common
pipeline_common.require_blender_version()
repo = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = Path(args[args.index("--output") + 1]).resolve() if "--output" in args else repo / "public/assets/environment/oblique"
out.mkdir(parents=True, exist_ok=True)
ASSET_ID = "fixture.cell.sink.handwash"
SOURCE = repo / "assets/source/blender/fixture.cell.sink.handwash.blend"
YAWS = list(range(0, 360, 30)); ELEVATIONS = list(range(20, 80, 10))

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

def normalize(path: Path):
    blob = path.read_bytes(); offset = 8; header = None; compressed = b""; metadata = []
    while offset < len(blob):
        length = struct.unpack(">I", blob[offset:offset+4])[0]; kind = blob[offset+4:offset+8]; data = blob[offset+8:offset+8+length]; offset += 12 + length
        if kind == b"IHDR": header = data
        elif kind == b"IDAT": compressed += data
        elif kind in (b"sRGB", b"gAMA", b"cHRM", b"iCCP"): metadata.append((kind, data))
    if header is None: raise ValueError(f"missing IHDR in {path}")
    width, height, depth, color_type, compression, filt, interlace = struct.unpack(">IIBBBBB", header)
    if (depth,color_type,compression,filt,interlace) != (8,6,0,0,0): raise ValueError(f"unsupported PNG format in {path}")
    raw=zlib.decompress(compressed); stride=width*4; rows=[]; pos=0; prev=bytearray(stride)
    for _ in range(height):
        ft=raw[pos]; pos+=1; row=bytearray(raw[pos:pos+stride]); pos+=stride
        if ft==1:
            for i in range(4,stride): row[i]=(row[i]+row[i-4])&255
        elif ft==2:
            for i in range(stride): row[i]=(row[i]+prev[i])&255
        elif ft==3:
            for i in range(stride): row[i]=(row[i]+((row[i-4] if i>=4 else 0)+prev[i]>>1))&255
        elif ft==4:
            for i in range(stride):
                a=row[i-4] if i>=4 else 0; b=prev[i]; c=prev[i-4] if i>=4 else 0
                p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                row[i]=(row[i]+pr)&255
        elif ft!=0: raise ValueError(f"unsupported PNG filter {ft}")
        rows.append(row); prev=row
    encoded=b"".join(b"\x00"+bytes(row) for row in rows)
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",header)+b"".join(chunk(k,d) for k,d in metadata)+chunk(b"IDAT",zlib.compress(encoded,9))+chunk(b"IEND",b""))

bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); scene=bpy.context.scene
scene.render.engine="BLENDER_WORKBENCH"; scene.render.resolution_x=128; scene.render.resolution_y=128; scene.render.resolution_percentage=100
scene.render.film_transparent=True; scene.render.image_settings.file_format="PNG"; scene.render.image_settings.color_mode="RGBA"; scene.render.image_settings.color_depth="8"; scene.render.image_settings.compression=15; scene.render.dither_intensity=0.0
scene.display.shading.light="STUDIO"; scene.display.shading.studio_light="paint.sl"; scene.display.shading.color_type="MATERIAL"; scene.display.shading.show_shadows=True
cam_data=bpy.data.cameras.new("ObliqueCamera"); cam=bpy.data.objects.new("ObliqueCamera",cam_data); bpy.context.collection.objects.link(cam); scene.camera=cam; cam_data.type="ORTHO"; cam_data.ortho_scale=1.65
frames=[]
for yaw in YAWS:
  for elev in ELEVATIONS:
    er=math.radians(elev); yr=math.radians(yaw); cam.location=(4*math.cos(er)*math.cos(yr),4*math.cos(er)*math.sin(yr),4*math.sin(er)); cam.rotation_euler=(math.pi/2-er,0,yr+math.pi/2)
    file=out/f"{ASSET_ID}-yaw{yaw:+03d}-elev{elev:02d}.png"; scene.render.filepath=str(file); bpy.ops.render.render(write_still=True); normalize(file)
    frames.append({"yawDegrees":yaw,"elevationDegrees":elev,"image":"/assets/environment/oblique/"+file.name,"sha256":hashlib.sha256(file.read_bytes()).hexdigest()})
manifest={"schemaVersion":1,"assetId":ASSET_ID,"source":"assets/source/blender/fixture.cell.sink.handwash.blend","sourceSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),"resolutionPx":[128,128],"nominalPixelsPerTile":64,"pivotPx":[64,64],"cameraTargetTiles":[0.5,0.5,0.45],"projection":"orthographic","yawDegrees":YAWS,"elevationDegrees":ELEVATIONS,"frames":frames}
manifest_path=repo/"public/game-content/oblique-fixture-cell-sink-handwash.v1.json"; pipeline_common.write_text(manifest_path,json.dumps(manifest,indent=2)+"\n"); print("rendered",len(frames),"frames; manifest",manifest_path)
