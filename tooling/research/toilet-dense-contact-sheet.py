"""Show twelve verified toilet poses, enlarged only for inspection."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "public/game-content/oblique-cell-toilet.v1.json"
OUTPUT = ROOT / "docs/research/2026-10-02-toilet-dense-alignment/poses.png"
YAW = (-165, -75, 15, 105)
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
            if bounds is None or not (0 < bounds[0] < bounds[2] < 512 and 0 < bounds[1] < bounds[3] < 512):
                raise ValueError(f"Clipped or empty frame: {path}")
            left = max(0, bounds[0] - 16)
            top = max(0, bounds[1] - 16)
            right = min(512, bounds[2] + 16)
            bottom = min(512, bounds[3] + 16)
            cropped = sprite.crop((left, top, right, bottom))
            scale = min(170 / cropped.width, 155 / cropped.height)
            enlarged = cropped.resize((round(cropped.width * scale), round(cropped.height * scale)), Image.Resampling.LANCZOS)
            x, y = column * 240, row * 200
            sheet.paste(enlarged, (x + (240 - enlarged.width) // 2, y + 22 + (155 - enlarged.height) // 2), enlarged)
            draw.text((x + 18, y + 5), f"yaw {yaw} / elev {elevation}", fill="#153644")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT)
    print(f"twelve SHA-checked enlarged views: {OUTPUT}")


if __name__ == "__main__":
    main()
