"""Emit a canonical fingerprint of the open .blend's renderable scene state.

A `.blend` file is not byte-comparable: it embeds absolute paths, pointer
addresses and a save timestamp, so two identical scenes hash differently. That
made scene-construction nondeterminism invisible until it surfaced as shifted
pixels three steps later.

This writes the state that a render can actually depend on -- object graph,
transforms, mesh topology *in array order*, modifiers, materials, animation
keyframes, lights, camera and the render settings -- as sorted, rounded JSON.
Two runs of `create-prisoner-base.py` must produce the same document.

Mesh arrays are deliberately emitted in their stored order rather than sorted.
Order is the whole point: `bpy.ops.mesh.primitive_uv_sphere_add` produced an
identical face *set* in a different order on every call, and that alone changed
rendered pixels (issue #64).

Run with:
    blender -b scene.blend --background --factory-startup \\
        --python scene-fingerprint.py -- --output fingerprint.json
"""
import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

# Coordinates are rounded before hashing. Blender stores single-precision
# floats, so the last bit or two of a printed double carries no information and
# would only add noise to a comparison.
PRECISION = 6


def rounded(values):
    return [round(float(value), PRECISION) for value in values]


def mesh_fingerprint(mesh):
    return {
        "vertices": [rounded(vertex.co) for vertex in mesh.vertices],
        "edges": [list(edge.vertices) for edge in mesh.edges],
        "polygons": [list(polygon.vertices) for polygon in mesh.polygons],
        "loops": [loop.vertex_index for loop in mesh.loops],
        "polygonNormals": [rounded(polygon.normal) for polygon in mesh.polygons],
        "materials": [material.name if material else None for material in mesh.materials],
    }


def action_fcurves(action):
    """Collect an action's F-curves across both Blender action layouts.

    Blender 4.4 introduced slotted actions and dropped the flat `Action.fcurves`
    collection, so the curves now live under layers -> strips -> channelbags.
    Both shapes are handled rather than assuming one, because this file's whole
    job is to survive a toolchain change loudly instead of silently.
    """
    curves = list(getattr(action, "fcurves", None) or [])
    if curves:
        return curves
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def animation_fingerprint(item):
    action = getattr(item.animation_data, "action", None) if item.animation_data else None
    if action is None:
        return None
    curves = []
    for curve in action_fcurves(action):
        curves.append({
            "dataPath": curve.data_path,
            "index": curve.array_index,
            "keyframes": [rounded((point.co.x, point.co.y)) for point in curve.keyframe_points],
        })
    curves.sort(key=lambda curve: (curve["dataPath"], curve["index"]))
    return {"name": action.name, "curves": curves}


def object_fingerprint(item):
    entry = {
        "name": item.name,
        "type": item.type,
        "parent": item.parent.name if item.parent else None,
        "matrixLocal": [rounded(row) for row in item.matrix_local],
        "matrixParentInverse": [rounded(row) for row in item.matrix_parent_inverse],
        "modifiers": [
            {"name": modifier.name, "type": modifier.type,
             "width": round(getattr(modifier, "width", 0.0), PRECISION),
             "segments": getattr(modifier, "segments", None)}
            for modifier in item.modifiers
        ],
        "animation": animation_fingerprint(item),
    }
    if item.type == "MESH":
        entry["mesh"] = mesh_fingerprint(item.data)
    elif item.type == "LIGHT":
        entry["light"] = {"type": item.data.type, "energy": round(item.data.energy, PRECISION),
                          "size": round(item.data.size, PRECISION), "shape": item.data.shape}
    elif item.type == "CAMERA":
        entry["camera"] = {"type": item.data.type, "orthoScale": round(item.data.ortho_scale, PRECISION),
                           "lens": round(item.data.lens, PRECISION)}
    return entry


def material_fingerprint(material):
    entry = {"name": material.name, "diffuseColor": rounded(material.diffuse_color),
             "roughness": round(material.roughness, PRECISION), "inputs": {}}
    node_tree = material.node_tree
    principled = node_tree.nodes.get("Principled BSDF") if node_tree else None
    if principled is not None:
        for socket in ("Base Color", "Roughness"):
            value = principled.inputs[socket].default_value
            entry["inputs"][socket] = rounded(value) if hasattr(value, "__len__") else round(float(value), PRECISION)
    return entry


def render_fingerprint(scene):
    render = scene.render
    image_settings = render.image_settings
    return {
        "engine": render.engine,
        "resolution": [render.resolution_x, render.resolution_y, render.resolution_percentage],
        "frameRange": [scene.frame_start, scene.frame_end],
        "camera": scene.camera.name if scene.camera else None,
        "ditherIntensity": round(render.dither_intensity, PRECISION),
        "filmTransparent": render.film_transparent,
        "imageSettings": {
            "fileFormat": image_settings.file_format,
            "colorMode": image_settings.color_mode,
            "colorDepth": image_settings.color_depth,
            "compression": image_settings.compression,
        },
    }


def main():
    pipeline_common.require_blender_version()
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args(sys.argv[separator + 1:])

    scene = bpy.context.scene
    document = {
        "schemaVersion": 1,
        "kind": "lockstate.blender-scene-fingerprint",
        "blenderVersion": list(bpy.app.version),
        "render": render_fingerprint(scene),
        "objects": [object_fingerprint(item) for item in sorted(bpy.data.objects, key=lambda item: item.name)],
        "materials": [material_fingerprint(item) for item in sorted(bpy.data.materials, key=lambda item: item.name)],
    }
    options.output.parent.mkdir(parents=True, exist_ok=True)
    pipeline_common.write_text(options.output, json.dumps(document, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
