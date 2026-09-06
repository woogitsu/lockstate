# 2026-09-06 — Can you name the room?

**Played on `main` at `052531ae` (v0.0.506), art present, in a fresh worktree.
Three prisons built, one per palette. No `src/` change is committed by this
record and no `*.spec.ts` is added.**

**ADR 0098 — *What says which room this is*, Proposed, 2026-09-06** — names its
own weakest claim and then names the experiment that would falsify it. It is
cited by name rather than by relative link because it is not on `main`: it lives
on `agent/1021-adr-0098-room-legibility`, open as
[PR #1032](https://github.com/matmaxalez/lockstate/pull/1032) and unmerged, and
`tests/foundation/documentation-links-contract.test.ts` resolves every relative
link against this tree. The link becomes `../adr/0098-what-says-which-room-this-is.md`
when that branch lands.

> That comparing a **4.06 mean shift** against a **25.4 per-pixel spread** means
> what it sounds like. … **The arithmetic is exact; the inference to "a player
> cannot tell" is established nowhere in this repository.** If it is wrong,
> option A is the whole answer and options C and D are waste.

> It is falsified by rendering one prison under two palettes and asking someone
> to name the rooms — which is a play-test, not a code change.

This is that play-test.

**The claim survives, and so does the decision that rests on it.** 4.06 units is
not visible. Neither is 5.30, which is what eighteen evenly spaced hues buy for
the *worst* pair — so keying the tint by room id does not make rooms legible,
and ADR 0098's options C and D are not waste.

---

## Claim tiers used below

- **MEASURED** — produced by a run of the instrument named here, with its
  inputs, so the number can be reproduced.
- **VERIFIED, read** — a source file was opened; where a claim rests on the
  exact text, the text is quoted.
- **ARITHMETIC** — computed from constants that were opened, with no run behind
  it beyond the computation.
- **IMPRESSION** — what the committed screenshots look like to the agent that
  took them. It is a separate tier because it is the only tier that answers ADR
  0098's actual question, and because it is the weakest thing in this document.
  §8 names exactly how weak.

---

## 1. The tree, and the three commands that make any visual claim here admissible

A browser play-test passes with every sprite failing to decode, and every visual
conclusion from such a run is worthless. MEASURED, in the worktree this was
played in, before anything was built:

| command | answer |
| --- | --- |
| `file public/assets/actors/actor.guard.base.idle.png` | `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced` |
| `git lfs version` | `git-lfs/3.4.1 (GitHub; linux amd64; go 1.22.2)` |
| `du -sh .git/lfs` | `54M` |
| `git lfs ls-files \| wc -l` | `62`, none of them pointers |

That is `docs/AGENT_WORKFLOW.md` §2's **state 2**: the client is installed, the
objects are local, and the worktree already holds the real bytes. **No
`git lfs checkout` was needed and none was run.**

**The browser console held exactly one line in each of the three runs**, and it
is Phaser's version banner:
`log: %cPhaser v4.2.1 (WebGL | Web Audio)%c https://phaser.io/v4021 …`.
No decode error, no page error, nothing else.

`tests/foundation` on the clean tree before any edit: **`2 failed | 494 passed`**
— the stated baseline, unchanged, both failures in
`documentation-commit-citation-contract.test.ts`.

---

## 2. What was built, and how what was placed was verified

Instrument: **`tests/browser/playtest-2026-09-06-can-you-name-the-room.playtest.ts`**.
Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and only `playwright.playtest.config.ts` matches
`*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=<port> LOCKSTATE_PALETTE_LABEL=<label> \
  ./node_modules/.bin/playwright test \
  -c tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-06-can-you-name-the-room.playtest.ts
```

One prison per palette, identical geometry in all three, at 1440x900, dpr 1:

| room | category | tiles | screen at zoom 1 |
| --- | --- | --- | --- |
| **Canteen** | `food` | (12,11)–(17,16), 6x6 | x 464–848, y 130–514 |
| **Kitchen** | `food` | (18,11)–(21,14), 4x4 | x 848–1104, y 130–386 |
| **Reception** | `operations` | (18,15)–(21,18), 4x4 | x 848–1104, y 386–642 |

Canteen and Kitchen share the party wall at x=18; Kitchen and Reception share
the party wall at y=15. So the two adjacencies on screen are **the identical
pair** and **the 4.06-unit pair**, each with one wall between them.

### How placement was verified, which is the part a play-test gets wrong quietly

**Nothing was trusted to a label.** #1017's race — `armBuildable` reading an arm
label that can be stale — is fixed on `agent/1017-arm-buildable-race` and **not
on this tree**, so the label is never read as evidence here. Instead every
gesture is checked against the command it produced, which carries the identity:
`PlaceBuildOrder` carries `definitionId`, `x`, `y` and `edge`
(`src/main.ts:2595-2606`) and `ZoneRoom` carries `roomId`, `x`, `y`, `width` and
`height` (`src/main.ts:2718-2725`).

MEASURED, in all three runs:

- **46 of 46 wall edges verified** — right `definitionId` (`wall-brick`), right
  tile, right edge. **0 off-brand, 0 misplaced.**
- **3 of 3 rooms zoned**, each accepted on the first attempt, each `ZoneRoom`
  carrying exactly the rectangle asked for.
- `counts` immediately before any pixel was read: `rooms: 3`, **`staff: 0`,
  `prisoners: 0`**, `treasuryMinorUnits: 19400` (25,000 − 112 bricks × 40).
  That is what rules out an actor standing on a floor being measured, which
  matters because `NEW_PRISON_ORIGIN_TILE` is `{16,16}` (`src/main.ts:621`) and
  falls inside the Canteen.

### Two defects in the instrument's own first runs, kept because they are measurements

**a. Roughly a third of the world view cannot be built on with a drag, and
nothing says so.** MEASURED: of nine wall runs laid by mouse drag in the first
run, **three produced zero commands** — the drags that began at (112,66),
(112,450) and (80,482). The first is the status strip; the other two are
`.hud__corner`, the bottom-left minimap frame with the zoom island above it
(`src/ui/hud/hud.css:229`: `grid-area: middle; justify-self: start;
align-self: end`) and the alerts column under it. A gesture that begins on a HUD
island never reaches `WorldScene`, and the panel that ate it says nothing. Every
drag that began on clear canvas produced exactly the edges asked for, so this is
not the gesture failing — it is roughly **x 0–420, y 230–820 of a 1440x900
canvas** being unbuildable by drag while looking exactly like world.

The instrument now places walls through the Build panel's numeric route instead,
and probes nine points of every crop it takes with `document.elementFromPoint`
before taking it. That probe is why the Canteen's floor is trustworthy here: in
the run before it, the same crop came back at mean RGB **84.39 / 85.66 / 90.42**
with a per-pixel σ of **54.59** — a photograph of a panel, not of a floor, and a
number that would have been reported as a palette measurement.

**b. "Use these tiles" does not zone anything.** VERIFIED, read:
`.hud-rooms__coordinates-submit`'s handler is
`adoptPendingArea(next, options.classifyArea(next))`
(`src/ui/hud/rooms-panel.ts:845-858`) — it makes the rectangle *pending*.
`.hud-rooms__confirm` is what submits `ZoneRoom`. Pressing only the first
produced no command at all **and left the refusal band showing a stale line from
the earlier calibration presses** — *"Nothing was removed — there is no object
on that tile, and none being built there."* — which reads exactly like a refusal
of the zoning and is not one. That is a real trap for a player too, and it is
§7's second finding.

---

## 3. Q1 — can the identical pair be told apart? No, and the pixels say why not

`zoningTint` throws the room away and keys on its category:

`return ZONING_TINT_BY_CATEGORY[room.category];`
(verbatim in `src/rendering/world/appearance.ts`, at `:118`)

so a Kitchen and a Canteen are not *close* — they are **the same colour, over
the same floor image**, `env.floor.institutional` for every room
(`src/rendering/world/environment-art.ts:156-161`).

MEASURED, shipped palette, over the interiors inset half a tile on every side so
no wall, wall shadow or boundary pixel enters the sample:

| room | category | sample | mean RGB | per-pixel σ |
| --- | --- | --- | --- | --- |
| Canteen | `food` | 102,400 px | 129.20 / 129.25 / 132.96 | 15.89 / 13.56 / 10.73 |
| Kitchen | `food` | 36,864 px | 130.78 / 130.47 / 133.62 | 18.62 / 15.86 / 12.42 |
| Reception | `operations` | 36,864 px | 130.78 / 134.04 / 133.62 | 18.62 / 15.27 / 12.42 |

**Canteen against Kitchen: ΔRGB −1.58 / −1.23 / −0.66, Euclidean 2.11.** The
arithmetic says 0.00, and the 2.11 is not tint: the two crops are different
sizes over a floor that tiles once per tile, so they sample different parts of
the same texture. **That 2.11 is this instrument's measurement floor**, and
every figure below should be read against it.

IMPRESSION, from `shipped/seam-canteen-kitchen-x3.png` — the party wall between
them, at 3x nearest-neighbour so no pixel is invented: **the two floors are one
material.** There is nothing to tell apart. Two rooms, one colour, and the only
thing on screen that says they are two rooms is the wall the player built.

---

## 4. Q2 — is 4.06 units visible? **No.** This is the answer the ADR was waiting for

MEASURED, shipped palette, Kitchen (`food`) against Reception (`operations`),
the tightest of all 55 pairs on screen:

**ΔRGB 0.00 / −3.57 / 0.00 — Euclidean 3.57.**

Two things about that line are worth more than the number:

- **The red and blue deltas are exactly zero.** `food` is `0xd0854f` and
  `operations` is `0xd0a24f` (`src/rendering/world/appearance.ts:85-96`); they
  differ in green alone, by `0xa2 − 0x85 = 29`. The renderer reproduces that
  exactly: the whole difference is in green and the other two channels do not
  move by a hundredth of a unit. The composite is the one the arithmetic
  assumes.
- **The rendered difference is 12% smaller than the arithmetic.** ARITHMETIC
  says `29 × 0.14 = 4.06`; MEASURED gives 3.57, a ratio of **0.879**. The same
  ratio appears in the option A run below (5.30 measured against 6.02 predicted,
  **0.880**), so it is a property of the pipeline and not noise — the crop
  includes tile-grid and edge pixels drawn over the tint, which dilute the mean.
  **ADR 0098's effective-unit table is therefore optimistic by about an eighth
  throughout.**

**Against a mean per-pixel σ of 15.54 across the two rooms, 3.57 units is 0.23
σ.** ADR 0098 measured the floor's own spread by box-averaging the source crop
down to one tile and got σ 8.55 / p5→p95 25.4; measured here off the actual
framebuffer at zoom 1 it is **σ 15.3–18.6 per channel**, roughly twice as noisy
as the ADR's estimate. The signal-to-texture ratio the ADR called "roughly six
times the signal" is, on screen, worse than that.

**IMPRESSION, and it is unambiguous.** In `shipped/seam-kitchen-reception-x3.png`
— the two rooms directly across their party wall, magnified 3x, which is the
most favourable presentation this difference will ever get — I cannot tell the
Kitchen from the Reception. Not "it is subtle": there is no cue. The same holds
in `shipped/zoom1-three-rooms.png` (all three rooms in one 656x528 crop), in
`shipped/zoomed-in-full-page.png` (zoom 3.0, a 192px tile) and in
`shipped/zoomed-out-full-page.png` (the whole prison at once). At every zoom the
prison reads as **one continuous grey-blue linoleum floor divided by walls.**

**So the answer ADR 0098 asked for is: the arithmetic means what it sounds like.
A player cannot tell.** Its weakest claim is not falsified, its decision 3 is not
over-stated, and options C and D are not waste.

---

## 5. Q3 — would keying by room id be enough? **No, and that is the second result**

Two alternative palettes were applied as **local, uncommitted edits** to
`src/rendering/world/appearance.ts` in two throwaway worktrees, and the same
instrument was run against each. **Neither edit exists on this branch**; the
generator and the patch script live in the agent's scratch directory, and the
tables are reproduced below so the run can be repeated.

- **Option A — eighteen evenly spaced hues**, keyed by room id, at the palette's
  own `s = 0.62, v = 0.82`, in `numericId` order. Kitchen and Canteen land 20°
  apart, which is the nearest-neighbour gap and therefore the worst case.
- **Option B — eleven hue families**, the category fixing the hue and the
  member's position fixing the value (ramp 1.0 / 0.70 for a pair, 1.0 / 0.79 /
  0.58 for the three logistics rooms), which is what ADR 0098's option B
  describes.

MEASURED, the same three rooms, the same crops, the same run:

| pair | shipped | option A | option B |
| --- | --- | --- | --- |
| Canteen vs Kitchen (identical today) | **2.11** | **7.35** | **12.05** |
| Kitchen vs Reception (the 4.06 pair) | **3.57** | **5.30** | **3.57** |
| Canteen vs Reception | 5.09 | 12.62 | 14.27 |
| mean per-pixel σ of the pair | 15.54 | 15.31 | 15.54 |

**IMPRESSION, option A** (`optionA/seam-kitchen-reception-x3.png`,
`optionA/seam-canteen-kitchen-x3.png`, `optionA/zoom1-three-rooms.png`): the
whole prison is now teal instead of blue-grey, and **the three rooms are still
indistinguishable from one another.** At 5.30 units the Kitchen/Reception seam
is exactly as invisible as the 3.57 it replaced. At 7.35 the Canteen looks, if
anything, a hair greener than the Kitchen — I would not bet on it and I could
not name which was which without the wall to count from.

**IMPRESSION, option B** (`optionB/seam-canteen-kitchen-x3.png`,
`optionB/zoom1-three-rooms.png`): the Canteen is *just* perceptibly darker than
the Kitchen at 12.05 units — the first difference in this whole pass that I can
see at all, and it is still marginal, about 0.8 σ. And the Kitchen/Reception
pair is **unchanged at 3.57**, because option B moves value within a family and
`operations` and `food` are different families 13.5° apart.

**So: keying by room id closes the collision and does not buy legibility.**
ADR 0098 decision 3 says exactly that from arithmetic; this is the same
conclusion from pixels and from looking.

### An arithmetic bound this pass adds, which decides how far option A can ever go

ARITHMETIC, reproducing ADR 0098's own table first as a check (tightest
`operations`/`food` **4.06**, then 6.02, 6.51, 6.82; median of the 55 **17.15**;
widest **29.26**; ten of eleven rows at exactly `s = 0.620, v = 0.816` with
`administration` alone at `s = 0.123, v = 0.639` — all reproduced exactly), and
then extending it:

**Eighteen hues spaced evenly on one circle at `s = 0.62, v = 0.82` give a
tightest pair of exactly 6.02 effective units, and there is no ordering that
does better.** The nearest-neighbour gap is 360/18 = 20°, and 20° at that
saturation and value is 43.0 raw, which through `ZONING_TINT_ALPHA_OVER_ART`
is 6.02 — and 5.30 once the pipeline's 0.879 is applied.

| hue gap | effective units through 0.14 |
| --- | --- |
| 10° | 3.02 |
| 13.5° — today's `operations`/`food` | 4.08 |
| **20° — eighteen evenly spaced** | **6.05** |
| 30° | 9.07 |
| 60° | 18.15 |
| 90° | 20.29 |
| 180° | 31.44 |

So option A's ceiling for its worst pair is 6.02 arithmetic / 5.30 measured, and
**5.30 was rendered and looked at in this pass and is invisible.** The bound is
not a forecast; the experiment is in `optionA/`.

**And a cost of option B nobody had priced.** ARITHMETIC over all 153 pairs of
the eighteen: darkening a family's second member walks it into *another
family's* neighbourhood. Option B's own five tightest pairs become **4.06**
(Reception vs Kitchen — untouched), **4.20** (the darkened Security Office
against the darkened Canteen, `0x923f37` against `0x925d37`, **a collision that
does not exist today**), 5.78, 6.02, 6.04. ADR 0098 reports 4.36 for B's worst pair; the
difference is the value ramp and not the argument — under either ramp the
`operations`/`food` pair is exactly where it was, and under this one a new
sub-5-unit pair is created.

---

## 6. Q4 — the legend. Not the same defect: a worse one

#1021's comment and ADR 0098 Context §3 both say the catalogue swatch uses the
same `zoningTint`, so *"Kitchen and Canteen are adjacent rows of identical
colour"*. VERIFIED, read, and the second half of that is wrong in the direction
that matters: **there is no swatch.**

The tint really is computed for the catalogue —
`tint: zoningTint(definition.numericId) ?? 0,` (`src/main.ts:980`) — and it
really does travel to the interface as `readonly tint: number;`
(`src/ui/hud/view-model.ts:1066`), whose docblock states the intent in its own
words: *"The colour the world tints this room's tiles, so the catalogue row and
the designation on the map agree without the player having to learn a legend."*

**Nothing reads it.** `grep -rn '\.tint\b' src/ tests/` over the whole tree at
`052531ae` returns no hit outside this play-test's own comment. The catalogue row
is built at `src/ui/hud/rooms-panel.ts:646-649` as
`createListRow({ icon: 'rooms', label: t(room.labelKey), … })` — one literal icon
id for all eighteen rows — and `ListRowOptions`
(`src/ui/primitives/list-row.ts:16-39`) has **no colour field of any kind** to
pass one to.

MEASURED in the live DOM, reading `getComputedStyle` over every
`.hud-rooms__list [data-room]` row and every descendant: **all eighteen rows
carry byte-identical colours** — `color: rgb(219, 226, 233)`,
`background-color: rgba(0, 0, 0, 0)`, one shared border colour, no `fill`
anywhere. `shipped/rooms-catalogue.png` and `shipped/build-catalogue.png` are the
pictures.

So the legend does not repeat the map's collision. It carries **no colour at
all, for any room** — which means the sentence the view model gives as its own
purpose is not true of the shipped interface, and a player who wanted to learn
the eleven tints has nowhere to learn them from.

---

## 7. Q5 — what else playing showed

1. **The zoning refusal is good, and worth saying so.** *"The room was not zoned
   — this room type must be enclosed, and the area you drew is open on at least
   one side."* It names the rule, the verdict and the reason in one sentence,
   and it was right every time it fired.
2. **The refusal band keeps a stale sentence and the Rooms panel does not clear
   it.** After a successful designation the band still read *"Nothing was
   removed — there is no object on that tile, and none being built there."* from
   a calibration press many seconds earlier. Beside a two-press zoning flow whose
   first press produces no visible outcome, that is a sentence that will be read
   as a refusal of the thing that just succeeded.
3. **"Use these tiles" is a promise the control does not keep on its own.** It
   only stages the rectangle; nothing on the button says a second press is what
   zones. §2(b) has the code.
4. **The Rooms panel names one room instance at a time.** With three rooms all
   short of something it read `NOT READY 3 of 3` and then detailed only
   *"Canteen at 12, 11 is missing / a door — nobody can get in / 2 × Dining
   Table 4 × Bench"* — `ROOM_NEEDS_ROOMS_LIMIT = 1`
   (`src/ui/hud/rooms-panel.ts:407`). A player with three unfinished rooms is
   told about one of them.
5. **Nothing else on screen names a room, and this pass re-checked it rather
   than citing it.** `src/rendering/` contains **no text object of any kind** —
   no `add.text`, no `BitmapText`, no `setText` — and no `tooltip`, `pointerover`
   or `title` attribute anywhere under it. The minimap is the string *"Minimap is
   not available yet"*. So the tint really is the only thing the map has.
6. **A prison with three finished rooms and no door is not flagged as
   unreachable anywhere but in that one Rooms line.** The world drew a sealed
   building with no way in, cheerfully, at every zoom.

---

## 8. The weakest claims in this record, named

1. **One pair of eyes, and they are not a player's.** Every IMPRESSION above is
   an agent reading a PNG. That is enough to settle *"is there a visible
   difference at all"* in the negative — the shipped and option A pairs are not
   subtle, they are absent — and it is **not** enough to settle where the
   threshold lies. If the owner looks at `optionB/seam-canteen-kitchen-x3.png`
   and sees two obviously different rooms, then 12 units is legible and option B
   is closer to sufficient than §5 says.
2. **The measurement floor is 2.11 units.** Two crops of different sizes over a
   floor that tiles once per tile do not sample the same texture, so any figure
   below about 2 units in the Canteen column is at the noise. It does not touch
   the Kitchen/Reception figures, which share crop geometry exactly and come
   back with ΔR and ΔB of exactly zero.
3. **One viewport, one interface scale, one theme.** 1440x900, dpr 1, interface
   scale 100%, the shipped dark theme. A high-DPI screen resamples, a bright room
   changes the eye's operating point, and neither was tested.
4. **The 0.879 attenuation is measured twice and explained once.** It is
   consistent across two palettes (3.57/4.06 and 5.30/6.02) so it is real; the
   attribution to grid and edge pixels drawn over the tint is a reading of the
   crop, not something this pass isolated.
5. **The palette experiment is not the palette anyone would ship.** Option A and
   option B are the schemes ADR 0098 names, generated mechanically. A designer
   choosing eighteen colours by eye would do better than an even 20° spacing —
   though not by much, because §5's bound is about the circle and not about the
   ordering.

## 9. What this pass did not reach

- **Anything about a *player*.** Open question 1 of ADR 0098 asks for somebody
  naming rooms off a screenshot. Three prisons are committed here for exactly
  that; nobody has been asked yet.
- **Colour-vision deficiency.** A palette that spends only hue is the palette
  most exposed to it, and nothing here simulated a single deficiency type.
- **The other three colliding categories.** Only `food` was built. `housing`,
  `security`, `hygiene`, `recreation` and `logistics` were reasoned about from
  the same table and never rendered.
- **Raising the alpha.** `ZONING_TINT_ALPHA_OVER_ART = 0.14` was left alone in
  all three runs, because `appearance.ts:100-110` argues it down from 0.28 for a
  stated reason and testing that is a different experiment. What §4 does
  establish is that the *whole* channel is thinner than the ADR thought, by the
  0.879.
- **Zoom 0.2.** The zoom-out screenshots are three presses out, not the floor of
  `ZOOM_BOUNDS`.
- **Whether the HUD occlusion in §2(a) is a defect or a layout.** It was measured
  and reported; nothing here decides what the fix is, and `src/ui/hud/**` is
  another agent's surface today.

---

## What would change my mind

- **The owner seeing a difference in `optionB/zoom1-three-rooms.png`.** §8's
  first weakest claim is a person's to settle, and the images are committed so
  that it costs one look.
- **A palette that spends saturation as well as hue and value.** Every option
  costed here moves within the one circle `ZONING_TINT_BY_CATEGORY` already
  sits on. The measured ceiling of the channel is `255 × 0.14 = 35.7` and the
  widest shipped pair is 29.26, so there is not much room — but nothing tried
  the third dimension.
- **A second mark.** §4 says the tint cannot carry identity. It does not say
  what can, and ADR 0098's options C and D are now the live ones rather than the
  wasteful ones.
