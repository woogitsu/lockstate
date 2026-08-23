"""Shared determinism controls for the Lockstate Blender pipeline (issue #32).

Issue #32 asks for a "deterministic generation/hash test on representative
fixture". Issue #64 measured why that could not be met: two independent runs of
the same commit, on the same machine and the same Blender, produced different
walk atlases. Four causes were isolated, and this module is where three of them
are fixed once for every script in `tooling/blender/`:

1. `bpy.ops.mesh.primitive_uv_sphere_add` returns identical vertex coordinates
   and an identical face *set*, but a different face and loop *order* on every
   call. Rendering re-ordered geometry shifts a handful of silhouette pixels.
   `uv_sphere_mesh()` below builds the same sphere with an explicit, stable
   order instead. See its docstring for why an icosphere is not a fix.
2. `scene.render.dither_intensity` defaults to 1.0 and the pipeline never set
   it, which perturbs roughly one pixel in six by a single 8-bit step.
   `apply_deterministic_render_settings()` sets it to 0 along with the other
   byte-visible encode settings.
3. `pathlib.Path.write_text` applies platform newline translation, so the same
   document is larger on Windows than on Linux. `write_text()` below pins LF.
4. No Blender version was pinned or asserted anywhere, so a mismatched
   toolchain silently produced different pixels. `require_blender_version()`
   makes that failure loud.

Blender does not put a `--python` script's own directory on `sys.path`, so each
script bootstraps this module with:

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import pipeline_common
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

# The committed runtime atlases under `public/assets/actors/` were authored with
# Blender 5.2 on Windows; their `.blend` headers record `v0502`. That is the
# version this pipeline is pinned to, because it is the version that produced
# the art in the repository.
#
# Honest caveat: the determinism evidence recorded in `docs/ART_PIPELINE.md` was
# gathered under Blender 5.0.1 on Linux with software GL, because 5.2 was not
# available in that environment. Run-to-run determinism is a property of one
# version and was verified there; cross-version byte-equality is not claimed and
# is not achievable while the pin and the measuring toolchain differ.
SUPPORTED_BLENDER_VERSION = (5, 2)

# Set to "1" to downgrade the version assertion to a warning. Intended for
# deliberate investigation on another Blender build -- never for producing art
# that will be committed.
VERSION_OVERRIDE_ENV = "LOCKSTATE_ALLOW_BLENDER_MISMATCH"


def version_text(version: tuple[int, ...]) -> str:
    return ".".join(str(part) for part in version)


def require_blender_version() -> None:
    """Fail loudly when the running Blender is not the pinned one.

    A mismatched toolchain does not fail on its own: it renders, it validates
    and it produces subtly different pixels. This turns that into an error at
    the top of every script instead.
    """
    actual = tuple(bpy.app.version)
    if actual[:2] == SUPPORTED_BLENDER_VERSION:
        return
    message = (
        f"Lockstate art pipeline is pinned to Blender "
        f"{version_text(SUPPORTED_BLENDER_VERSION)}.x but this is Blender "
        f"{version_text(actual)}. Renders from another version are not "
        f"byte-reproducible against the committed atlases. Install the pinned "
        f"version, or set {VERSION_OVERRIDE_ENV}=1 to proceed deliberately and "
        f"accept that the output must not be committed."
    )
    if os.environ.get(VERSION_OVERRIDE_ENV) == "1":
        print(f"WARNING: {message}", file=sys.stderr, flush=True)
        return
    print(f"ERROR: {message}", file=sys.stderr, flush=True)
    raise RuntimeError(message)


def apply_deterministic_render_settings(scene: bpy.types.Scene) -> None:
    """Pin every render setting that changes the encoded bytes of a frame.

    `dither_intensity` is the one that mattered: Blender defaults it to 1.0, and
    a controlled probe in issue #64 showed it perturbing 17.4% of pixels by
    exactly one 8-bit step. The rest are pinned because they are defaults that a
    user preference, a `.blend` and a future Blender version are all free to
    change underneath the pipeline, and each of them alters output bytes.
    """
    render = scene.render
    render.dither_intensity = 0.0
    render.film_transparent = True
    image_settings = render.image_settings
    image_settings.file_format = "PNG"
    image_settings.color_mode = "RGBA"
    image_settings.color_depth = "8"
    image_settings.compression = 15


def write_text(path: Path, text: str) -> None:
    """Write UTF-8 text with LF endings on every platform.

    `Path.write_text` opens in text mode, so on Windows every `\\n` becomes
    `\\r\\n`. That is why the committed 534-line atlas manifest is exactly 534
    bytes larger than the one this pipeline produces on Linux, and why the two
    cannot be compared by digest without a translation step.
    """
    path.write_text(text, encoding="utf-8", newline="\n")


def uv_sphere_mesh(
    name: str,
    radius: float = 1.0,
    segments: int = 24,
    ring_count: int = 12,
) -> bpy.types.Mesh:
    """Build a UV sphere with an explicit, run-stable topology order.

    `bpy.ops.mesh.primitive_uv_sphere_add` was measured over repeated calls in
    one Blender session: the vertex array is stable, but the polygon and loop
    arrays come out in a different order nearly every time. The rendered result
    is not identical, because rasterisation of a re-ordered mesh moves a few
    silhouette pixels.

    An icosphere is *not* an alternative: it is produced through the same BMesh
    path and carries the same instability. Building the mesh directly with
    `from_pydata` is the reliable route, because `from_pydata` writes the
    vertex, loop and polygon arrays in exactly the order it is given.

    Layout, chosen to be positionally identical to the operator it replaces:

    - index 0 is the north pole `(0, 0, radius)`;
    - then `ring_count - 1` latitude rings of `segments` vertices, ordered by
      ring (north to south) and within a ring by longitude;
    - the final index is the south pole.

    Longitude is measured from `+Y` towards `+X`, which is the convention
    `primitive_uv_sphere_add` uses, so the vertex *positions* are the same set
    the operator produced -- only their order, and the face order over them, is
    now fixed.
    """
    if segments < 3 or ring_count < 3:
        raise ValueError("a UV sphere needs at least 3 segments and 3 rings")

    latitudes = ring_count - 1
    vertices: list[tuple[float, float, float]] = [(0.0, 0.0, radius)]
    for ring in range(1, ring_count):
        polar = math.pi * ring / ring_count
        ring_radius = radius * math.sin(polar)
        height = radius * math.cos(polar)
        for segment in range(segments):
            azimuth = 2.0 * math.pi * segment / segments
            vertices.append((
                ring_radius * math.sin(azimuth),
                ring_radius * math.cos(azimuth),
                height,
            ))
    south_pole = len(vertices)
    vertices.append((0.0, 0.0, -radius))

    def ring_vertex(ring: int, segment: int) -> int:
        return 1 + (ring - 1) * segments + segment % segments

    # Winding is chosen so every polygon normal points away from the centre. It
    # is asserted below rather than trusted: an inverted sphere still renders,
    # just wrongly lit, which is exactly the kind of silent regression this
    # module exists to prevent.
    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        faces.append((0, ring_vertex(1, segment + 1), ring_vertex(1, segment)))
    for ring in range(1, latitudes):
        for segment in range(segments):
            faces.append((
                ring_vertex(ring, segment),
                ring_vertex(ring, segment + 1),
                ring_vertex(ring + 1, segment + 1),
                ring_vertex(ring + 1, segment),
            ))
    for segment in range(segments):
        faces.append((south_pole, ring_vertex(latitudes, segment), ring_vertex(latitudes, segment + 1)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        if polygon.normal.dot(polygon.center) <= 0.0:
            raise RuntimeError(f"{name}: polygon {polygon.index} is wound inwards")
    return mesh


def add_mesh_object(name: str, mesh: bpy.types.Mesh, location: tuple[float, float, float]) -> bpy.types.Object:
    """Link a mesh into the active collection without going through an operator.

    Operators depend on selection and context state; this does not.
    """
    item = bpy.data.objects.new(name, mesh)
    item.location = location
    bpy.context.collection.objects.link(item)
    return item
