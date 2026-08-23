"""Pack Blender directional frame PNGs into deterministic per-clip atlas files."""
import argparse
import json
import sys
from pathlib import Path

import bpy


def args():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(sys.argv[separator + 1:])


def copy_frame(destination_pixels, atlas_width, source, x, y, width, height, extrude):
    """Copy a frame and duplicate its edge pixels into the atlas gutter."""
    source_pixels = source.pixels[:]
    for row in range(-extrude, height + extrude):
        source_row = min(max(row, 0), height - 1)
        source_offset = source_row * width * 4
        line = source_pixels[source_offset:source_offset + width * 4]
        padded_line = line[:4] * extrude + line + line[-4:] * extrude
        destination_offset = ((y + row) * atlas_width + x - extrude) * 4
        destination_pixels[destination_offset:destination_offset + len(padded_line)] = padded_line


def main():
    options = args()
    root = Path(__file__).resolve().parents[2]
    if not options.input.is_absolute():
        options.input = root / options.input
    if not options.contract.is_absolute():
        options.contract = root / options.contract
    if not options.output.is_absolute():
        options.output = root / options.output
    contract = json.loads(options.contract.read_text(encoding="utf-8"))
    asset_dirs = [path for path in options.input.iterdir() if path.is_dir()]
    if len(asset_dirs) != 1:
        raise ValueError("input must contain exactly one asset-id directory")
    asset_dir = asset_dirs[0]
    render_contract = json.loads((asset_dir / "render-contract.json").read_text(encoding="utf-8"))
    if render_contract["assetId"] != asset_dir.name:
        raise ValueError("asset directory and render contract assetId differ")
    directions = contract["coordinateSystem"]["clockwiseDirectionOrder"]
    frame = contract["frame"]
    width, height = frame["widthPx"], frame["heightPx"]
    extrude = contract["atlas"]["extrudePx"]
    stride_x, stride_y = width + extrude * 2, height + extrude * 2
    options.output.mkdir(parents=True, exist_ok=True)
    manifests = []
    for clip_name, clip in contract["clips"].items():
        frame_count = clip["framesPerDirection"]
        atlas_width, atlas_height = stride_x * frame_count, stride_y * len(directions)
        if max(atlas_width, atlas_height) > contract["atlas"]["maxDimensionPx"]:
            raise ValueError(f"{clip_name} atlas exceeds maxDimensionPx")
        atlas = bpy.data.images.new(f"{asset_dir.name}.{clip_name}", atlas_width, atlas_height, alpha=True, float_buffer=False)
        atlas_pixels = [0.0] * (atlas_width * atlas_height * 4)
        frames = {}
        for direction_index, direction in enumerate(directions):
            direction_frames = []
            for index in range(frame_count):
                source_path = asset_dir / clip_name / direction / f"{index:03}.png"
                if not source_path.is_file():
                    raise ValueError(f"missing rendered frame: {source_path}")
                source = bpy.data.images.load(str(source_path), check_existing=False)
                if tuple(source.size) != (width, height):
                    raise ValueError(f"wrong frame size for {source_path}: {tuple(source.size)}")
                # Blender image pixels start at the lower-left. Runtime atlas
                # coordinates use the conventional upper-left image origin.
                x = index * stride_x + extrude
                pixel_y = (len(directions) - 1 - direction_index) * stride_y + extrude
                manifest_y = direction_index * stride_y + extrude
                copy_frame(atlas_pixels, atlas_width, source, x, pixel_y, width, height, extrude)
                bpy.data.images.remove(source)
                direction_frames.append({"x": x, "y": manifest_y, "width": width, "height": height})
            frames[direction] = direction_frames
        atlas.pixels = atlas_pixels
        image_name = f"{asset_dir.name}.{clip_name}.png"
        atlas.filepath_raw = str(options.output / image_name)
        atlas.file_format = "PNG"
        atlas.save()
        manifests.append({"schemaVersion": 1, "assetId": asset_dir.name, "image": image_name, "widthPx": atlas_width, "heightPx": atlas_height, "frame": {"widthPx": width, "heightPx": height, "footPivotPx": frame["footPivotPx"], "extrudePx": extrude}, "directions": directions, "clips": {clip_name: {"fps": clip["fps"], "loop": clip["loop"], "frames": frames}}})
        bpy.data.images.remove(atlas)
    (options.output / f"{asset_dir.name}.atlas-manifests.json").write_text(json.dumps(manifests, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
