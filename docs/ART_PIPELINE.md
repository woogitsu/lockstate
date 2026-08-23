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
