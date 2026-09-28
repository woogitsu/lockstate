"""Render a Blender character into the Lockstate eight-direction frame contract.

Run with: blender -b source.blend --python this-file -- --asset-id actor.prisoner.base --output assets/intermediate/actor.prisoner.base
The current scene camera, world and animation actions are source-controlled in
the .blend. This script only rotates the authored SpriteRoot and writes PNG frames.

Determinism-critical behaviour lives in `pipeline_common`; see that module for
what issue #64 measured and why each control exists. Note that the individual
frames this writes are *not* byte-stable and must never be hashed as pipeline
outputs: Blender embeds `Date`, `RenderTime` and the absolute source `.blend`
path into every PNG as `tEXt` chunks. The packed atlas and the manifest are the
reproducible artefacts.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

DIRECTIONS = ("south", "southWest", "west", "northWest", "north", "northEast", "east", "southEast")
CLIPS = {"idle": (1, 1), "walk": (8, 10)}
RESPONSE_CLIPS = {"idle": (1, 1), "respond": (4, 6)}
FRAME_SIZE = (256, 384)
FOOT_PIVOT = (128, 352)


def cli_arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-frame-start", default=1, type=int)
    parser.add_argument("--target", default="SpriteTarget")
    parser.add_argument("--root", default="SpriteRoot")
    return parser.parse_args(sys.argv[separator + 1:])


def main():
    pipeline_common.require_blender_version()
    args = cli_arguments()
    if not args.output.is_absolute():
        args.output = Path(__file__).resolve().parents[2] / args.output
    if not args.asset_id.replace(".", "").replace("-", "").isalnum() or not args.asset_id[0].islower():
        raise ValueError("asset-id must be lower-case dot/dash-separated identifier")
    scene = bpy.context.scene
    clips = RESPONSE_CLIPS if args.asset_id == "actor.guard.response" else CLIPS
    target = bpy.data.objects.get(args.target)
    if target is None:
        raise ValueError(f"target '{args.target}' was not found")
    root = bpy.data.objects.get(args.root)
    if root is None:
        raise ValueError(f"root '{args.root}' was not found")
    original_rotation = root.rotation_euler.copy()
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = FRAME_SIZE
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    args.output.mkdir(parents=True, exist_ok=True)
    for direction_index, direction in enumerate(DIRECTIONS):
        root.rotation_euler.z = original_rotation.z + math.radians(direction_index * 45)
        for clip, (count, _fps) in clips.items():
            for frame in range(count):
                scene.frame_set(args.source_frame_start + frame)
                destination = args.output / args.asset_id / clip / direction / f"{frame:03}.png"
                destination.parent.mkdir(parents=True, exist_ok=True)
                scene.render.filepath = str(destination)
                bpy.ops.render.render(write_still=True)
    root.rotation_euler = original_rotation
    pipeline_common.write_text(args.output / args.asset_id / "render-contract.json", json.dumps({
        "schemaVersion": 1, "assetId": args.asset_id, "frame": {"widthPx": 256, "heightPx": 384, "footPivotPx": {"x": FOOT_PIVOT[0], "y": FOOT_PIVOT[1]}},
        "directions": list(DIRECTIONS), "clips": {name: {"framesPerDirection": count, "fps": fps} for name, (count, fps) in clips.items()}
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
