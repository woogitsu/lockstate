"""Merge the isolated Canteen render into the shared overhead art sidecar."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET_ID = "floor.canteen.terrazzo"
SOURCE = "assets/source/blender/floor.canteen.warm-terrazzo.blend"
STAGING = ROOT / "assets/rendered/canteen-floor-staging"
PUBLISHED = ROOT / "assets/rendered/environment"
SIDECAR = PUBLISHED / "environment-objects.render.json"


def main() -> None:
    staged = json.loads((STAGING / "environment-objects.render.json").read_text(encoding="utf-8"))
    if len(staged["entries"]) != 1 or staged["entries"][0]["assetId"] != ASSET_ID:
        raise RuntimeError("Expected exactly the isolated Canteen floor render")
    shared = json.loads(SIDECAR.read_text(encoding="utf-8"))
    index = next((i for i, entry in enumerate(shared["entries"])
                  if entry["assetId"] == ASSET_ID), None)
    if index is None:
        raise RuntimeError(f"Shared sidecar lacks {ASSET_ID}")
    entry = staged["entries"][0]
    entry["sourceCatalog"] = SOURCE
    shutil.copyfile(STAGING / entry["image"], PUBLISHED / entry["image"])
    shared["entries"][index] = entry
    SIDECAR.write_text(json.dumps(shared, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
