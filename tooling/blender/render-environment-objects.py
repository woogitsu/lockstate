"""Render every environment catalogue collection to one top-down object sprite.

Run with:

    /opt/blender/blender -b assets/source/blender/environment.mvp.catalog.blend \
        --factory-startup --python tooling/blender/render-environment-objects.py -- \
        --output assets/rendered/environment

`export-directional-sprites.py` renders *characters*: eight directions, two
clips, a 256x384 frame with a foot pivot. Nothing rendered an environment
collection until this file, which is why the 23 sheets under
`public/game-content/source-art/` are owner-supplied PNGs from 2026-08-22 and
not output of `create-environment-catalog.py` at all. That mismatch is visible
in the shipped art: `fixture.cell.toilet_sink` ships as a 1:2.5 combined column
while the catalogue declares its footprint `(1, 1)`.

## How a frame is built, and why each number is what it is

**Orthographic and straight down.** `tile-layer.ts` draws an object frame flat
into the rectangle its footprint reserves, with no elevation of its own, so a
perspective render would put a vanishing point inside a sprite that is then
tiled next to a copy of itself. The camera is `ORTHO`, at identity rotation
(view direction `-Z`), centred over the collection's origin empty.

**Framed to the declared footprint aspect.** `collection["footprintTiles"]`
is the contract `create-environment-catalog.py` promises not to move, and
`tests/unit/environment-art.test.ts` checks two ratios against it within 3%:
the source crop against the packed frame, and the packed frame against the
footprint. Both are satisfied here by construction rather than by measurement
afterwards -- the camera's world-space frame has *exactly* the footprint's
aspect, and the pixel resolution is chosen from the footprint reduced to
lowest integer terms, so `res_x / res_y == footprint_w / footprint_h` exactly
for all 23 models. A consumer reading one of these PNGs whole therefore needs
`quarterTurns: 0` and a `runtimeSizePx` of the frame's own proportions, and
both drift figures are zero rather than merely small.

Note that the brief this file was written from glossed that rule as "a 1x2 bed
renders 2:1". It does not: `(1, 2)` is one tile of `+X` by two tiles of `+Y`,
so the bed renders 1:2, portrait, standing north-south the way it is drawn.
The shipped sheet's 460x230 bed crop is 2:1 because that sheet holds the bed
lying east-west and `env.object.bed` turns it a quarter-turn clockwise when it
is packed. Rendering the object in the orientation it is drawn in removes that
turn instead of reproducing it.

**A transparent margin, not a tight crop.** #1028 measured why a tight crop is
wrong for an object: the *shrink* step in `environment-sprites.ts`'s alpha scan
exists to keep a tiling frame's antialiased rim out of a seam, and on a discrete
object the outermost pixels are the object's own silhouette -- a bed's head and
foot rails. So the frame is the footprint grown by `MARGIN_FRACTION` on every
side (`0.06`, i.e. 6% of the footprint's own width and height, which keeps the
aspect exact), and the margin is recorded in the sidecar manifest rather than
left to be re-measured.

**And grown further when the model overhangs its footprint, because three of
them do.** `perimeter.watchtower.variants` declares `(2, 2)` and its roof is
2.35 units across; `security.camera.wall.variants` declares `(0.6, 0.4)` and
its body is 0.62 wide. A frame sized from the footprint alone would clip them.
The frame is therefore scaled up -- uniformly, so the aspect never changes --
until the evaluated bounds of every mesh in the collection, bevel modifiers
included, fit inside it with the same margin. `frameTiles` in the manifest is
what the frame really covers; when it is larger than `footprintTiles` the
sidecar says so per asset, and a consumer that draws the frame into a
footprint-sized rectangle is drawing the overhang smaller than authored. That
is a fact about the model, not about this renderer, and it is reported rather
than hidden.

**Lights and world are built here, not in the .blend.** The catalogue holds 85
objects and no camera, no light and no authored world -- it is a geometry
catalogue. Everything that decides pixels is therefore constructed in this
script from constants below, which is also what makes two runs comparable.

## Determinism

Seeds, samples and encode settings come from `pipeline_common`; nothing here
invents its own. `apply_deterministic_render_settings` pins dither to 0,
transparent film, and PNG/RGBA/8-bit/compression 15, and
`require_blender_version` refuses a Blender that is not the pinned 5.2.

`export-directional-sprites.py`'s docblock records the one thing that makes a
naive byte comparison useless: Blender writes `Date`, `RenderTime` and the
absolute source `.blend` path into every PNG as `tEXt` chunks. This script
rewrites each rendered PNG before it lands (see `_flip_and_rewrite_png`), which
it has to do anyway, and that rewrite carries only `IHDR`, the colour-space
chunks and `IDAT`. So these outputs are byte-stable as well as pixel-stable.

**THIS PARAGRAPH USED TO SAY NOTHING CHECKED THAT AUTOMATICALLY, AND IT NO
LONGER DOES -- KEPT RATHER THAN DELETED BECAUSE IT IS THE HISTORY OF WHY THE
GATE BELOW EXISTS.** Before it, this docstring claimed both properties "are
checked with `--verify-determinism`"; that flag never existed --
`cli_arguments()` below defines `--output`, `--only` and `--pixels-per-tile`
and nothing else. Before *that* correction (`cb005408`), the properties were
established only by running this script twice by hand and comparing 23 file
hashes and 23 decoded pixel buffers, twice, by two people, with no executable
gate behind them at all.

**The gate now exists: `tooling/verify-environment-render-determinism.mjs`.**
It runs this script N times (default 2) into separate scratch directories and
compares the SHA-256 of every rendered PNG and of `environment-objects.render.json`
across the runs -- the same shape as `tooling/verify-pipeline-determinism.mjs`,
which does the equivalent job for the character pipeline, but a separate
script rather than a mode of that one because the two pipelines share no steps
below `pipeline_common.py`. Its own docblock is the fuller account, including
what a green run does and does not prove.

**It needs Blender, and CI does not have it.** `.github/workflows/ci.yml` was
read rather than assumed on 2026-09-06: none of its three jobs (`verify`,
`assets`, `browser`) installs Blender. So this gate is not, and cannot
honestly claim to be, a CI-enforced one; it runs wherever Blender does --
this container, or a human's machine.
`tests/determinism/environment-render-determinism.test.ts` wires its fast,
single-collection form into `pnpm test` with the same `it.skipIf(!canRunLive)`
idiom `tests/determinism/art-pipeline-determinism.test.ts` already uses for
the character pipeline's own live check: SKIPPED, visibly, wherever Blender is
absent or is not the pinned 5.2.x, and actually exercised wherever it is
present. Measured in the container this gate was built in, with Blender 5.2.1
installed at `/opt/blender/blender`: two independent runs of
`door.interior.variants` (the smallest, fastest frame in the catalogue) agree
byte-for-byte, matching the committed sidecar's own recorded hash
(`baa834a5d1cb68ee…`); reinstating `tEXt` in `_flip_and_rewrite_png`'s
passthrough set below -- which puts Blender's own `Date`/`RenderTime`/absolute
path stamps back into the final file -- makes the same two runs disagree on
both the PNG and the sidecar. Neither of those two properties was previously
checked by anything that executes.

**What is still not covered, stated rather than implied.** The gate proves the
*renderer* reproduces on the Blender actually present; it does not re-render
all 23 and compare against the committed bytes in `assets/rendered/environment/`
by default (`--only` lets a caller ask it to), and it proves nothing about a
Blender version other than the pinned one.
`tooling/validate-rendered-art-catalog.mjs` and
`tests/contract/rendered-art-pipeline-contract.test.ts` are the separate,
Blender-free gates for the geometry invariants (frame never narrower than
footprint, and -- independently recomputed from `footprintTiles` and the
declared pixel size as an exact integer identity, not trusted from this
script's own `frameAspectDriftFromFootprint` field -- the aspect matching the
footprint exactly) and for the published-catalog hash cross-reference; see
`docs/ART_PIPELINE.md` ("Environment objects", "Reproducibility") for the full
account of what each gate does and does not prove.

## Why the rewrite exists at all

A camera above the ground looking down cannot put north at the top of the image
and east on the right at the same time: with view direction `-Z` and image-right
`+X`, image-up is necessarily `+Y`, and `+Y` is *south*
(`docs/ART_PIPELINE.md`, "Character directions"). The only rotation that puts
north up is a 180-degree turn about `Z`, which also puts west on the right. The
frame the game draws has `+X` right and `+Y` down the screen, which is a
mirrored basis, so exactly one vertical flip is owed somewhere. Doing it on the
image is the only place it can be done without moving geometry the catalogue
promises not to move. Blender 5.2 has no scene compositor `node_tree` and its
`CompositorNodeFlip` no longer carries an `axis` property, so the flip is done
on the encoded PNG: rows are reversed and re-emitted with filter type 0, which
is an exact reordering of the same 8-bit samples and not a re-render.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import zlib
from math import gcd, radians
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
DEFAULT_OUTPUT = ROOT / "assets/rendered/environment"

SCHEMA_VERSION = 1

# 6% of the footprint on every side. Large enough that a bed's head rail and a
# locker's door lip are never the outermost pixel row, small enough that the
# object still fills its tile at 64px. Applied as a fraction of the footprint's
# own width and height, so the frame's aspect is unchanged by it.
MARGIN_FRACTION = 0.06

# Pixels per logical tile along the frame's longer axis. 128 is what the runtime
# frames use (`environment-sprites.ts`: "one 128px axis becomes one 64px tile"),
# so 256 renders at exactly twice that and downsamples to it by an integer
# factor with no resampling artefacts.
PIXELS_PER_TILE = 256

# Every declared footprint is an exact multiple of 1/20 of a tile (0.2, 0.25,
# 0.3, 0.4 and whole tiles), so scaling by 20 turns the pair into integers with
# no rounding, and reducing by their gcd gives the smallest pixel rectangle with
# the footprint's exact aspect.
FOOTPRINT_DENOMINATOR = 20

# Lighting. A key sun from the north-west high enough that a top-down view still
# reads the top faces, a weaker fill from the south-east so the shadowed sides
# are not black, and an ambient sky. Elevation is measured from the horizon.
KEY_SUN = {"energy": 3.6, "elevation_deg": 62.0, "azimuth_deg": -40.0, "angle_deg": 3.0}
FILL_SUN = {"energy": 1.15, "elevation_deg": 34.0, "azimuth_deg": 150.0, "angle_deg": 12.0}
WORLD_COLOUR = (0.34, 0.37, 0.42, 1.0)
WORLD_STRENGTH = 0.55

EEVEE_RENDER_SAMPLES = 64

# Colour management. `pipeline_common` pins every encode setting that changes
# the bytes of a frame and says nothing about the view transform, so what the
# pipeline "already does" is leave the scene's own setting alone -- which for
# this catalogue is Blender's factory default, AgX, the same transform the
# committed character atlases were rendered under.
#
# "Standard" was rendered and looked at rather than reasoned about, because AgX
# is a filmic tone map built for photographic renders and these are flat sprites
# read at 64px. On this scene it is the worse of the two: the pillow material
# (0.9, 0.92, 0.82) clips to flat #ffffff under Standard at this key intensity
# and loses the shading that makes it read as a pillow rather than a white
# rectangle, while AgX rolls it off and keeps the form. Palette fidelity would
# be the argument for Standard, and it is not worth a blown highlight on the one
# feature of the bed a player can recognise. Kept at the scene default, with
# look, exposure and gamma pinned beside it so a preference or a future default
# cannot move them underneath the pipeline.
VIEW_TRANSFORM = "AgX"


# --------------------------------------------------------------------------
# PNG rewrite
# --------------------------------------------------------------------------

def _png_chunks(blob: bytes):
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    offset = 8
    while offset < len(blob):
        (length,) = struct.unpack(">I", blob[offset:offset + 4])
        kind = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + length]
        yield kind, data
        offset += 12 + length


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def _unfilter(raw: bytes, width: int, height: int) -> bytearray:
    """Undo PNG per-row filtering into a flat RGBA8 buffer.

    Only RGBA/8-bit/non-interlaced is accepted, which is exactly what
    `pipeline_common.apply_deterministic_render_settings` pins, and the caller
    asserts that before getting here.
    """
    stride = width * 4
    out = bytearray(stride * height)
    previous = bytearray(stride)
    position = 0
    for row in range(height):
        filter_type = raw[position]
        position += 1
        line = bytearray(raw[position:position + stride])
        position += stride
        if filter_type == 1:
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                upper_left = previous[i - 4] if i >= 4 else 0
                estimate = left + previous[i] - upper_left
                distance_left = abs(estimate - left)
                distance_up = abs(estimate - previous[i])
                distance_diagonal = abs(estimate - upper_left)
                if distance_left <= distance_up and distance_left <= distance_diagonal:
                    predictor = left
                elif distance_up <= distance_diagonal:
                    predictor = previous[i]
                else:
                    predictor = upper_left
                line[i] = (line[i] + predictor) & 0xFF
        elif filter_type != 0:
            raise ValueError(f"unsupported PNG filter type {filter_type}")
        out[row * stride:(row + 1) * stride] = line
        previous = line
    return out


def _flip_and_rewrite_png(path: Path) -> bytes:
    """Reverse the row order of a rendered PNG and re-emit it without metadata.

    Returns the flat RGBA8 pixel buffer, top row first, so the caller can
    measure the silhouette without decoding the file a second time.
    """
    blob = path.read_bytes()
    header = None
    idat = bytearray()
    passthrough: list[tuple[bytes, bytes]] = []
    for kind, data in _png_chunks(blob):
        if kind == b"IHDR":
            header = data
        elif kind == b"IDAT":
            idat += data
        elif kind in (b"sRGB", b"gAMA", b"cHRM", b"iCCP"):
            passthrough.append((kind, data))
    if header is None:
        raise ValueError(f"{path}: no IHDR")
    width, height, depth, colour_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", header)
    if (depth, colour_type, interlace) != (8, 6, 0):
        raise ValueError(f"{path}: expected 8-bit RGBA non-interlaced, got depth {depth} colour type {colour_type} interlace {interlace}")
    if (compression, filter_method) != (0, 0):
        raise ValueError(f"{path}: unexpected compression {compression} / filter method {filter_method}")

    pixels = _unfilter(zlib.decompress(bytes(idat)), width, height)
    stride = width * 4
    flipped = bytearray()
    for row in range(height - 1, -1, -1):
        flipped += b"\x00"
        flipped += pixels[row * stride:(row + 1) * stride]

    body = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header)
    for kind, data in passthrough:
        body += _chunk(kind, data)
    body += _chunk(b"IDAT", zlib.compress(bytes(flipped), 9))
    body += _chunk(b"IEND", b"")
    path.write_bytes(body)

    upright = bytearray()
    for row in range(height - 1, -1, -1):
        upright += pixels[row * stride:(row + 1) * stride]
    return bytes(upright)


def _opaque_bounds(pixels: bytes, width: int, height: int) -> dict | None:
    """The bounding box of everything with any alpha at all, in image pixels."""
    min_x, min_y, max_x, max_y = width, height, -1, -1
    opaque = 0
    for y in range(height):
        row = y * width * 4
        for x in range(width):
            if pixels[row + x * 4 + 3]:
                opaque += 1
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < 0:
        return None
    return {"x": min_x, "y": min_y, "width": max_x - min_x + 1, "height": max_y - min_y + 1, "opaquePixels": opaque}


# --------------------------------------------------------------------------
# Scene construction
# --------------------------------------------------------------------------

def _sun(name: str, spec: dict) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="SUN")
    data.energy = spec["energy"]
    data.angle = radians(spec["angle_deg"])
    item = bpy.data.objects.new(name, data)
    # A sun at rotation zero shines straight down. Tilt it away from vertical by
    # (90 - elevation) and swing it round to the azimuth; only the direction is
    # used, so the location is irrelevant and stays at the origin.
    item.rotation_euler = (radians(90.0 - spec["elevation_deg"]), 0.0, radians(spec["azimuth_deg"]))
    bpy.context.scene.collection.objects.link(item)
    return item


def _world() -> None:
    world = bpy.data.worlds.new("Lockstate environment render")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("world node tree has no Background node")
    background.inputs["Color"].default_value = WORLD_COLOUR
    background.inputs["Strength"].default_value = WORLD_STRENGTH
    bpy.context.scene.world = world


def _camera() -> bpy.types.Object:
    data = bpy.data.cameras.new("EnvironmentTopDown")
    data.type = "ORTHO"
    # HORIZONTAL fit makes `ortho_scale` the frame's world width whatever the
    # resolution, so the vertical extent follows the pixel aspect exactly.
    data.sensor_fit = "HORIZONTAL"
    item = bpy.data.objects.new("EnvironmentTopDown", data)
    item.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.scene.collection.objects.link(item)
    bpy.context.scene.camera = item
    return item


def _prepare_scene(scene: bpy.types.Scene) -> bpy.types.Object:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.filter_size = 1.5
    scene.frame_set(1)
    scene.eevee.taa_render_samples = EEVEE_RENDER_SAMPLES
    scene.eevee.use_shadows = True
    scene.eevee.use_raytracing = False
    scene.eevee.use_fast_gi = False
    scene.view_settings.view_transform = VIEW_TRANSFORM
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    pipeline_common.apply_deterministic_render_settings(scene)
    _world()
    _sun("Key", KEY_SUN)
    _sun("Fill", FILL_SUN)
    return _camera()


def _isolate(view_layer: bpy.types.ViewLayer, asset_id: str) -> None:
    for child in view_layer.layer_collection.children:
        child.exclude = child.name != asset_id


def _evaluated_bounds(collection: bpy.types.Collection) -> tuple[Vector, Vector]:
    """World-space bounds of the collection's meshes with modifiers applied.

    `Object.bound_box` is the *unevaluated* cage, so it misses the 0.03 bevel
    every box in the catalogue carries. Evaluating through the depsgraph is what
    makes "nothing is clipped" a fact rather than a hope.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for item in collection.objects:
        if item.type != "MESH":
            continue
        evaluated = item.evaluated_get(depsgraph)
        for corner in evaluated.bound_box:
            point = evaluated.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    if low.x == math.inf:
        raise RuntimeError(f"{collection.name} has no mesh to render")
    return low, high


def _pixel_size(footprint: tuple[float, float]) -> tuple[int, int]:
    numerator_x = round(footprint[0] * FOOTPRINT_DENOMINATOR)
    numerator_y = round(footprint[1] * FOOTPRINT_DENOMINATOR)
    if abs(numerator_x / FOOTPRINT_DENOMINATOR - footprint[0]) > 1e-9 or abs(numerator_y / FOOTPRINT_DENOMINATOR - footprint[1]) > 1e-9:
        raise ValueError(f"footprint {footprint} is not a multiple of 1/{FOOTPRINT_DENOMINATOR} of a tile")
    divisor = gcd(numerator_x, numerator_y)
    ratio_x, ratio_y = numerator_x // divisor, numerator_y // divisor
    longest_tiles = max(footprint)
    multiplier = max(1, round(PIXELS_PER_TILE * longest_tiles / max(ratio_x, ratio_y)))
    return ratio_x * multiplier, ratio_y * multiplier


def _frame(footprint: tuple[float, float], origin: Vector, low: Vector, high: Vector) -> tuple[float, float]:
    """The frame's world width and height, in tiles, at the footprint's aspect."""
    grown = 1.0 + 2.0 * MARGIN_FRACTION
    half_x = max(abs(high.x - origin.x), abs(origin.x - low.x))
    half_y = max(abs(high.y - origin.y), abs(origin.y - low.y))
    needed_x = max(footprint[0], 2.0 * half_x) * grown
    needed_y = max(footprint[1], 2.0 * half_y) * grown
    scale = max(needed_x / footprint[0], needed_y / footprint[1])
    return footprint[0] * scale, footprint[1] * scale


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def cli_arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=DEFAULT_OUTPUT, type=Path)
    parser.add_argument("--only", default="", help="comma-separated asset ids; default is every collection")
    parser.add_argument("--pixels-per-tile", default=PIXELS_PER_TILE, type=int)
    return parser.parse_args(sys.argv[separator + 1:])


def main() -> None:
    pipeline_common.require_blender_version()
    args = cli_arguments()
    global PIXELS_PER_TILE
    PIXELS_PER_TILE = args.pixels_per_tile
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    camera = _prepare_scene(scene)

    wanted = [name for name in args.only.split(",") if name] or None
    entries = []
    for collection in sorted(bpy.data.collections, key=lambda item: item.name):
        asset_id = collection.get("assetId")
        if asset_id is None:
            continue
        if wanted is not None and asset_id not in wanted:
            continue
        footprint_property = collection.get("footprintTiles")
        if footprint_property is None:
            raise RuntimeError(f"{asset_id} declares no footprintTiles")
        footprint = (float(footprint_property[0]), float(footprint_property[1]))

        _isolate(view_layer, collection.name)
        bpy.context.view_layer.update()
        origin_object = bpy.data.objects.get(f"{asset_id}.origin")
        if origin_object is None:
            raise RuntimeError(f"{asset_id} has no origin empty")
        origin = origin_object.matrix_world.translation
        low, high = _evaluated_bounds(collection)

        frame_width, frame_height = _frame(footprint, origin, low, high)
        resolution_x, resolution_y = _pixel_size(footprint)
        scene.render.resolution_x, scene.render.resolution_y = resolution_x, resolution_y
        camera.data.ortho_scale = frame_width
        camera.location = (origin.x, origin.y, high.z + 10.0)
        camera.data.clip_start = 1.0
        camera.data.clip_end = (high.z + 10.0) - low.z + 10.0

        destination = output / f"{asset_id}.png"
        scene.render.filepath = str(destination)
        bpy.ops.render.render(write_still=True)
        pixels = _flip_and_rewrite_png(destination)
        silhouette = _opaque_bounds(pixels, resolution_x, resolution_y)

        aspect_drift = abs((resolution_x / resolution_y) - (footprint[0] / footprint[1])) / (footprint[0] / footprint[1])
        entries.append({
            "assetId": asset_id,
            "image": destination.name,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "pixelSha256": hashlib.sha256(pixels).hexdigest(),
            "footprintTiles": {"width": footprint[0], "height": footprint[1]},
            "frameTiles": {"width": round(frame_width, 6), "height": round(frame_height, 6)},
            "overhangsFootprint": frame_width > footprint[0] * (1.0 + 2.0 * MARGIN_FRACTION) + 1e-6,
            "sizePx": {"width": resolution_x, "height": resolution_y},
            "frameAspectDriftFromFootprint": round(aspect_drift, 9),
            "opaqueBoundsPx": silhouette,
        })
        print(f"rendered {asset_id}: {resolution_x}x{resolution_y}, frame {frame_width:.4f}x{frame_height:.4f} tiles", flush=True)

    pipeline_common.write_text(output / "environment-objects.render.json", json.dumps({
        "schemaVersion": SCHEMA_VERSION,
        "producedBy": "tooling/blender/render-environment-objects.py",
        "catalog": "assets/source/blender/environment.mvp.catalog.blend",
        "blenderVersion": pipeline_common.version_text(tuple(bpy.app.version)),
        "projection": "orthographic, straight down (-Z); image row 0 is world -Y (north), column 0 is world -X (west)",
        "pixelsPerTile": PIXELS_PER_TILE,
        "marginFraction": MARGIN_FRACTION,
        "viewTransform": scene.view_settings.view_transform,
        "eeveeRenderSamples": EEVEE_RENDER_SAMPLES,
        "entries": entries,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
