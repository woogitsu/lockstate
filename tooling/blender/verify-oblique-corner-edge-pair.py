"""Check that both source corner variants can cover two whole runtime edges."""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

SOURCE = Path(__file__).resolve().parents[2] / "assets/source/blender/wall.interior.cutaway.blend"


def reach(collection, axis: str) -> float:
    return max(getattr(vertex.co, axis) for item in collection.all_objects
               if item.type == "MESH" for vertex in item.data.vertices)


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    baseline_only = "--baseline-only" in sys.argv
    for variant in ("full", "cutaway"):
        collection = bpy.data.collections[f"wall.interior.corner.inner.{variant}"]
        source_reach = (reach(collection, "x"), reach(collection, "y"))
        if source_reach != (0.5, 0.5):
            raise RuntimeError(f"Unexpected {variant} source reach: {source_reach}")
        if not baseline_only:
            pipeline_common.extend_inner_corner_to_edge_pair(collection)
        edge_reach = (reach(collection, "x"), reach(collection, "y"))
        if any(abs(value - 1.0) > 1e-6 for value in edge_reach):
            raise RuntimeError(f"{variant} leaves a runtime half-edge gap: {edge_reach}")
        print(f"{variant}: source={source_reach}, runtime={edge_reach}")


if __name__ == "__main__":
    main()
