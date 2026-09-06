# ADR 0100: Whether a rendered object sprite can be published art

## Status

**Accepted by the owner on 2026-09-06, together with the second publishing lane
and with the `ci.yml` change either design requires.**

> The line below is kept rather than overwritten, per `docs/AGENT_WORKFLOW.md`
> §4, because this document was drafted as a question and a reader should see
> that it was answered as one.
>
> **Proposed, 2026-09-06. Not self-approved.**

The decision was put to the owner as four choices — accept the second lane and
authorise the workflow change; publish the renders into the existing
`source-art.v1.json` catalogue instead; do not publish renders at all; or hold
until they had read the document — and they chose:

    Przyjmij drugą ścieżkę i odblokuj ci.yml

("Accept the second lane and unblock `ci.yml`.")

**THE ACCEPTANCE WAS GIVEN AGAINST A SUMMARY OF THE THREE WALLS AND THE FOUR
OPTIONS, NOT AGAINST THIS DOCUMENT'S FULL TEXT**, and the option carrying it
said this much and no more:

    Rendery dostają własny generator, własny katalog i własny walidator,
    wymiarowane pod ich rzeczywiste rozmiary per obiekt (256x256, 256x512),
    zamiast napinać rurkę zrobioną pod Twoje arkusze 1448x1086. Tym samym
    autoryzujesz JEDNĄ zmianę w `.github/workflows/ci.yml`: rozszerzenie filtra
    LFS i asercji dekodowania o nową ścieżkę. To odblokowuje każdy obiekt,
    którego Twoje arkusze nie pokrywają — a toaleta jest pierwszym z siedmiu,
    dla których w batchu nie ma żadnego użytecznego widoku.

That disclosure is the same one ADR 0075, 0076, 0097, 0098 and 0099 carry, for
the same reason: so that nobody later mistakes an acceptance for a reading.

**WHAT THE ACCEPTANCE RELEASES, AND IT IS NARROW.** `AGENTS.md` reservation 3
keeps deploy configuration and `.github/workflows/` the owner's. This
acceptance releases **one** change inside it: extending the `browser` job's
`git lfs pull --include=` filter and its decode assertion to cover the new
lane's published path. It does not release a second workflow, a second job, or
any other edit to that file, and the release is recorded in `AGENTS.md` beside
the two that came before it.

**WHAT ACCEPTANCE DOES NOT SETTLE.** The lane's shape below is accepted; the
question of whether a rendered sprite is ever the *right* art for an object a
human could draw better is not, and this document does not claim it. #1041
measured that the owner's bed sheet is better art than the bed render at large
zoom, and that finding stands: this lane exists for the objects whose shipped
sheets hold no usable view at all, of which the toilet is the first of seven.

**The number was checked against in-flight work, not just against disk.**
`docs/adr/README.md`'s own "Next free number" line said 0099 at `origin/main`'s
tip (`93c11bf8`), because it is defined as one past the highest number *on
disk in this checkout* and 0098 is the highest ADR file present here. But
0099 is not free: a remote sweep — `git fetch origin
'+refs/heads/*:refs/remotes/origin/*' --prune` (216 heads), then
`git ls-tree --name-only <head> -- docs/adr/` over every one — found
`0099-how-the-renderer-learns-the-world-changed.md` already committed
on `origin/adr/how-the-renderer-learns-geometry-changed`, no pull request.
Nothing at 0100 or above appeared on any of the 216 heads. This document is
therefore 0100, on the same precedent the index itself records for the earlier
0095 hold (`docs/adr/README.md`, the two superseded "Next free number" entries
above the current one).

- Related: [issue #1020](https://github.com/woogitsu/lockstate/issues/1020),
  [PR #1041](https://github.com/woogitsu/lockstate/pull/1041),
  [ADR 0052](./0052-drawing-the-world-with-the-source-art-sheets.md),
  [ADR 0014](./0014-art-storage-and-runtime-asset-delivery.md),
  [`docs/ART_PIPELINE.md`](../ART_PIPELINE.md) §"Environment objects"

## Context

`room.cell` requires exactly two objects — `object.bed` and `object.toilet`
(`src/content/room-catalog.ts:96,107`) — and only the bed is drawn as art
today. `object.toilet` (footprint `(1, 1)`, `src/content/object-catalog.ts:99`)
is on `OBJECTS_ON_COLOUR_FALLBACK`
(`src/rendering/world/environment-art.ts`) and has no plausible crop in the
owner-supplied sheets: its only shipped view is a combined toilet+sink column
at roughly 1:2.5 (`docs/ART_PIPELINE.md` §"Environment objects": *"why
`fixture.cell.toilet_sink` ships as a 1:2.5 combined column while the
catalogue declares its footprint `(1, 1)`"*), and no crop of a 1:2.5 column
fits a 1×1 tile. **The one correction the brief itself asked for**: that sheet
is not gapless overall. ADR 0098 measured it directly — an 8-connected
`alpha >= 16` scan finds **ten components, eight above 500 px, cleanly
separated**, and it is only *inside* the largest component's 324×507 box that
there are 0 fully transparent rows and 0 fully transparent columns. The sheet
cuts cleanly into ten pieces; what has no gap is the one combined
toilet-plus-sink view among them, which is why it cannot be split into two
1×1 objects rather than why it cannot be cut at all.

PR #1041 (merged `bce4de89`) gives the toilet a render instead: a top-down,
orthographic, transparent-film Blender frame,
`assets/rendered/environment/fixture.cell.toilet_sink.png`, one of 23 such
renders produced by `tooling/blender/render-environment-objects.py` from
`assets/source/blender/environment.mvp.catalog.blend`. Its own sidecar
(`assets/rendered/environment/environment-objects.render.json`) records it as
256×256 px, `footprintTiles` exactly `{1, 1}`, `frameAspectDriftFromFootprint`
`0.0`, and `sha256 bc8b067e…` — the LFS pointer's own `size` field, read
without pulling the binary, is **11,542 bytes (11.27 KiB)**. Summed the same
way across all 23 renders in the directory: **180,328 bytes (176.1 KiB)**.
Reproducibility is separately measured in `docs/ART_PIPELINE.md`: two
independent concurrent runs of the renderer reproduced identical aggregate
digests over all 23 files and over all 23 decoded pixel buffers.

The PR's own description says it stopped short of the obvious next step on
purpose: *"Nothing is wired into `SPRITE_BY_OBJECT_ID` yet, deliberately."*
This ADR is that next step, read before it is taken rather than after.

### Why the existing mechanism does not reach this file

`src/rendering/world/environment-art.ts`'s `SPRITE_BY_OBJECT_ID` maps an
object id to an `EnvironmentSpriteId`, which `src/rendering/assets/
environment-sprites.ts` defines with a `sourceRectPx` cut from a sheet named
by `assetId`. That field's own docstring is exact about what it may contain:
*"A `source-art.v1.json` asset id. The catalog names the file; this never
does."* Three things follow from that sentence, each checked rather than
assumed:

1. **`source-art.v1.json` is generated exclusively from
   `assets/source/generated/`** by `tooling/build-source-art-catalog.mjs`,
   which hardcodes `dimensionsPx: { width: 1448, height: 1086 }` and
   `sourceRectPx: { x: 0, y: 0, width: 1448, height: 1086 }` for *every*
   entry — one whole-sheet rectangle per owner-supplied PNG — and
   `sourceAttribution: { license: 'owner-supplied, project-internal' }` for
   all of them. None of that is true of a 256×256 Blender render with no
   owner-sheet lineage. Naming the render from `environment-sprites.ts` is
   therefore not "add a row" — the row's `assetId` has nowhere to resolve
   without the generator itself changing shape: a second source directory, a
   per-entry rather than per-batch `dimensionsPx`, and a second
   `sourceAttribution` class.
2. **CI decodes exactly four hardcoded assetIds, and only from
   `public/game-content/source-art/`.** `.github/workflows/ci.yml`'s
   `browser` job (`~line 516`) runs `git lfs pull
   --include="public/game-content/source-art/floor.linoleum.institutional.*
   .png,…,furniture.cell.bed.single.variants.*.png"` — a literal,
   `environment-sprites.ts`-derived path list — then a following step
   greps every `assetId: '…'` out of that same file and asserts a matching,
   fully-decoded PNG exists under that one directory for each. Its own
   comment names the failure mode a fifth, unlisted asset produces: *"the
   page loads, the harness boots, and seven specs die on `Error: The source
   image could not be decoded`."* Publishing the toilet anywhere the browser
   suite reaches therefore requires editing this list — and
   `.github/workflows/` is reserved to the owner in both `AGENTS.md` and this
   task's brief; an implementing agent cannot make that edit regardless of
   which publishing design it prefers.
3. **`assets/rendered/environment/` is a third, unpublished bucket ADR
   0014 never named.** ADR 0014's storage decision names exactly two
   non-public locations — `assets/source/` (authoring inputs, never
   published) and `assets/intermediate/` (git-ignored render frames) — and
   one published one, `public/`. `assets/rendered/environment/` did not
   exist when ADR 0014 or ADR 0052 were written; it is LFS-tracked and
   committed (`.gitattributes: assets/rendered/**/*.png`) but sits outside
   `public/`, in the same unreachable position as `assets/source/`. Nothing
   in ADR 0014's delivery-and-caching rules, and nothing in ADR 0052's
   decision 1, was ever written to cover it.

So this is not a case where the render can "ride the existing machinery": the
manifest's own contract, the CI gate that keeps that manifest honest, and
ADR 0014's storage taxonomy all point at one already-published, owner-sheet
batch and nowhere else. Reaching the toilet render from the runtime means
building a second producer of a published catalog entry — exactly the shape
of cost ADR 0052 named when it deferred the offline-packer alternative:
*"it adds a second committed LFS batch that CI cannot regenerate … so the
reviewed-output discipline the actor pipeline already carries would have to
be duplicated for a batch whose inputs change only when the owner supplies
new [renders]."* The renderer's own inputs are Blender-and-EGL-dependent
(`docs/ART_PIPELINE.md`: *"Blender needs an EGL library even in
`--background`"*, ~50s/frame on software rasterisation) and pinned to an
exact Blender version nothing in CI has installed, so this is not a
hypothetical: a re-render genuinely cannot happen in CI, only reviewed by
hand and committed, the same discipline `public/assets/actors/` already
carries and `tooling/validate-runtime-atlas.mjs` already gates — but no
analogous gate exists for `assets/rendered/environment/`, and building one
(the render's frames are not fixed-1448×1086 like the owner sheets; each has
its own footprint-derived size and margin fraction) is design work, not
wiring.

## Decision

**Do not draw `object.toilet` from `assets/rendered/environment/` in this
change.** Doing so today would mean adding a row that fails at runtime
(`sourceRectPx` cut from a sheet the manifest cannot name), or silently
redesigning `build-source-art-catalog.mjs`'s schema and its CI gate to reach
a location outside the batch ADR 0052 decision 1 describes, or shipping art
the `browser` CI suite cannot decode because its LFS pull list — a file this
task is expressly forbidden to touch — does not know the render exists. None
of those is "ride the existing machinery"; all three are a second art
pipeline wearing the first one's clothes.

**Recommendation, for the owner to accept or reject:** build a second,
narrow, explicitly-named publishing lane for Blender-rendered object sprites,
rather than stretching `source-art.v1.json` to cover two unrelated producers.
Concretely:

1. A second generator script under `tooling/`, sibling to
   `build-source-art-catalog.mjs` rather than a change inside it, that reads
   `assets/rendered/environment/*.png` plus `environment-objects.render.json`,
   content-hashes each PNG, and writes its own catalog under
   `public/game-content/` recording each entry's *own* `dimensionsPx` and
   `frameTiles` from the sidecar rather than a hardcoded 1448×1086 — because
   unlike the owner sheets, no two renders share a size. Its
   `sourceAttribution` names the renderer and the `.blend` catalogue rather
   than claiming `owner-supplied`. Neither filename is fixed by this ADR;
   naming one here would misstate a decision this document does not make.
2. Published images under a path `/game-content/source-art/*`'s existing
   `public/_headers` rule already covers if reused verbatim (that rule is
   directory-wide and content-hash-keyed, so no header change is actually
   needed there) — but the CI LFS include-list and the browser-suite decode
   assertion still need a new, reviewed entry, which is the owner's edit to
   make under this repository's own rule, not a consequence of this ADR's
   design.
3. A validator shaped like `tooling/validate-runtime-atlas.mjs` but for this
   batch's real invariants — `frameAspectDriftFromFootprint` near zero,
   the declared margin fraction, sha256 agreement with the sidecar — rather
   than reusing the owner-sheet validator's fixed-dimension assumptions.
4. `environment-sprites.ts`'s `assetId` docstring gains a second sentence
   naming which catalog an id may resolve against, and `SPRITE_BY_OBJECT_ID`
   gets its `object.toilet` row only once (1)-(3) exist.

**The alternative, and why it is not obviously worse:** ADR 0052 already left
open *"whether the twenty catalogued objects should be drawn from the
furniture sheets… a content decision with the same owner as ADR-0014's."*
Folding the toilet into that same still-open owner call — rather than cutting
a one-object exception through a new pipeline today — means the
`.github/workflows/` edit happens once, reviewed together with whichever
other objects the owner decides are worth it, instead of once now and again
per additional object. Given that edit is the owner's regardless of which
design wins, this ADR does not resolve which of the two is cheaper in owner
attention; it only establishes that *some* owner-facing change is required
either way, which is the fact that makes this a decision rather than an
implementation.

## What this is not blocked on

**Bytes are not the objection.** The toilet render alone is 11.27 KiB —
0.25% of ADR 0052's 4.40 MiB three-sheet baseline, and immutably cacheable
the same way once published. All 23 renders together are 176.1 KiB, smaller
than a single owner sheet. If the mechanism above is built, the toilet's
first-load cost is negligible; what is missing is the mechanism, not the
budget for it.

**Quality is not the objection either.** `docs/ART_PIPELINE.md`'s own honest
verdict stands: *"the owner's sheet is better art and the render is a better
sprite… existing at all for the toilet, whose only shipped view is a 1:2.5
combined column that no crop fits into a 1×1 tile."* Nothing here disputes
that the render is the right pixels to ship; the question this ADR answers is
only where "ship" would have to mean.

## Consequences

Positive:

- `object.toilet` staying on `OBJECTS_ON_COLOUR_FALLBACK` remains an honest
  claim rather than a claim contradicted by a manifest row with nowhere to
  resolve — `tests/unit/environment-art.test.ts`'s two-directional guard is
  unaffected by this ADR because nothing in `SPRITE_BY_OBJECT_ID` or
  `ENVIRONMENT_SPRITE_IDS` changed.
- The renderer's output and its reproducibility evidence stay exactly as
  PR #1041 left them — reviewed, committed, unpublished — with no code
  claiming to draw from a path nothing serves.
- A future implementer has a named seam (`assetId`'s docstring, the CI
  LFS list, `build-source-art-catalog.mjs`'s hardcoded schema) to build
  against instead of discovering it mid-change.

Costs:

- `room.cell`'s toilet keeps drawing as a coloured block until this is
  decided, which is the state this ADR found rather than one it creates.
- Whichever design is chosen, an owner-facing edit to `.github/workflows/
  ci.yml` is required before any rendered object sprite can reach the
  browser suite or a player — this ADR cannot discharge that, only name it.

## Alternatives considered

### Reuse `source-art.v1.json` and its generator directly

Rejected. It would mean silently changing the generator's schema (per-entry
dimensions instead of a hardcoded 1448×1086, a second attribution class) for
a batch whose provenance, review process and regeneration story are entirely
different from the owner sheets it was built for — collapsing two producers
into one manifest makes the manifest a worse record of what a reviewer is
actually approving, for no saving beyond not writing a second small script.

### Copy the render's bytes into `public/game-content/source-art/` by hand, once, without a generator

Rejected. It would pass the CI decode assertion once edited, but it commits a
file with no generator, no sidecar cross-reference and no re-generation path
recorded anywhere — exactly the un-reviewable, ungated state ADR 0014's
"Generated runtime batches are committed... What ships is therefore exactly
what was reviewed" was written to prevent for the actor pipeline. A one-off
hand-copy is a worse version of the mechanism recommended above, not a
cheaper one; it still needs the same `.github/workflows/` edit and buys
nothing else.

### Wait for the owner's ADR-0052 open question before doing anything

Considered and folded into the Decision's recommendation above rather than
kept separate: it is the same "wait" outcome, motivated by the observation
that the owner-facing edit recurs per object either way.
