# ADR 0052: Drawing the world with the source-art sheets

## Status

**Proposed, 2026-08-28.** Not self-approved.

**The number is provisional, and it has already moved once.** This document was
drafted as 0051 and reassigned to 0052 while it was still on its branch, because
another draft reached the index first. That is the mechanism working rather than
failing: a number is reserved by appearing in `docs/adr/README.md` and nowhere
else (`AGENTS.md`: *"A number is not reserved until it appears in
`docs/adr/README.md`"*), and this branch is cut from `b30ae9b`, which carries
none of 0049, 0050 or 0051 on disk. If 0052 collides in turn, this file, its
README row and every citation of it must be renumbered again.

- Related: issue #32, [ADR-0014](./0014-art-storage-and-runtime-asset-delivery.md),
  [`docs/ART_PIPELINE.md`](../ART_PIPELINE.md), [`docs/RENDERING.md`](../RENDERING.md)

## Context

[ADR-0014](./0014-art-storage-and-runtime-asset-delivery.md) ends with an open
question it deliberately declined to answer:

> Whether `public/game-content/source-art/` should be published at all. It is
> 36 MB of the 55 MB bundle, nothing loads it, and `docs/ART_PIPELINE.md` calls
> it intake material.

Measured again on this branch: the directory holds 23 PNG sheets totalling
**35.84 MiB**, catalogued by `public/game-content/source-art.v1.json`,
hash-verified by `tests/contract/art-pipeline-contract.test.ts`, and
`grep -rn "source-art\|game-content" src/` returns nothing. The world is drawn
as coloured rectangles from the tables in `src/rendering/world/appearance.ts`.

`docs/ART_PIPELINE.md` says what is supposed to happen next, and it has not
happened:

> They remain a whole-sheet atlas until a later reviewed extraction manifest
> selects individual variants.

Three facts about the sheets shape every option below, and each was measured
rather than assumed:

1. **They are usable as tile art without a re-render.** The floor sheets contain
   axis-aligned top-down squares, and both wall sheets contain a frontal
   elevation — which is exactly the projection `docs/RENDERING.md` describes
   ("a top-down view in which objects have visible sides"). Cropped to their
   fully-opaque interior and repeated at one tile per 64 px, the concrete slab
   and the institutional linoleum both tile without a seam.
2. **They are laid out irregularly.** `floor.concrete.variants` is a neat 3×3;
   `floor.linoleum.institutional` is six pieces at six different sizes — a hero
   square, two three-quarter views, an edge-on strip and two swatches. No generator can
   infer the rectangles, which is why the extraction manifest has to be a
   reviewed document rather than a computed one.
3. **They are authored far above the size they are drawn at.** A floor slab is
   367 px square and is drawn on a 64 px tile. Sampling that down in the shader
   with no mipmap chain makes a floor that shimmers whenever the camera moves.

One more measurement decides where the art can attach at all: **no code path
paints terrain.** `SparseWorld.setTerrain` has no caller anywhere outside
`SparseWorld` itself, so every tile of every session is `dirt` forever. A floor
mapping keyed by terrain id would download a sheet to draw nothing.

## Decision

### 1. The runtime reads the published sheets. ADR-0014's open question is answered "yes, publish them".

They stay in `public/game-content/source-art/`, served under the immutable
content-hashed URLs ADR-0014 already specified, and the renderer loads the ones
its mapping needs. That is **three** sheets today —
`floor.linoleum.institutional`, `wall.interior.modules`, `door.interior.variants`
— **4.40 MiB**, 12.3% of the directory.

The number to compare it against is not zero. The shipped page already
downloads **16.43 MiB** of actor atlases from `/assets/actors`, because
`AtlasLibrary.load` and `registerAtlasTextures` fetch every image in the
generated batch. Adding 4.40 MiB of immutable, revalidation-free, lazily
fetched art to a page that already pays 16.43 MiB is the same order of cost, and
it is paid for something the player can see.

### 2. The extraction manifest is a typed source module, not generated data.

`src/rendering/assets/environment-sprites.ts` declares each sprite's sheet,
source rectangle, runtime size and quarter-turn, with the reason for the
rectangle beside it. It is not written into `source-art.v1.json`, because that
file is generated output and these numbers are a human judgement; a reviewer
must be able to read the judgement and its reason together.

The rectangles were measured, not eyeballed: 8-connected components of
`alpha >= 16` isolate each rendered object, then the bounding box is shrunk
while any pixel on its outer row or column has `alpha < 240`. The threshold is
240 rather than 255 because these renders are not fully opaque — interior alpha
measures 252–253 — and without the shrink the antialiased rim is included and a
tiled floor grows a one-pixel seam of whatever is behind it.

### 3. The cutting and resampling happen in the browser, at load.

`createImageBitmap(sheet, sx, sy, sw, sh, { resizeWidth, resizeHeight,
resizeQuality: 'high' })` crops and resamples properly and off the main thread.
The frames land in one canvas texture with a two-pixel extruded gutter, so
floors and walls share a texture and batch.

The *plan* it follows — which sheets, which crops, what size, where each frame
lands — is a pure function of the catalog and the manifest
(`environment-atlas-plan.ts`), computed with no canvas in sight and tested in
the Node suite. Replacing this step with an offline packer later therefore
changes one Phaser module and nothing above it.

### 4. The mapping from simulation identity to artwork is keyed by zoning, not terrain.

`src/rendering/world/environment-art.ts` maps a zoned tile to an interior floor
and an edge-layer value to a wall or a door. Zoning rather than terrain, for the
measured reason above: designating a room is the act that makes a patch of
ground an interior, and it is the only thing the simulation produces that the
two floor sheets are pictures of. The room's category is still carried by
`zoningTint`, drawn over the floor at a reduced alpha so both marks survive.

### 5. The fallback is declared, and its completeness is enforced.

Every identity with no artwork keeps today's coloured block, and the lists of
which those are — `TERRAIN_ON_COLOUR_FALLBACK`, `OBJECTS_ON_COLOUR_FALLBACK` —
are written down with the reason. `tests/unit/environment-art.test.ts` fails if
the lists and the registries disagree **in either direction**, so cataloguing an
object with no art is a red test naming it rather than a hole nobody sees. Art
that fails to load leaves exactly the world the renderer drew before this
change, which is the rule `docs/RENDERING.md` already states.

## Alternatives considered

### An offline packer that ships a small derived batch

**The better long-run answer for bytes, and deferred rather than rejected.** A
`tooling/` step reading the LFS sheets, cutting the same rectangles, resampling
them and writing one ~200 KB runtime sheet would cut the download by an order of
magnitude and move the resampling cost off every client.

It is not taken now for two reasons that are about this repository rather than
about the idea. It needs an image codec: `sharp` is present only as a transitive
dependency of Vite, so using it means a new `devDependency` and a lockfile
change, and `pnpm` cannot be run from a worktree at all
(`ERR_PNPM_UNSAFE_MODULES_DIR`). And it adds a second committed LFS batch that
CI cannot regenerate, because `verify` deliberately stays on a pointer-only
checkout (ADR-0014, §"Verification") — so the reviewed-output discipline the
actor pipeline already carries would have to be duplicated for a batch whose
inputs change only when the owner supplies new sheets.

Decision 3 is what makes this cheap to revisit: the runtime consumes a *plan*,
and an offline batch is a different producer of the same plan.

### Drawing the sheets directly, without resampling

Rejected on the third measurement above. A 367 px slab minified onto a 64 px
tile with linear filtering and no mipmaps shimmers under a moving camera, and a
floor is the largest thing on the screen.

### One Phaser texture per sprite instead of one packed atlas

Rejected. Phaser 4 wraps a tiling frame in the shader
(`TexCoordFrameWrap`), so a repeating frame does not need a texture of its own
and does not need power-of-two dimensions. One texture lets floors and walls
batch; several would not.

### A sprite per tile

Rejected, and it is the failure mode this design is shaped against. A 32×32
chunk is 1,024 tiles, and the layer's whole cost model
(`docs/RENDERING.md`, "What is drawn, and what it costs") is that a chunk and a
row are each painted once. `mergeFloorRects` collapses a chunk's floor into
greedy rectangles — a zoned room is one sprite — and `mergeTopEdgeRuns`
collapses a row's north wall into one sprite per unbroken run.

### Keying floors on terrain and mapping `concrete`

Rejected today, and it is one row away whenever terrain painting arrives. It
would add 2.3 MiB to the first load to draw nothing, because nothing can produce
a concrete tile.

## Consequences

Positive:

- The 35.84 MiB the bundle has been carrying stops being dead weight for the
  three sheets that are now read, and ADR-0014's open question has an answer
  with a number under it.
- Adding art for a new object is a row in a data module, in both directions:
  a mapping row naming a sprite that does not exist fails `tsc`, and an object
  with no row fails a named test.

  > **Amendment, 2026-09-06: this sentence was false for objects when it was
  > written, and is true now.** Kept rather than rewritten, per
  > `docs/AGENT_WORKFLOW.md` §4 — both what falsified it and what repaired it
  > are worth a later reader's time, and the interval is the useful part.
  >
  > Issue #1024 measured the gap: `objectSprite` had exactly two occurrences in
  > the whole tree — its own definition and `objectArtCoverage` — while
  > `zonedFloorSprite` and `edgeArt` were each read by the painter in
  > `src/rendering/phaser/tile-layer.ts`, inside `paintChunk` and
  > `acquireEdgeSprite` respectively. So for objects the second direction held
  > and the first did not: a mapping row would have made the coverage test
  > report art that never reached a pixel. #1024 therefore declined to add the
  > row the issue asked for and gated the premise instead.
  >
  > #1028 made the sentence true by adding the reader it was missing:
  > `const sprite = this.acquireObjectSprite(depth, structure.definitionId, footprint, alpha);`
  > in the structure loop, falling back to `paintSlab` — the shape
  > `acquireEdgeSprite` has had since edges got art. The cost of the *second*
  > object was then measured rather than estimated: 4 files and +11/-3 lines of
  > code, so what this sentence promises about a row is now the price a reader
  > will actually pay for the code half of it.
- A finished door stops being drawn as a brick wall — a defect
  `DOOR_EDGE_NUMERIC_ID`'s own comment records as owed work — because the edge
  appearance is now a per-value lookup with or without art.

Costs:

- **4.40 MiB more on a cold load**, once, immutably cached. It is fetched after
  the scene is up and the world is drawn as blocks until it lands.
- The browser spends the resampling cost that an offline packer would have paid
  at build time, once per cold load.
- A fourth sheet is a fourth ~1.5 MiB download. That is the pressure that will
  eventually make the offline packer worth building, and the figure to watch.

## Open question left deliberately unresolved

**Whether the twenty catalogued objects should be drawn from the furniture
sheets, given what each one costs.** Thirteen of them have a plausible sheet and
seven have none at all — there is no stove, fridge, bookshelf, washing machine,
medical bed, medicine cabinet or security console anywhere in the batch. Drawing
the four cell sheets alone would add about 5.9 MiB, more than doubling this
change's download, to draw furniture that occupies a few tiles each. That trade
is a content decision with the same owner as ADR-0014's, and it is the decision
the offline packer would change the shape of.
