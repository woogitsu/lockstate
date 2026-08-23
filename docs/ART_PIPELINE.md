# Art pipeline contract

Issue #32 establishes an offline, reproducible Blender-to-atlas pipeline. It is
intentionally outside the renderer and simulation: Blender source files and
intermediate frames are authoring inputs; only the final PNG plus JSON manifest
is a runtime dependency.

## Character directions

The character contract is versioned in
[`assets/contracts/character-8-direction.contract.json`](../assets/contracts/character-8-direction.contract.json).
It defines the only legal directional row order:

`south → southWest → west → northWest → north → northEast → east → southEast`

Directions describe intended world movement (`+x` east, `+y` south), rather than
a renderer-specific screen vector. Every character uses a 256×384 source frame
with its foot pivot at `(128, 352)`. Therefore a renderer anchors all roles to
the same world position without role-specific offsets.

The initial clips are `idle` (one frame at 1 fps) and `walk` (eight frames at
10 fps). New clips may be added by a schema-versioned contract revision; changing
direction order, pivot, frame dimensions or the meaning of an existing clip is a
breaking format change.

## Blender source scene

Each `.blend` source must contain:

- a camera named `Camera`, using the project’s fixed isometric framing;
- an empty or object named `SpriteTarget` at the actor foot position;
- a parent empty named `SpriteRoot`; the character's authored forward direction
  at rotation zero is `south`;
- timeline frames 1–8 for the walk cycle (the first frame is also idle);
- world lighting and the actor model/rig, with no opaque backdrop.

`export-directional-sprites.py` preserves the authored camera and rotates
`SpriteRoot` in the contract’s direction order. It does not build, retarget or
modify animation data. This preserves the fixed world lighting and camera used
at runtime, while visual artists keep ownership of the `.blend`.

## Generated output

The packer emits one PNG for each clip and a combined
`<asset-id>.atlas-manifests.json` to `public/assets/actors/`. Rows are directions
(top to bottom in contract order), columns are sequential animation frames. Each
frame has a two-pixel edge-extrusion gutter, preventing texture bleeding under
linear sampling. These final PNGs are versioned through Git LFS and deployed as
Cloudflare Static Assets.

The manifest follows
[`assets/contracts/runtime-atlas-manifest.schema.json`](../assets/contracts/runtime-atlas-manifest.schema.json).
Coordinates in it use a top-left origin even though Blender’s image buffer uses
a bottom-left origin; the packer converts between them explicitly.

`asset-registry.json` is generated alongside clip manifests. It maps a stable
asset ID to its manifest and clip names, so runtime code can discover content
without embedding a list of authored roles.

The supplied object sheets are built by `tooling/build-source-art-catalog.mjs`
into `public/game-content/source-art.v1.json`. Their immutable content-hashed
PNG filenames, SHA-256 digests, source rectangles, anchors and owner-supplied
attribution are recorded there. They remain a whole-sheet atlas until a later
reviewed extraction manifest selects individual variants.

## Intake status

The owner-generated PNG sheets remain source reference/intake material. They are
not treated as finished animated character frames: their role is to guide the
Blender model, lighting, materials and directional silhouette. A source `.blend`
per role is required before a production character atlas can be rendered.

## Reproducibility status

The committed runtime assets under `public/assets/actors/` were authored with
**Blender 5.2 on Windows**; the `.blend` headers record `v0502`. Nothing in the
repository pins that version: `build-prisoner-base.ps1` only *defaults* its
`-Blender` parameter to a 5.2 install path, and no script asserts
`bpy.app.version`. The pipeline is therefore reproducible only in the sense
described below, and a version pin is still outstanding.

The full chain was executed end to end on 2026-08-23 with **Blender 5.0.1** on
Linux (WSL, Mesa software GL — no GPU device was available), starting from
`create-prisoner-base.py`, which needs no input `.blend`. Every step ran
unmodified and exited zero, and `tooling/validate-runtime-atlas.mjs` plus
`tooling/build-asset-registry.mjs` accept the regenerated output. Measured
against the committed 5.2 atlases for `actor.prisoner.base`:

- **Structure reproduces exactly.** Atlas dimensions (`260x3104` idle,
  `2080x3104` walk), the eight-direction row order, frame counts, per-frame
  rectangles, the two-pixel gutter stride and the foot pivot are identical. The
  clip manifest JSON is byte-identical apart from line endings: the committed
  file uses CRLF because `pathlib.Path.write_text` applies platform newline
  translation, so the same 534-line document is 534 bytes larger on Windows.
- **Pixels do not reproduce byte-for-byte.** 13.2% of idle-atlas pixels differ,
  but 96% of the differing channel bytes differ by exactly one 8-bit step and
  only 28 of 3.2M bytes differ by more than 32. Alpha differs in 2 of 807,040
  bytes, so the silhouette is effectively identical. Blender's default
  `dither_intensity` of 1.0, which the pipeline never sets, alone perturbs 17.4%
  of pixels by one step, and the 5.2 atlases additionally carry `sRGB`/`gAMA`/
  `cHRM` chunks that 5.0.1 does not write. Rendering the committed 5.2 `.blend`
  under 5.0.1 gives the same result as rendering a locally regenerated one, so
  the difference is in the render/encode step, not in scene construction.
- **The pipeline is not bit-deterministic even on one version.** Two runs of the
  same commit on the same machine produced different walk atlases:
  `bpy.ops.mesh.primitive_uv_sphere_add` emits identical vertex coordinates and
  an identical face set but a **different face and loop ordering on every call**,
  which shifts a handful of silhouette pixels on the sphere primitives (head,
  hair and hands). 68 of 72 rendered frames were pixel-identical; the remaining
  four differed by 9 to 14 channel bytes each. The cube- and cylinder-only
  `create-environment-catalog.py` is unaffected and produced semantically
  identical scenes across runs.
- **Intermediate frames are never byte-stable.** Blender embeds `Date`,
  `RenderTime` and the absolute source `.blend` path as PNG `tEXt` chunks, so
  frames under `assets/intermediate/` must not be hashed as pipeline outputs.
  The packer itself is a lossless, byte-exact copy: all 72 frame regions in the
  atlases match their source frames exactly, so it contributes no drift.

Consequently the acceptance criterion "a clean documented process reproduces
representative runtime sprites/atlases from source" holds **structurally and
visually**, not bit-exactly, and any hash-equality test must compare structure
or a tolerance-bounded pixel metric rather than file digests. Closing the gap
requires pinning a Blender version in the repository, setting
`dither_intensity = 0` and the PNG newline explicitly in the scripts, and
replacing the UV-sphere primitives with topology-stable geometry.
