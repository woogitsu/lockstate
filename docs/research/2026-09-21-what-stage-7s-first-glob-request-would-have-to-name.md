# What stage 7's first glob request would have to name — and why there is nothing to ask for yet

**Research, 2026-09-21.** Taken on `origin/main` at `7285e1c4` (v0.0.734), in a
detached worktree, in an environment where **Git LFS is not provisioned**: every
PNG under `public/assets/`, `public/game-content/` and `assets/` is a ~130-byte
pointer file. Every byte count below that is attributed to an image is read out
of the `size` field of its LFS pointer, not off decoded pixels, and is labelled
as such where it matters.

**The brief this answers.** The owner's ruling of 2026-09-21 — *"Jedna prośba na
partię"*, one release request per batch — makes stage 7 proceed batch by batch,
each batch's glob segments shown to the owner and released in their own dated
words. This document was asked to make the **first** such request possible.

**Its answer is that the first request cannot be made yet, and that this is a
finding rather than a failure to find one.** The mechanism is exactly as
reported; what is missing is not a permission but the art. Section 7 states this
in the form the caller asked for.

> **A note on the ruling's own provenance, because this repository's rules are
> about provenance.** `AGENTS.md` records six releases inside reservation 3 and
> two declined offers, each with the owner's words or the label they clicked.
> **It records no ruling of 2026-09-21 about batching.** Swept:
> `grep -rn "Jedna prośba\|partię" .` over the whole tree returns nothing.
> The ruling is therefore taken here as true on the caller's word and **not
> corroborated by this repository**, which is the weaker of the two kinds of
> provenance `AGENTS.md` distinguishes. Whoever spends it should write it into
> `AGENTS.md`'s reservation 3 entry, in the owner's words and dated, the way the
> six releases before it are written — otherwise the next session re-asks.

---

## 1. The mechanism, quoted

### 1.1 The `--include=` list, verbatim

The `browser` job of `.github/workflows/ci.yml`, step *Fetch runtime art from
Git LFS*, ends with two `git lfs pull` commands. Both lines, copied out of the
file:

```
          git lfs pull --include="public/assets/actors"
          git lfs pull --include="public/game-content/source-art/floor.linoleum.institutional.*.png,public/game-content/source-art/wall.interior.modules.*.png,public/game-content/source-art/door.interior.variants.*.png,public/game-content/source-art/furniture.cell.bed.single.variants.*.png,public/game-content/source-art/rendered.fixture.cell.toilet_sink.*.png,public/game-content/source-art/rendered.furniture.corridor.bench.variants.*.png,public/game-content/source-art/rendered.furniture.office.desk.employee.variants.*.png,public/game-content/source-art/rendered.furniture.cell.locker.variants.*.png"
```

The second line is one comma-separated string holding **eight** path segments.
Split for reading — this is the same text, one segment per line:

```
public/game-content/source-art/floor.linoleum.institutional.*.png
public/game-content/source-art/wall.interior.modules.*.png
public/game-content/source-art/door.interior.variants.*.png
public/game-content/source-art/furniture.cell.bed.single.variants.*.png
public/game-content/source-art/rendered.fixture.cell.toilet_sink.*.png
public/game-content/source-art/rendered.furniture.corridor.bench.variants.*.png
public/game-content/source-art/rendered.furniture.office.desk.employee.variants.*.png
public/game-content/source-art/rendered.furniture.cell.locker.variants.*.png
```

The `assets` job has its own, separate `git lfs pull` and it fetches
`public/assets/actors` only — no `source-art` segment at all. A sprite added to
the second list above is **not** thereby fetched in the `assets` job, and does
not need to be: that job validates the runtime actor atlases and never opens
`public/game-content/`.

### 1.2 The decode assertion, verbatim

The step that follows is *Assert the environment sheets decoded*. Its
fails-closed core, copied out of the file:

```
          assert_decoded() {
            file="$1"; id="$2"
            if head -c 64 "$file" | grep -q 'git-lfs.github.com'; then
              echo "::error::$file is still a Git LFS pointer; add '$id' to the --include filter above"
              exit 1
            fi
            signature="$(head -c 8 "$file" | od -An -tx1 | tr -d ' \n')"
            if [ "$signature" != "89504e470d0a1a0a" ]; then
              echo "::error::$file does not start with the PNG signature (got $signature)"
              exit 1
            fi
            echo "$file: $(stat -c%s "$file") bytes"
          }
```

and the two id lists it runs that function over — the first for owner sheets,
the second for renders:

```
          ids="$(grep -oE "assetId: '[^']+'" src/rendering/assets/environment-sprites.ts \
                 | sed "s/assetId: '//; s/'//" | sort -u)"
```

```
          rendered_ids="$(grep -oE "renderedArtId: '[^']+'" src/rendering/assets/environment-sprites.ts \
                 | sed "s/renderedArtId: '//; s/'//" | sort -u)"
```

with the second resolved through a `rendered.` prefix the first does not use:

```
            file="$(ls public/game-content/source-art/rendered."$id".*.png 2>/dev/null | head -1 || true)"
```

### 1.3 What a missing segment costs, and how it presents

**The two halves of this mechanism are not alike, and the difference is the
whole reason a release is needed for one and not the other.**

- **The assertion is generic.** It derives its ids by grepping
  `src/rendering/assets/environment-sprites.ts` at run time. A new sprite
  declared there is checked with no edit to the workflow, for any number of ids,
  ever.
- **The `--include=` list is not generic and never was.** It is a literal
  comma-separated list of eight globs. `rendered.` inside an entry is a filename
  prefix, not a wildcard over entries. `.gitattributes` routes
  `public/game-content/**/*.png` through LFS and the checkout is pointer-only
  outside what this list names, so a sheet or render the list does not name is
  **never fetched**.

The failure that produces is not an LFS error. The file is present and is a
132-byte text stub; the assertion above opens it, sees the pointer's first line,
and exits 1 with its own remedy in the message — `add '<id>' to the --include
filter above`. If that assertion were ever removed or out-paced, the same
missing bytes present instead as the renderer's own
`Error: The source image could not be decoded` from inside `createImageBitmap`,
which is the seven-spec failure the second filter was added to stop.

**Cost of one missing segment:** one red `browser` job, plus another round with
the owner, because the fix lives inside reservation 3.

**The reverse direction does not fail.** A glob matching nothing fetches nothing
and exits 0. `AGENTS.md` records this as the reading that made the 2026-09-21
declined offer cheap.

### 1.4 Does the caller's description hold? Yes, with three refinements

The brief said: a literal list of glob segments, a list of specific globs rather
than a pattern over them, so every newly rendered sprite must be named there
individually or CI fetches a pointer and the decode assertion fails on it.
**Opened and confirmed, exactly.** Three things the brief did not say, none of
which contradict it:

1. **The list is eight segments, and one of them is dead.** Measured below
   (§3.3): `rendered.furniture.cell.locker.variants.*.png` matches no file on
   disk. `AGENTS.md`'s finding list, item 7, records this being offered to the
   owner for deletion and the owner answering *"Zostawić"* ("Leave it."). It
   costs nothing while it waits, and it means **storage-rack art, if it is ever
   remade, needs no new segment.**
2. **Each segment is itself a glob over the content hash**, `<id>.*.png`, so a
   *re-render* of an already-named id needs no release. Only a **new id** does.
3. **The assertion is driven by the sprite manifest, not by the list.** An id
   declared in `environment-sprites.ts` and absent from the list is the failure;
   an id in the list and absent from the manifest is silence. So the release the
   owner grants must be computed from the manifest change, not from the art.

---

## 2. What stage 7 actually owes

### 2.1 What the delivery specifies

`docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` is **Accepted
by the owner on 2026-09-13, in five rulings**, two against the document's own
recommendation; its Status block additionally records a **2026-09-16 ruling that
it says is not a sixth decision** (it settles the scope of decision 4's
amendment of constitution article 8 to 15 / 13 / 11 and deliberately adds no
`### Decision` heading, because a foundation test reads those headings as the
list of rulings). Read from the Status block itself, not from a summary of it.

Only **decision 5** is stage 7's. Its ruling, in the owner's words as the table
records them:

> *"Referencja + zrób nowy prompt na kafelki i obiekty"*

and the ADR's own reading of it, quoted:

> **RULED 2026-09-13: reference, and produce new production prompts beside it.**
> The illustration stays a reference and nothing is cut out of it; on top of
> that, the owner asked for prompts covering tiles and objects in the same
> style, so the catalogue can be produced rather than improvised.

**So the delivery specifies exactly two things about world art**: the single
1536x1024 campus illustration stays a reference with nothing cut out of it, and
prompts for tiles and objects are to be written in its style. It specifies **no
asset list, no id, no count.** The 23 sheets it is measured against predate it
by three weeks.

A second ruling the same day, recorded in `docs/IDENTITY_V5_ROLLOUT.md` §"Stage
7" and in `docs/ART_CONCEPT_PROMPTS.md`, scopes what those prompts are for —
the owner chose *"Referencje koncepcyjne pod modelowanie w Blenderze"*:

> **A generated image is a concept reference. It is never a shipped sprite.**

`docs/VISUAL_IDENTITY.md` adds nothing to this beyond restating decision 5 and
assigning the production half to stage 7; it is the reference for `src/ui/`, and
world art is not `src/ui/`.

### 2.2 What the rollout plan infers

`docs/IDENTITY_V5_ROLLOUT.md` §"Stage 7" adds, beyond the ruling:

- that production work is the existing pipeline's — `docs/ART_PIPELINE.md`,
  `docs/RENDERING.md`, pivots, light direction, eight facings, depth, culling,
  atlas budget, LFS;
- the two hard mechanics, both of which §1 above confirms: publish under
  `public/game-content/source-art/`, and name every new id in the literal
  `--include=` list, *"which means **every batch of new art needs a release from
  the owner before it can go green**, and that is a scheduling fact, not a
  footnote."*

`docs/ART_CONCEPT_PROMPTS.md` infers the catalogue itself — it groups the 23
existing ids into eight prompt sections (floors; walls and doors; cell furniture;
dining/kitchen/corridor; reception and offices; security; perimeter and yard;
lighting and storage) and its closing procedure is the one that matters here:

> 5. **Ask the owner to add the id to the `git lfs pull --include=` list in
>    `.github/workflows/ci.yml`.** [...] This is a scheduling dependency on a
>    person, and it is the one step in this document that cannot be worked
>    around.

**The enumeration of what stage 7 owes is therefore an inference, and it is
this.** The one place in the repository that states a world-art gap as data is
`src/rendering/world/environment-art.ts`, which carries three declared fallback
lists and a unit test that fails if they and the registries disagree in either
direction. Read out of it:

- **Objects.** 20 catalogued, 4 drawn (`object.bed`, `object.toilet`,
  `object.bench`, `object.desk`), **16 on the colour fallback.**
- **Terrain.** 6 defined (`concrete`, `dirt`, `grass`, `gravel`, `rock`,
  `water`), **0 drawn**, and the module records why: `SparseWorld.setTerrain`
  has no caller outside `SparseWorld`, so every tile in every session is `dirt`
  forever, and a terrain-keyed mapping would download a sheet to draw nothing.
  Floors are keyed by **zoning** instead, and there is one floor for every
  zoning id.
- **Edges.** 2 values exist in the world's edge layers and both are drawn.
  Confirmed at the source: `src/simulation/construction/definition.ts` defines
  `WALL_EDGE_NUMERIC_ID = 1` and `DOOR_EDGE_NUMERIC_ID = 2` and the writer
  returns one of those two or `0`. **There is no third edge value**, so
  `door.security.variants` and `wall.exterior.modules` — which have both an
  owner sheet and a render — have no simulation identity to hang on.

**The 16 objects on the fallback are stage 7's real debt**, and the module
splits them further, in a comment written as the judgement was made:

- **Seven have no art of any kind** — stove, fridge, bookshelf, washing machine,
  medical bed, medicine cabinet, security console.
- **Two were looked at and refused on legibility**, at the size the game draws
  them: `object.chair` (its only render reads as *"a rounded blue-grey blob
  barely distinct from this very fallback slab"*) and `object.storage-rack`
  (added in #1020, reverted the next day in #1059 after a playtest built one:
  *"a flat grey-blue rectangle with a single vertical seam line down the
  middle"*, at zoom 1 and at zoom 3, and at the native 256x256 too).
- **The rest were refused on geometry**: *"No other of the twenty has any render
  at all whose subject matches its footprint without stretching it"*, with the
  reception counter and the shipping container named as the two that share a
  footprint with `object.loading-dock-door` and `object.prep-counter` and
  *"neither looks anything like either object"*.

---

## 3. What already exists on disk

### 3.1 The two runtime art directories, and nothing else

```
$ find public -name "*.png" | sed 's|/[^/]*$||' | sort | uniq -c
     10 public/assets/actors
     26 public/game-content/source-art
```

`.gitattributes` routes five path patterns through LFS:

```
assets/source/**/*.png filter=lfs diff=lfs merge=lfs -text
assets/source/**/*.blend filter=lfs diff=lfs merge=lfs -text
public/assets/**/*.png filter=lfs diff=lfs merge=lfs -text
public/game-content/**/*.png filter=lfs diff=lfs merge=lfs -text
assets/rendered/**/*.png filter=lfs diff=lfs merge=lfs -text
```

`public/assets/actors` is covered whole by the first `--include=`. The 26 files
in `public/game-content/source-art` are the question.

### 3.2 `public/game-content/source-art/`, all 26

```
$ ls public/game-content/source-art/
door.interior.variants.055fa92eae37.png
door.security.variants.268398c2b489.png
fixture.ceiling_light.panel.variants.30a39862f2f7.png
fixture.cell.toilet_sink.18b4c51aa610.png
floor.concrete.variants.9dac064f7757.png
floor.linoleum.institutional.788e81d4e081.png
furniture.cell.bed.single.variants.45bfa2e0ab8d.png
furniture.cell.locker.variants.89a3cfd67726.png
furniture.cell.table_stool.e23a5640a5f8.png
furniture.corridor.bench.variants.69c9da4e652f.png
furniture.office.desk.employee.variants.41a9bffd10f9.png
furniture.reception.counter.variants.3370df8a9146.png
furniture.visitor.chair.variants.f6953a35d33a.png
perimeter.fence.modules.f0868866a6f0.png
perimeter.light.pole.variants.b6fad7d32bee.png
perimeter.vehicle_gate.sliding.variants.69d48f97caba.png
perimeter.watchtower.variants.b1f385fd3483.png
rendered.fixture.cell.toilet_sink.bc8b067ea146.png
rendered.furniture.corridor.bench.variants.4afd4a1258e7.png
rendered.furniture.office.desk.employee.variants.70767a391cbe.png
security.access_reader.variants.c971c5576914.png
security.camera.wall.variants.4740d0037d18.png
security.checkpoint.turnstile.variants.a3b3b0448201.png
storage.container.variants.abf390520c18.png
wall.exterior.modules.5d19a6ab0a49.png
wall.interior.modules.607eb7f59b6b.png
```

23 owner sheets, every one of them carrying
`"batchId": "owner-generated-2026-08-22"` in `public/game-content/source-art.v1.json`,
plus 3 published renders.

### 3.3 Which of those 26 a glob segment covers

Matching the eight segments of §1.1 against that listing, by hand and by id:

| Segment | File it covers |
|---|---|
| `floor.linoleum.institutional.*.png` | `floor.linoleum.institutional.788e81d4e081.png` |
| `wall.interior.modules.*.png` | `wall.interior.modules.607eb7f59b6b.png` |
| `door.interior.variants.*.png` | `door.interior.variants.055fa92eae37.png` |
| `furniture.cell.bed.single.variants.*.png` | `furniture.cell.bed.single.variants.45bfa2e0ab8d.png` |
| `rendered.fixture.cell.toilet_sink.*.png` | `rendered.fixture.cell.toilet_sink.bc8b067ea146.png` |
| `rendered.furniture.corridor.bench.variants.*.png` | `rendered.furniture.corridor.bench.variants.4afd4a1258e7.png` |
| `rendered.furniture.office.desk.employee.variants.*.png` | `rendered.furniture.office.desk.employee.variants.70767a391cbe.png` |
| `rendered.furniture.cell.locker.variants.*.png` | **none** |

Seven segments, seven files. The other **19 files in that directory are fetched
by nothing**, which is correct and deliberate — they are owner sheets no sprite
reads, and the lane's rule is that art nothing draws costs nothing.

### 3.4 The list and the sprite manifest agree exactly

```
$ grep -oE "assetId: '[^']+'" src/rendering/assets/environment-sprites.ts | sort -u
assetId: 'door.interior.variants'
assetId: 'floor.linoleum.institutional'
assetId: 'furniture.cell.bed.single.variants'
assetId: 'wall.interior.modules'

$ grep -oE "renderedArtId: '[^']+'" src/rendering/assets/environment-sprites.ts | sort -u
renderedArtId: 'fixture.cell.toilet_sink'
renderedArtId: 'furniture.corridor.bench.variants'
renderedArtId: 'furniture.office.desk.employee.variants'
```

Four plus three is seven, and they are the seven live segments. **The workflow is
in a consistent state: nothing is missing from the list today, and no batch is
half-released.**

### 3.5 The 23 Blender renders, which already exist and are committed

`assets/rendered/environment/` holds 23 PNGs and one manifest. This is the
finding that most changes what a first batch could be, so it is quoted in full.
Read out of `environment-objects.render.json` — produced by
`tooling/blender/render-environment-objects.py` from
`assets/source/blender/environment.mvp.catalog.blend` on Blender **5.2.1**, 256
px per tile, 6 % margin:

```
assetId                                   sizePx      footprintTiles  aspect drift  opaque px
door.interior.variants                    256x64      1x0.25          0             6180
door.security.variants                    256x64      1x0.25          0             6180
fixture.ceiling_light.panel.variants      255x102     1x0.4           0             19346
fixture.cell.toilet_sink                  256x256     1x1             0             20684
floor.concrete.variants                   512x512     2x2             0             211596
floor.linoleum.institutional              512x512     2x2             0             211596
furniture.cell.bed.single.variants        256x512     1x2             0             97972
furniture.cell.locker.variants            256x256     1x1             0             27786
furniture.cell.table_stool                512x256     2x1             0             69441
furniture.corridor.bench.variants         512x256     2x1             0             36713
furniture.office.desk.employee.variants   512x256     2x1             0             70296
furniture.reception.counter.variants      768x256     3x1             0             116093
furniture.visitor.chair.variants          256x256     1x1             0             13714
perimeter.fence.modules                   765x51      3x0.2           0             9215
perimeter.light.pole.variants             256x256     1x1             0             18694
perimeter.vehicle_gate.sliding.variants   1040x78     4x0.3           0             31633
perimeter.watchtower.variants             512x512     2x2             0             211536
security.access_reader.variants           102x51      0.4x0.2         0             2154
security.camera.wall.variants             153x102     0.6x0.4         0             6459
security.checkpoint.turnstile.variants    512x256     2x1             0             6495
storage.container.variants                512x256     2x1             0             92092
wall.exterior.modules                     512x64      2x0.25          0             25112
wall.interior.modules                     510x51      2x0.2           0             15964
```

**Publishing one of these needs no Blender.** `tooling/build-rendered-art-catalog.mjs`
copies the render, content-hashes it and writes it out under a `rendered.`
prefix — the three published renders' LFS pointers carry byte counts identical
to their sources (11,542 / 5,833 / 12,186), which is the copy being verbatim.
So for any of these 23 ids, the art already exists and the whole cost of
shipping it is a sprite definition, a row in `SPRITE_BY_OBJECT_ID`, a generator
run, **and one glob segment**.

### 3.6 The 20 catalogued objects, and their footprints

```
$ grep -oE "id: 'object\.[a-z-]+'.*footprint: \{ width: [0-9]+, height: [0-9]+ \}" src/content/object-catalog.ts \
    | sed -E "s/.*(id: 'object\.[a-z-]+').*(footprint: \{ width: [0-9]+, height: [0-9]+ \})/\1  \2/"
id: 'object.bed'  footprint: { width: 1, height: 2 }
id: 'object.medical-bed'  footprint: { width: 1, height: 2 }
id: 'object.toilet'  footprint: { width: 1, height: 1 }
id: 'object.sink'  footprint: { width: 1, height: 1 }
id: 'object.shower-head'  footprint: { width: 1, height: 1 }
id: 'object.washing-machine'  footprint: { width: 2, height: 1 }
id: 'object.desk'  footprint: { width: 2, height: 1 }
id: 'object.chair'  footprint: { width: 1, height: 1 }
id: 'object.stove'  footprint: { width: 2, height: 1 }
id: 'object.prep-counter'  footprint: { width: 2, height: 1 }
id: 'object.fridge'  footprint: { width: 1, height: 1 }
id: 'object.dining-table'  footprint: { width: 3, height: 2 }
id: 'object.bench'  footprint: { width: 2, height: 1 }
id: 'object.bookshelf'  footprint: { width: 2, height: 1 }
id: 'object.medicine-cabinet'  footprint: { width: 1, height: 1 }
id: 'object.security-console'  footprint: { width: 2, height: 1 }
id: 'object.storage-rack'  footprint: { width: 1, height: 1 }
id: 'object.loading-dock-door'  footprint: { width: 3, height: 1 }
id: 'object.waste-bin'  footprint: { width: 1, height: 1 }
id: 'object.utility-panel'  footprint: { width: 1, height: 1 }
```

Twenty rows. The four already drawn are `object.bed`, `object.toilet`,
`object.bench` and `object.desk`, read out of `SPRITE_BY_OBJECT_ID` in
`src/rendering/world/environment-art.ts`; the other sixteen are the fallback
list of §2.2, and the two lists are held equal by
`tests/unit/environment-art.test.ts`.

### 3.7 The negative, grepped under every spelling before it is asserted

The seven objects the fallback comment says have no art at all. Searched across
**both** source trees and the published tree, case-insensitively, on the object
noun and on synonyms:

```
$ for w in stove fridge refriger bookshelf shelf washing laundry medical medicine \
           cabinet console sink shower waste bin dining table utility panel rack; do
    printf '%-12s ' "$w"; find assets public -iname "*$w*" | tr '\n' ' '; echo; done
stove
fridge
refriger
bookshelf
shelf
washing
laundry
medical
medicine
cabinet
console
sink         assets/source/generated/fixture.cell.toilet_sink.png assets/rendered/environment/fixture.cell.toilet_sink.png public/game-content/source-art/fixture.cell.toilet_sink.18b4c51aa610.png public/game-content/source-art/rendered.fixture.cell.toilet_sink.bc8b067ea146.png
shower
waste
bin
dining
table        assets/source/generated/furniture.cell.table_stool.png assets/rendered/environment/furniture.cell.table_stool.png public/game-content/source-art/furniture.cell.table_stool.e23a5640a5f8.png
utility
panel        assets/source/generated/fixture.ceiling_light.panel.variants.png assets/rendered/environment/fixture.ceiling_light.panel.variants.png public/game-content/source-art/fixture.ceiling_light.panel.variants.30a39862f2f7.png
rack
```

Seventeen of the twenty spellings return nothing anywhere. The three that return
something return the toilet-sink column (already drawn as `object.toilet`), the
cell table-and-stool, and the ceiling light panel — none of which is a stove, a
fridge, a bookshelf, a washing machine, a medical bed, a medicine cabinet or a
security console.

---

## 4. A proposed first batch

**There is no first batch available today, and proposing one anyway would be
the expensive error this fleet keeps making in the other direction.** The
reasoning, per candidate class, so that a later reader can reopen it rather than
repeat it:

**Class A — a new object drawn from one of the 23 existing renders.** This is
the cheap batch, and it is the one #1020 already went looking for. That pass
examined all 22 unpublished renders against all 20 catalogued objects and found
exactly three worth their frame; one of the three (`object.storage-rack`) was
reverted the next day after a playtest looked at it on screen. Its conclusion is
quoted in §2.2: *"every other object either has no render at all, or the render
that shares its footprint does not read as the thing the object catalogue
names"*. **Every remaining candidate in this class has already been examined and
refused, on the record, by someone who could see the pixels.** Nobody in this
environment can see the pixels at all (§6), so there is no basis here on which
to reopen any of those refusals.

**Class B — a new terrain floor.** `floor.concrete.variants` fits `concrete`
exactly and is deliberately unmapped, because no code path can produce a
concrete tile: `SparseWorld.setTerrain` has no caller. Mapping it *"would add
2.3 MB to the first load to draw nothing"*. **This batch is blocked on terrain
painting, not on a glob.**

**Class C — a second wall or door kind.** `wall.exterior.modules` and
`door.security.variants` both have a sheet and a render. There are exactly two
edge values in the world's edge layers (§2.2), so there is nothing to key a
third `EDGE_ART_BY_NUMERIC_ID` row on. **Blocked on the simulation, not on a
glob.**

**Class D — new Blender art for one of the seven objects with none.** This is
the batch stage 7 actually owes, and it is the one `docs/ART_CONCEPT_PROMPTS.md`
was written for: prompt, check against the invariants table, model in
`assets/source/blender/environment.mvp.catalog.blend`, render through
`tooling/blender/render-environment-objects.py`, publish, **then** ask for the
glob. Steps 2 and 3 cannot happen here: Blender is not installed
(`command -v blender` → nothing), the `.blend` is an LFS pointer, and
`docs/ART_PIPELINE.md` records that CI has no Blender either and that the gate
therefore runs *"on a developer machine with the pinned Blender installed"*.

**So the glob request is premature.** What a first batch is waiting on is art,
not permission, and asking the owner now would spend their attention on a
release nothing can use — the same failure `AGENTS.md` records for the
2026-09-10 `branch-gc.yml` release, where *"the owner authorised more than was
required, and only half of it was used."*

### 4.1 What the first batch should be when it is possible, and how big

Recorded so the next session does not re-derive it. **Three ids, one room.** The
cell is where a player spends the first minutes and it is the room the object
catalogue makes mandatory objects for; `object.bed` and `object.toilet` are
already art there, and a cell's remaining un-drawn fittings are `object.sink`,
`object.shower-head` (shower room) and `object.waste-bin`. All three are 1x1,
which is the footprint the pipeline handles most simply and the one already
proven end to end by `object.toilet`.

- **Dependency:** none on each other; each is one sprite definition plus one row.
- **Player visibility:** highest available — every prison has cells before it has
  anything else.
- **Risk:** lowest available — 1x1 discrete objects, the exact shape the toilet
  lane already proved, and each is individually revertable (as `object.storage-rack`
  was) without touching the other two.
- **Size:** three ids, three segments, three renders in the low tens of KiB. One
  sitting.

**This is a plan, not a request.** It cannot be put to the owner until the three
renders exist.

---

## 5. The exact glob segments

**Nothing here is ready to send to the owner**, for the reason §4 gives. What
follows is the *form*, pinned exactly, so that when the art exists the request is
a substitution and not a fresh derivation.

### 5.1 The rule the form follows

A segment is, literally:

```
public/game-content/source-art/rendered.<renderedArtId>.*.png
```

for a render, and:

```
public/game-content/source-art/<assetId>.*.png
```

for an owner sheet. The `rendered.` prefix is load-bearing and is **not**
optional for a render: the owner's own sheet for the same id sits in the same
directory under the unprefixed name, and a segment without the prefix would
fetch that instead, decode it happily, and let the render ship as an unpulled
pointer. Segments are appended to the **existing comma-separated string** on the
one line quoted in §1.1, comma-separated, no spaces, no line break — the string
is one shell word and a line break inside it changes the argument.

The `<...>` is the id exactly as it appears in `environment-sprites.ts`, which is
exactly as it appears as `assetId` in `environment-objects.render.json`. Not the
simulation's `object.*` id. Not the filename's content hash.

### 5.2 The batch of §4.1, once its renders exist

The three ids are **not yet chosen** — they are named by whoever models them in
the `.blend`, and the catalogue's own naming convention
(`<group>.<place>.<thing>[.variants]`) is what constrains them. Written against
the convention, the three segments the batch of §4.1 would need are:

```
public/game-content/source-art/rendered.fixture.cell.sink.*.png
public/game-content/source-art/rendered.fixture.shower.head.*.png
public/game-content/source-art/rendered.fixture.cell.waste_bin.*.png
```

**These three strings are a prediction and must be re-derived from the real
`environment-objects.render.json` before they are shown to the owner.** A
mis-typed id here costs exactly what the brief says it costs: a red CI run and
another round. The derivation is mechanical and should be run rather than
retyped — for each id `X` that the batch adds to `environment-sprites.ts` as a
`renderedArtId`, the segment is `public/game-content/source-art/rendered.X.*.png`.

### 5.3 The one segment that will never be needed again

`rendered.furniture.cell.locker.variants.*.png` is already in the list and
matches nothing (§3.3). If `object.storage-rack` is ever remodelled and
republished under that same asset id, **it ships with no release at all.** That
makes a remodelled storage rack the single cheapest world-art batch in the
repository, and it is worth weighing against §4.1 when the art question is
reopened: it trades "highest player visibility" for "zero owner attention."

---

## 6. How a batch would be verified, here and on CI

### 6.1 What can be checked in this environment

Git LFS is not provisioned; every PNG is a pointer. So:

- `npx tsc -b` — **yes.** A sprite id naming art that does not exist fails the
  build, because every value in `SPRITE_BY_OBJECT_ID` is an `EnvironmentSpriteId`
  and that is a union of what `environment-sprites.ts` declares.
- `npx vitest run tests/foundation` and the unit suite — **yes**, including
  `tests/unit/environment-art.test.ts`'s declared-fallback check, which fails if
  the fallback lists and the registries disagree in either direction. This is the
  gate that makes "catalogued but undrawn" a red test rather than a silent hole.
- The glob segment's **text** against the id — **yes**, by grepping
  `environment-sprites.ts` and string-comparing. This is the check that is worth
  the most relative to its cost, because the id is the thing that gets mistyped.
- The catalog generator's own output — **partly.** It reads the source PNG, and
  `tooling/source-art-lfs-guard.mjs` exists precisely to refuse a pointer, so a
  generator run here fails by design rather than producing a wrong hash.

### 6.2 What cannot be checked here, at all

- **That the render decodes.** Every assertion in §1.2 is about bytes this
  environment does not have.
- **That the sprite reads as the thing it names on screen.** This is the bar
  #1020 set and #1059 enforced, and it needs a built prison at zoom 1 and zoom 3.
  It is also the bar every remaining Class-A candidate failed. **No agent in this
  environment may re-open one of those refusals**, and this document does not.
- `pnpm verify:assets` and the browser suite's *"the art is real image data"*
  assertion — both refuse a pointer, correctly, and so cannot run.
- **Whether the glob actually fetches.** `git lfs pull --include=` behaviour
  against the real remote is only observable on CI, and only after the owner's
  release lands.

### 6.3 So the verification plan for a real batch is

1. Here: `tsc`, the unit and foundation suites, and a string comparison of each
   proposed segment against the id the manifest declares.
2. On the owner's machine: the Blender render, and the on-screen legibility look.
3. On CI, after the release: the decode step's own per-file line —
   `<file>: <n> bytes` — is the proof, and its absence for an id is the failure.

---

## 7. Is producing the art in scope for an agent?

**No — not this art, not in this environment, and the second half of that is the
weaker constraint.**

- **The ruling forbids the shortcut.** A generated image is a concept reference
  and never a shipped sprite. The reason is mechanical: the two aspect checks in
  `tests/unit/environment-art.test.ts` are satisfied *by construction* by the
  Blender renderer (drift `0` on all 23 entries, §3.5) and by luck by anything
  else, and a Blender render can be reproduced byte for byte from a pinned
  toolchain while a generated image cannot be reproduced at all. *"If that
  changes, it changes in an ADR, not in a prompt."*
- **The pipeline is not here.** `command -v blender` returns nothing; the
  `.blend` is an LFS pointer; the pinned version is 5.2.1 and
  `pipeline_common.require_blender_version()` refuses any other.
- **The judgement is not an agent's either.** What refused every remaining
  Class-A candidate was somebody looking at a frame in a built prison. That is
  reproducible work, but not from a tree of pointer files.

**What is in scope for an agent, on a machine with Blender and LFS:** writing the
prompt (`docs/ART_CONCEPT_PROMPTS.md` already carries the template and the
invariants), modelling to the declared footprint, running the renderer, running
the catalog generator, adding the sprite definition and the registry row, and
computing the segment text. Everything except the two rulings the owner has
already reserved to themselves: what the art should look like, and the line in
`.github/workflows/ci.yml`.

---

## The weakest claim in this document

**That #1020's and #1059's legibility refusals are still the right answer, and
that Class A is therefore genuinely empty.** Those passes are quoted, dated and
specific, and one of them was corrected by a playtest within a day — which is
evidence the bar was applied seriously, and also evidence that it can move. This
document could not re-run either judgement: every render it reasons about is a
132-byte pointer here, and the closest it got to the pixels is an
`opaquePixels` count in a manifest. A session with LFS provisioned that looked at
`furniture.cell.table_stool` (2x1, 69,441 opaque pixels, unexamined by name in
either pass's written reasoning) against `object.dining-table` at 3x2 might find
something this one asserted was absent. It would still need to explain the
footprint, which does not match.
