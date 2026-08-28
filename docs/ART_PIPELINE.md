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

## Validation gate

`tooling/validate-runtime-atlas.mjs` validates a generated batch against
`assets/contracts/character-8-direction.contract.json` — not against numbers
repeated inside the validator. It checks direction order and completeness, frame
counts per clip, frame size, extrusion, foot-pivot agreement with the contract
and across an asset's own clips, atlas dimensions against the contract limit,
frame rectangles against the real PNG on disk, duplicate logical asset IDs
across manifests, and `asset-registry.json` cross-references. It reports every
failure in one pass.

```bash
pnpm verify:assets
```

CI runs it as a required `assets` job, the only check that reads image bytes; see
[ADR-0014](./adr/0014-art-storage-and-runtime-asset-delivery.md). A checkout
without LFS content leaves pointer files of roughly 131 bytes in place of PNGs
(measured 131 and 132; this line said 130, and all ten actor pointers were
already 131 or 132 at the commit that wrote it), so the
validator detects a pointer and fails naming it rather than passing vacuously,
and the job asserts the PNG signature and a size floor on every atlas before
validating.

That job provisions `git-lfs` with `scripts/provision-git-lfs.sh` and fetches
with an explicit `git lfs pull --include="public/assets/actors"`, rather than
`actions/checkout` with `lfs: true`. On a self-hosted runner whose workspace is
already at the target commit, checkout is a no-op, so the LFS smudge filter never
runs and `lfs: true` downloads objects that never reach the working tree. The
explicit pull materialises regardless, and its path filter fetches only the
runtime atlases instead of every LFS object in the repository.

`tests/contract/runtime-atlas-validation.test.ts` drives that same
implementation against tiny synthetic fixtures to prove each rejection mode
actually rejects. Those fixtures need no LFS content, so they run in `pnpm test`.

That gate answers "is this batch valid?". It does not answer "does building it
twice give the same bytes?", which is a separate check —
`tooling/verify-pipeline-determinism.mjs`, described under
[Reproducibility](#reproducibility). It needs Blender, so it is not part of
`pnpm verify`.

## Runtime access

`src/rendering/assets/` is the runtime half of the contract. `AtlasLibrary`
loads `asset-registry.json`, parses every manifest through Zod, and resolves
`(assetId, clip, direction, frame)` to an image URL, source rectangle and foot
pivot. Renderer code addresses art by logical ID only; the registry names the
manifests and the manifests name the images, so a re-rendered atlas needs no
renderer change. `directionFromMovement` is the single place the contract's
"direction describes world movement, `+x` east and `+y` south" rule is encoded.

`AtlasFrameIndex` flattens what the library can resolve into a per-frame lookup
the render loop can afford, and the world renderer draws through it; see
[RENDERING.md](./RENDERING.md).

Frames, pivots and direction are presentation metadata shared by the renderer
and placement previews. They are never simulation authority.

## Delivery and caching

Runtime art is published from `public/`, which Vite copies verbatim without
fingerprinting, so `/assets/actors/*` — atlases, atlas manifests and
`asset-registry.json` alike — revalidates rather than being cached as
`immutable`. The content-hashed sheets under `/game-content/source-art/*` are
cached immutably because their URL changes with their bytes. `public/_headers`
rules are exclusive, because overlapping rules concatenate into a single
`Cache-Control` instead of overriding each other.
`scripts/verify-deployment-preview.mjs` asserts all of this against the workerd
preview. See [ADR-0014](./adr/0014-art-storage-and-runtime-asset-delivery.md).

The supplied object sheets are built by `pnpm content:source-art`
(`tooling/build-source-art-catalog.mjs`) into
`public/game-content/source-art.v1.json`. Their immutable content-hashed PNG
filenames, SHA-256 digests, source rectangles, anchors and owner-supplied
attribution are recorded there.

**The reviewed extraction manifest this used to promise now exists**, and this
paragraph used to end *"They remain a whole-sheet atlas until a later reviewed
extraction manifest selects individual variants."* It is
`src/rendering/assets/environment-sprites.ts` — a typed source module rather
than generated data, because which pixels of a sheet are a wall is a judgement a
reviewer has to be able to read next to its reason, and the generator writes
`sourceRectPx: {0, 0, 1448, 1086}` for every entry. The catalog is still the
only thing that names a file. See
[ADR-0052](./adr/0052-drawing-the-world-with-the-source-art-sheets.md), which
also answers ADR-0014's open question about whether these sheets should be
published at all.

**It needs the LFS content and refuses without it.** The inputs under
`assets/source/generated/` are git-lfs tracked, so in a checkout that has not
pulled them each is a ~132-byte pointer file. The generator validates every
input before writing anything and aborts with `run \`git lfs pull\` first` —
without that check it hashes the pointer text, republishes 23 pointer files
under content-addressed names, and `rm -rf`s the real output on the way
(verified by execution; `tests/contract/art-pipeline-contract.test.ts` does
then fail on the result, but the images are already gone). The refusal itself
lives in `tooling/source-art-lfs-guard.mjs` with its reading injected, so
`tests/foundation/art-catalog-generator-contract.test.ts` can run it against a
pointer-only fixture instead of only reading the generator's source — a gate
that only read it stayed green when the condition was made unreachable (#264).

**Its output is committed and it runs on demand, not in CI.** Regenerating in
CI would mean pulling `assets/source/generated` on every run, which is metered
LFS bandwidth for inputs that change only when the owner supplies new sheets —
and `verify` deliberately stays on a pointer-only checkout for the same reason.
So editing an input does not regenerate the committed output automatically: run
`pnpm content:source-art` in a checkout with LFS content and commit what it
writes. `tests/contract/art-pipeline-contract.test.ts` is what catches a
catalog that disagrees with the bytes it names, in either kind of checkout
(issue #141).

## Intake status

The owner-generated PNG sheets remain source reference/intake material. They are
not treated as finished animated character frames: their role is to guide the
Blender model, lighting, materials and directional silhouette. A source `.blend`
per role is required before a production character atlas can be rendered.

## Reproducibility

Issue #32's acceptance criterion is a "deterministic generation/hash test on
representative fixture". Issue #64 measured that it could not be met: two
independent runs of the same commit, on the same machine and the same Blender,
produced different atlases. It now holds, and
`tooling/verify-pipeline-determinism.mjs` is the executable check.

### Pinned toolchain

`tooling/blender/pipeline_common.py` declares `SUPPORTED_BLENDER_VERSION`, and
every Blender script asserts `bpy.app.version` against it before doing any work.
The pin is enforced rather than documented because a mismatched toolchain does
not fail on its own: it renders, it validates, and it produces subtly different
pixels. `LOCKSTATE_ALLOW_BLENDER_MISMATCH=1` downgrades the assertion to a
warning for deliberate investigation on another build; output produced that way
must not be committed. Blender is always invoked `--background
--factory-startup`, so user preferences, enabled add-ons and startup files
cannot reach a render.

The pin is **Blender 5.2** — the version that authored the committed atlases
under `public/assets/actors/`, whose `.blend` headers record `v0502`.

The measurements below were taken with **Blender 5.0.1 on Linux** under Mesa
software GL, because 5.2 was not available in that environment; those runs used
the override flag and none of their output was committed. That is a real
limitation of the evidence and it is stated rather than papered over — but it
does not weaken the claim being made. Run-to-run determinism is a property of a
single version on a single machine, and that is exactly the configuration in
which it was both broken and fixed.

### What is reproducible

Two independent full runs of the chain — source scene, 72-frame render, pack,
registry — from the same inputs produce byte-identical outputs:

| Artefact | Before (run 1 / run 2) | After (run 1 / run 2) |
| --- | --- | --- |
| `actor.prisoner.base.idle.png` | `bb2f9bd8…` / `5fea58ad…` ✗ | `0d5ffb28…` / `0d5ffb28…` ✓ |
| `actor.prisoner.base.walk.png` | `b4593067…` / `75ae6508…` ✗ | `accae706…` / `accae706…` ✓ |
| `actor.prisoner.base.atlas-manifests.json` | `e5c40a8f…` / `e5c40a8f…` ✓ | `e5c40a8f…` / `e5c40a8f…` ✓ |
| `asset-registry.json` | — | `011700a9…` / `011700a9…` ✓ |
| scene fingerprint | differs on every run ✗ | `40569836…` on every run ✓ |

The "before" column is the state issue #64 described, re-measured on this
machine; note that *both* atlases differed, not only the walk atlas. The full
digests are printed by the verifier.

`tooling/validate-runtime-atlas.mjs` and `tooling/build-asset-registry.mjs`
accept the regenerated batch; the verifier runs both inside each run, so two
identically invalid runs cannot pass by agreeing with each other.

### The four fixes

1. **Order-unstable sphere geometry.**
   `bpy.ops.mesh.primitive_uv_sphere_add` returns identical vertex coordinates
   and an identical face *set* in a different face and loop *order* on nearly
   every call — four distinct polygon orders in six consecutive calls when
   measured directly. Rasterising a re-ordered mesh moves a few silhouette
   pixels, which is why `Head`, `Hair` and both `Hand` objects drifted.
   `pipeline_common.uv_sphere_mesh()` builds the same sphere with
   `from_pydata`, which writes the vertex, loop and polygon arrays in exactly
   the order given. An icosphere would **not** have fixed this: it is produced
   through the same BMesh path and carries the same instability. Vertex
   positions are unchanged — longitude is measured from `+Y` towards `+X`, as
   the operator does — and the winding is asserted to point outwards at build
   time.
2. **Dither.** `scene.render.dither_intensity` defaults to 1.0 and the pipeline
   never set it; issue #64's probe showed it perturbing 17.4% of pixels by
   exactly one 8-bit step. It is now 0, along with the other byte-visible encode
   settings (`file_format`, `color_mode`, `color_depth`, `compression`).
3. **Newline translation.** `pathlib.Path.write_text` opens in text mode, so on
   Windows every `\n` becomes `\r\n` and the same 534-line manifest is 534 bytes
   larger. All generated text now goes through `pipeline_common.write_text`,
   which pins `newline="\n"`. Note that the committed manifest *blob* is already
   LF — Git normalises it on commit — so this is about files on disk, which is
   what a digest comparison actually reads.
4. **Unpinned Blender.** Described above.

Removing dither also made the idle atlas compress from 459 KB to 237 KB, because
±1 noise across 17% of pixels is close to incompressible.

### What the determinism test compares, and what it must not

```bash
node tooling/verify-pipeline-determinism.mjs --mode scene   # ~1s per run
node tooling/verify-pipeline-determinism.mjs --mode full    # ~3min per run
```

It compares SHA-256 digests of the **packed atlas PNGs**, the **atlas
manifest**, **`asset-registry.json`** and a **canonical fingerprint of the
generated `.blend`** (`tooling/blender/scene-fingerprint.py`, which serialises
the object graph, transforms, mesh arrays *in stored order*, modifiers,
materials, keyframes and render settings).

It deliberately does **not** compare:

- **Rendered frames under `assets/intermediate/`.** Blender writes `Date`,
  `RenderTime` and the absolute source `.blend` path into every PNG as `tEXt`
  chunks, so they can never be byte-stable. A test asserting equality of
  something that can never be equal would be worse than no test. The atlas is
  safe because the packer copies frame *pixels* into a freshly created image, so
  none of that metadata survives; issue #64 confirmed the copy is byte-exact for
  all 72 frame regions.
- **The `.blend` itself.** It embeds absolute paths and a save timestamp. The
  scene fingerprint exists to replace it.

`--mode scene` stops after source-scene construction. That is not a weaker
check of a different thing: it is where the nondeterminism lived, and it detects
the old bug in about three seconds — reverting `sphere()` to the operator
produces three different fingerprints in three runs. `--mode full` carries the
same comparison through the render and the packer.

`tests/determinism/art-pipeline-determinism.test.ts` runs `--mode scene` when
Blender is available and otherwise asserts statically that each of the four
fixes is still present, so a CI run without Blender still fails if one is
reverted.

### Still open

- **The committed atlases were not regenerated.** They remain the reviewed
  Blender 5.2 output. Regenerating them here would have replaced them with
  5.0.1 software-GL pixels and destroyed the baseline #64 measured against.
  Re-rendering them under the pinned 5.2 is a separate, reviewable change.
- **Cross-version equality is not claimed and is not achievable.** Against the
  committed 5.2 atlases, structure reproduces exactly — atlas dimensions
  (`260x3104` idle, `2080x3104` walk), row order, frame counts, per-frame
  rectangles, the two-pixel gutter stride and the foot pivot are identical — but
  pixels do not, and 5.2 additionally writes `sRGB`/`gAMA`/`cHRM` chunks that
  5.0.1 does not.
- **`.gitattributes` does not pin the working-tree newline of generated
  manifests.** The committed blob is LF, but a Windows checkout with
  `core.autocrlf=true` produces a CRLF working copy, so comparing a freshly
  generated manifest against the checked-out one on Windows shows a whole-file
  difference that is not a pipeline difference.
