"""Build an eight-case guard facing study from already published Blender frames.

Requires Pillow. No Blender source or rendered frame is modified. The output is
research evidence for a future renderer consumer, not another actor catalog.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "public/game-content/oblique-actor-guard.v1.json"
OUTPUT = ROOT / "docs/research/2026-10-02-oblique-actor-facing/guard-facing-contact-sheet.png"
HEADINGS = (
    ("South", 0, 1),
    ("East", 1, 0),
    ("North", 0, -1),
    ("West", -1, 0),
)
CAMERA_YAWS = (0, 90)
ELEVATION = 45


def wrap_yaw(angle: float) -> int:
    """Canonical 24-pose manifest interval [-180, 180)."""
    return int((angle + 180) % 360 - 180)


def frame_yaw(camera_yaw: int, delta_x: int, delta_y: int) -> int:
    """Image yaw = camera yaw minus movement heading from world south.

    The world has +x east and +y south. The Blender actor's unrotated front
    is toward local -Y; its existing oblique catalog shows front at yaw 0,
    back at -180, and the two sides at ±90. The screen projection determines
    which side must be chosen as the camera turns.
    """
    if delta_x == 0 and delta_y == 0:
        raise ValueError("a stationary actor needs its retained facing")
    heading_from_south = math.degrees(math.atan2(delta_x, delta_y))
    return wrap_yaw(camera_yaw - heading_from_south)


def font(size: int):
    for path in (Path("C:/Windows/Fonts/segoeui.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main() -> None:
    catalog = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert catalog["assetId"] == "actor.guard.base"
    assert catalog["pivotPx"] == [256, 256]
    assert len(catalog["frames"]) == 72
    frames = {(frame["yawDegrees"], frame["elevationDegrees"]): frame for frame in catalog["frames"]}
    # Two independent front/back pairs prove that both the actor heading and
    # camera rotation take part. Selecting camera yaw alone fails this matrix.
    assert frame_yaw(0, 0, 1) == 0 and frame_yaw(0, 0, -1) == -180
    assert frame_yaw(90, 1, 0) == 0 and frame_yaw(90, -1, 0) == -180
    assert frame_yaw(0, 1, 0) == -90 and frame_yaw(90, 0, 1) == 90

    width, height = 1540, 850
    card_width, card_height = 350, 365
    image = Image.new("RGB", (width, height), "#f0f3f5")
    draw = ImageDraw.Draw(image)
    title_font, label_font, small_font = font(28), font(19), font(15)
    draw.text((32, 20), "Guard facing: four movement headings × two camera yaws", fill="#1b2f3c", font=title_font)
    draw.text((32, 60), "Existing 72-pose Blender frames · elevation 45° · 512 px, pivot (256,256)", fill="#49616d", font=small_font)
    for row, camera_yaw in enumerate(CAMERA_YAWS):
        top = 90 + row * (card_height + 13)
        draw.text((25, top + 12), f"Camera\nyaw {camera_yaw}°", fill="#1b5165", font=label_font, spacing=5)
        for column, (name, dx, dy) in enumerate(HEADINGS):
            left = 90 + column * (card_width + 10)
            yaw = frame_yaw(camera_yaw, dx, dy)
            frame = frames[(yaw, ELEVATION)]
            path = ROOT / "public" / frame["image"].lstrip("/")
            blob = path.read_bytes()
            assert hashlib.sha256(blob).hexdigest() == frame["sha256"], path
            sprite = Image.open(path).convert("RGBA")
            # The exact same local rectangle is used in every card. Its centre
            # contains the authored foot pivot; no case gets recentered.
            sprite = sprite.crop((196, 126, 316, 286)).resize((228, 304), Image.Resampling.NEAREST)
            draw.rounded_rectangle((left, top, left + card_width, top + card_height), radius=10,
                                   fill="#ffffff", outline="#c5d2d8", width=2)
            draw.text((left + 15, top + 13), f"{name}  ({dx:+d},{dy:+d})", fill="#1b2f3c", font=label_font)
            image.paste(sprite, (left + (card_width - sprite.width) // 2, top + 44), sprite)
            appearance = "front" if yaw == 0 else "back" if yaw == -180 else "side"
            draw.text((left + 15, top + card_height - 29),
                      f"catalog yaw {yaw:+d}° · {appearance}", fill="#375b69", font=small_font)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT)
    print(f"contact sheet: {OUTPUT}")
    for camera_yaw in CAMERA_YAWS:
        print(f"camera {camera_yaw}°: " + ", ".join(
            f"{name.lower()}→{frame_yaw(camera_yaw, dx, dy):+d}°" for name, dx, dy in HEADINGS))


if __name__ == "__main__":
    main()
