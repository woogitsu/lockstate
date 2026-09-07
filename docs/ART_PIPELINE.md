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

## Environment objects

The character half of this pipeline renders eight directions of an animated
actor. The environment half renders one still frame of a static object, and
until 2026-09-06 it did not exist: `tooling/blender/create-environment-catalog.py`
built all 23 environment models and nothing rendered them. That is why the 23
sheets under `public/game-content/source-art/` are owner-supplied PNGs from
2026-08-22 rather than output of this repository's own catalogue, and why
`fixture.cell.toilet_sink` ships as a 1:2.5 combined column while the catalogue
declares its footprint `(1, 1)`.

`tooling/blender/render-environment-objects.py` is that renderer.

```bash
/opt/blender/blender -b assets/source/blender/environment.mvp.catalog.blend \
    --factory-startup --python tooling/blender/render-environment-objects.py -- \
    --output assets/rendered/environment
```

It renders each collection **orthographically, straight down**, on transparent
film, to one PNG per object plus `environment-objects.render.json`. Orthographic
because `tile-layer.ts` draws an object frame flat into the rectangle its
footprint reserves: a perspective render would put a vanishing point inside a
sprite drawn next to a copy of itself.

**A frame carries its object's declared footprint aspect exactly.**
`tests/unit/environment-art.test.ts` checks two ratios within 3% -- the source
crop against the packed frame, and the packed frame against the footprint -- and
both are satisfied by construction here rather than measured afterwards. Every
declared footprint is an exact multiple of 1/20 of a tile, so the pixel size is
taken from the footprint reduced to lowest integer terms and `res_x / res_y`
equals `footprint_w / footprint_h` with no rounding. The recorded drift is `0`
for all 23 models. A consumer reading one of these PNGs whole therefore needs
`quarterTurns: 0`; the quarter-turn `env.object.bed` carries exists because the
*owner's sheet* holds the bed lying east-west, not because a bed needs turning.

**The frame is the footprint plus a stated transparent margin**, 6% on each
side, not a tight crop. Issue #1028 measured why: the alpha scan in
`src/rendering/assets/environment-sprites.ts` shrinks a rectangle inwards while
its rim is not fully opaque, which is right for a *tiling* frame and wrong for a
discrete object, whose outermost pixels are its own silhouette -- a bed's head
and foot rails.

**Where a model overhangs its declared footprint the frame grows uniformly**, so
the aspect never moves and nothing is clipped, and `frameTiles` plus
`overhangsFootprint` in the sidecar say so per asset. Nine of the 23 do, and
eight are the ones you would expect: the two doors and the two walls, whose
frames and copings are deeper than the quarter-tile edge they are declared as;
`fixture.ceiling_light.panel.variants`, whose housing is 1.4 units across a
1-tile footprint; `perimeter.watchtower.variants`, whose roof is 2.35 across
two tiles; and `security.camera.wall.variants` and
`security.checkpoint.turnstile.variants`, whose lens and arms swing outside
theirs.

The ninth is worth naming because the flag is doing real work there and the
overhang is small enough to have gone unnoticed: `fixture.cell.toilet_sink`
declares `(1, 1)` and its basin disc reaches 0.52 of a tile from the origin, so
it hangs 0.02 over its own tile edge and the frame is 1.1648 tiles square
rather than the 1.12 the margin alone would give. Nothing is clipped and the
aspect is still exactly 1:1; the effect is that the fixture is drawn at 96% of
the size a frame sized from the footprint alone would give it. It is recorded
rather than corrected, because 0.02 of a tile is not worth re-rendering the set
for and a reader who sees the flag should be able to find out what tripped it.

`furniture.cell.bed.single.variants`, the one object `SPRITE_BY_OBJECT_ID` draws
today, does not overhang.

**One vertical flip is owed, and it is done on the encoded PNG.** A camera above
the ground cannot put north at the top of the image and east on the right at the
same time: with view direction `-Z` and image-right `+X`, image-up is
necessarily `+Y`, and `+Y` is south (see "Character directions" above). The only
rotation that puts north up also puts west on the right. Blender 5.2 has no
scene compositor `node_tree` and its `CompositorNodeFlip` no longer carries an
`axis` property, so the renderer reverses the row order of the PNG it just wrote
and re-emits it with filter type 0 -- an exact reordering of the same 8-bit
samples, not a re-render.

**These outputs are byte-reproducible, which the character frames are not.**
That rewrite carries only `IHDR`, the colour-space chunks and `IDAT`, so the
`Date`, `RenderTime` and absolute `.blend` path `tEXt` chunks Blender embeds --
the reason "Reproducibility" below refuses to hash intermediate frames -- are
gone before the file lands. `--verify-determinism` is therefore not needed:
running the script twice and comparing digests is sufficient, and both the file
digest and the raw-pixel digest are recorded per asset in the sidecar.

**What it does not do.** It renders discrete objects. A *tiling* surface --
floor, wall face, wall cap -- needs a zero-margin frame whose edges meet their
own repeat exactly, and a 6% transparent margin is precisely wrong for that. The
four surface frames in `environment-sprites.ts` remain cut from the owner
sheets, and nothing here changes them.

**Where the output is, and what it measures.** `assets/rendered/environment/`
holds the 23 PNGs and the sidecar, 236 KB in total, tracked with Git LFS by the
same kind of `.gitattributes` rule as the sheets beside them. Measured on
2026-09-06 with two independent runs of the renderer executing *concurrently*
against the same `.blend`:

| | run A | run B |
| --- | --- | --- |
| digest over all 23 files | `b4e70814…` | `b4e70814…` ✓ |
| digest over all 23 decoded pixel buffers | `d136db43…` | `d136db43…` ✓ |
| sidecar manifest | identical | identical ✓ |

`frameAspectDriftFromFootprint` is `0` for every one of the 23. The catalogue
that fed them regenerates to an identical `scene-fingerprint.py` document across
runs as well (`a242a490…`), so neither half of the chain reintroduced the
order-instability issue #64 fixed.

**That measurement had no gate behind it, and now it does.**
`render-environment-objects.py`'s own docblock used to say so of itself:
"NOTHING CHECKS THAT AUTOMATICALLY... Writing that gate is owed work." The two
digests above were reproduced by hand, twice, by two people and two decoders;
`tooling/verify-environment-render-determinism.mjs` is the executable form of
the same comparison -- run this script N times (default 2) and diff the
SHA-256 of every PNG and of the sidecar -- and
`tests/determinism/environment-render-determinism.test.ts` wires its fast,
single-collection form into `pnpm test`, with the same `it.skipIf(!canRunLive)`
idiom `tests/determinism/art-pipeline-determinism.test.ts` already uses for the
character pipeline: SKIPPED, visibly, wherever Blender is absent or is not the
pinned 5.2.x -- never silently passed -- and actually exercised wherever it is
present.

**It needs Blender, and CI does not have it.** `.github/workflows/ci.yml` was
read, not assumed, on 2026-09-06: none of its three jobs (`verify`, `assets`,
`browser`) installs Blender anywhere. So this gate cannot be, and does not
claim to be, a required CI check -- it runs in this container, or on any other
machine with the pinned Blender installed, exactly as
`tooling/verify-pipeline-determinism.mjs` already does for the character
pipeline. Making it CI-enforced would mean installing Blender 5.2.1 on the
self-hosted runner and adding a job for it to `ci.yml`; that file is reserved
to the owner (`AGENTS.md` reservation 3), so that is a decision for the owner,
recorded here rather than made silently.

Measured directly, in the container this gate was built in, with Blender 5.2.1
installed at `/opt/blender/blender` (deliberately not on `PATH`, matched by
`--blender`/`$LOCKSTATE_BLENDER` rather than assumed): two independent runs of
`door.interior.variants` -- the smallest, fastest frame in the catalogue --
agree byte-for-byte at `baa834a5d1cb68ee…`, matching the hash already committed
in `environment-objects.render.json`. Reinstating `tEXt` in
`_flip_and_rewrite_png`'s passthrough set (the chunk kind carrying Blender's
own `Date`/`RenderTime`/absolute `.blend` path, described above under
"Determinism") makes the same two runs disagree on both the PNG and the
sidecar, through this gate, and the gate reports it as such rather than
passing. Reverting the mutation restores the match. That is the regression
class this gate exists to catch, demonstrated rather than assumed.

**What a green run proves, and what it still does not.** It proves the
renderer is reproducible on the Blender version actually running, right now.
It does not, by itself, prove the *committed* renders under
`assets/rendered/environment/` would reproduce today -- `--only` lets a caller
ask it to re-render specific ids and compare, but the default run renders into
a fresh scratch directory and compares runs against each other, not against
the committed bytes. Nor does it say anything about a Blender version other
than the pinned one: `pipeline_common.require_blender_version()` refuses to
run under any other, and this gate never sets
`LOCKSTATE_ALLOW_BLENDER_MISMATCH` to get past that refusal.

`assets/rendered/evidence/` holds three pictures, because a claim that art looks
better needs one: `bed-vs-owner-sheet.png` puts the rendered bed beside the
owner sheet's declared `env.object.bed` crop -- (740, 288, 460x230), resampled
and quarter-turned exactly as `environment-textures.ts` would -- at 3x and at
the 128x256 the game actually draws; `geometry-before-after.png` pairs six
objects across the 2026-09-06 remodel; `all-23-objects.png` is the whole set.

**The honest reading of that first picture: the owner's sheet wins at 3x and the
render wins at 1x.** The sheet carries fabric weave, creases in the pillow and a
folded blanket with a real fold in it, and this pipeline cannot produce any of
that -- there are no textures anywhere in it, only flat materials under two
suns. At the size the game draws an object those details are gone to
downsampling, and what survives is contrast between parts, which the render has
more of: a blue blanket against a grey sheet reads at 64px where dark grey
against cream does not. So the render is not better *art*; it is better *sprite*
at this scale, and it is the only option at all for an object whose sheet holds
no usable view -- which is `fixture.cell.toilet_sink`, and is why this exists.

**Blender needs an EGL library even in `--background`.** On a container without
one, every render fails with `Couldn't open libEGL.so.1` before writing
anything; `libegl1` and `libegl-mesa0` are enough, and EEVEE then runs on
llvmpipe at roughly 50 seconds for a 256x512 frame.

### Publishing a render (ADR 0100)

A render committed under `assets/rendered/environment/` is not runtime art
until it is published, and it is published by a second, narrow generator
rather than by widening the one above: `tooling/build-rendered-art-catalog.mjs`
(run as `pnpm content:rendered-art`) reads `environment-objects.render.json`,
content-hashes each published render, and writes
`public/game-content/rendered-art.v1.json` -- a sibling of `source-art.v1.json`,
not a branch inside it, because every entry here carries its *own*
`dimensionsPx`, `footprintTiles` and `frameTiles` rather than the fixed
1448x1086 every owner sheet shares.

It publishes only the render ids `src/rendering/assets/environment-sprites.ts`
actually declares (its `kind: 'rendered-art'` entries) -- not all 23 -- the
same "a declared sprite costs its download, so declaring art nothing draws
costs bytes for nothing" rule the owner-sheet extraction manifest already
follows. `object.toilet` is the first: `fixture.cell.toilet_sink`, 11.27 KiB.

**Grown to four on 2026-09-06 (issue #1020), then back to three the next day
(#1059).** `object.bench`, `object.desk` and `object.storage-rack` joined the
toilet after a per-object legibility pass over the other 22 renders --
`environment-art.ts`'s `OBJECTS_ON_COLOUR_FALLBACK` comment records which of
the remaining catalogued objects were considered and left on the colour
fallback, and why, including `object.storage-rack` itself: a playtest built
one in a real prison and found the render a flat grey rectangle with a single
seam at every zoom the game draws it at, failing the exact "reads as a blob,
not the thing it names" bar the same pass had already refused for
`object.chair`. It was reverted to the colour fallback, and the other two
stayed -- both were checked in the same playtest and both read correctly.

**Each new id needs its own edit to `.github/workflows/ci.yml`'s `browser`
job, and that dependency is worth recording precisely because a revert does
not automatically undo it.** The `browser` job's decode-assertion step
derives ids from `environment-sprites.ts` generically and needs no edit; the
`git lfs pull --include=` step immediately above it is a literal,
comma-separated list of specific globs, not a `rendered.*` directory
wildcard, and a new id's published file is never fetched in CI's
pointer-only checkout until its own glob is added there. That edit landed on
2026-09-06, narrowly released by the owner for exactly this path (`AGENTS.md`
reservation 3), and **it is not narrowed back by #1059's revert**:
`rendered.furniture.cell.locker.variants.*.png` is still in that include
list and still fetches ~11 KiB nothing draws, because tidying `ci.yml` back
down was offered as the alternative and the owner chose to leave the glob
rather than touch that file a second time for a single stale entry. This
paragraph records that choice rather than let a reader assume the glob's
continued presence is an oversight.

**Published into `public/game-content/source-art/`, the owner sheets'
own directory, not a new one.** `public/_headers`' `/game-content/source-art/*`
rule is directory-wide and content-hash-keyed, so reusing the directory needs
no header change -- ADR 0100 §Decision names this explicitly. Because
`fixture.cell.toilet_sink` already names a *different*, already-published file
there (the owner's unused combined toilet+sink sheet), the published filename
carries a `rendered.` prefix the owner sheets' never will:
`source-art/rendered.fixture.cell.toilet_sink.<hash>.png`. The catalog's
`assetId` field is the unprefixed logical id (matching the render sidecar);
only the published *filename* is disambiguated.

**`tooling/validate-rendered-art-catalog.mjs`** (wired into `pnpm verify:assets`
beside the actor-atlas validator) is this lane's gate, sized to what can
actually be checked without Blender: that the published catalog's declared
sha256 agrees with `environment-objects.render.json`'s own, that the committed
render and the published copy both hash (or, in a pointer-only checkout,
declare an LFS `oid`) to that same value, and that
`frameTiles` never falls short of `footprintTiles`. It does not, and cannot,
re-invoke Blender to prove today's render would reproduce those bytes again --
that claim rests on the independent-run comparison described above under
"Reproducibility" (both the by-hand measurement and
`tooling/verify-environment-render-determinism.mjs`, which needs the pinned
Blender version and an EGL-capable container this gate does not require).

**The aspect invariant is recomputed, not trusted from the renderer's own
field.** Until this line, "`frameAspectDriftFromFootprint` is zero" was
checked by reading that field and asserting it stayed near zero -- which
stays green even if the renderer's *own* computation of that number were
wrong, as long as it kept writing a small one. `exactPixelAspectMatchesFootprint`
(exported from this same file) instead scales `footprintTiles` to an integer
numerator -- exact, because every declared footprint is a multiple of 1/20 of
a tile -- and cross-multiplies it against the declared pixel size as `BigInt`,
an integer identity with no rounding at any step. It never reads
`frameAspectDriftFromFootprint` at all.
`tests/contract/rendered-art-pipeline-contract.test.ts` imports the same
function and runs it against all 23 entries in `environment-objects.render.json`
-- not only the currently-published subset this validator iterates -- so the
"recorded drift is `0` for all 23 models" claim above is checked in full, on
every `pnpm test`, with no Blender and no image bytes: plain committed JSON is
enough. Demonstrated by mutation: incrementing a committed `sizePx.width` by
one pixel (both here and against the published catalog's `dimensionsPx`) makes
both the tool and the test fail, naming the exact cross-multiplication that
disagrees; reverting the mutation restores both to green.

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
