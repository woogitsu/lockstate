"""Compose twelve SHA-checked views of the outdoor bench variant."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "public/game-content/oblique-furniture.yard-steel-bench.v1.json"
OUTPUT = ROOT / "docs/research/2026-10-02-yard-steel-bench/poses.png"
YAW = (0, 90, 180, 270)
ELEVATION = (20, 40, 70)


def main() -> None:
    catalog = json.loads(MANIFEST.read_text(encoding="utf-8"))
    frames = {(frame["yawDegrees"], frame["elevationDegrees"]): frame for frame in catalog["frames"]}
    if len(frames) != 72:
        raise ValueError("Expected the complete 72-pose catalog")
    sheet = Image.new("RGB", (960, 610), "#edf2f4")
    draw = ImageDraw.Draw(sheet)
    for row, elevation in enumerate(ELEVATION):
        for column, yaw in enumerate(YAW):
            frame = frames[(yaw, elevation)]
            path = ROOT / "public" / frame["image"].lstrip("/")
            if hashlib.sha256(path.read_bytes()).hexdigest() != frame["sha256"]:
                raise ValueError(f"Frame digest mismatch: {path}")
            sprite = Image.open(path).convert("RGBA")
            bounds = sprite.getchannel("A").getbbox()
            if bounds is None or not (0 < bounds[0] < bounds[2] < 256 and 0 < bounds[1] < bounds[3] < 256):
                raise ValueError(f"Clipped or empty source frame: {path}")
            x, y = column * 240, row * 200
            preview = sprite.resize((178, 178), Image.Resampling.LANCZOS)
            sheet.paste(preview, (x + 31, y + 18), preview)
            draw.text((x + 15, y + 4), f"yaw {yaw}  elevation {elevation}", fill="#153644")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT)
    print(f"twelve SHA-checked views: {OUTPUT}")


if __name__ == "__main__":
    main()
