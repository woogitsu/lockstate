# The five measurements five documents were owed

**Date:** 2026-09-01
**Branch:** `docs/the-measurements-that-were-owed`, cut from `origin/main` at `a64709f6` (v0.0.321);
`origin/main` at `46f70141` (v0.0.322) merged in afterwards, changing nothing any figure here reads.
**Instrument:** `tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts`, run with
`./node_modules/.bin/playwright test -c tests/browser/playwright.playtest.config.ts` in a
worktree with `git lfs checkout` done (`file public/assets/actors/actor.guard.base.idle.png`
→ `PNG image data, 260 x 3104`), so nothing here is a run with the sprites missing.

**Contention state.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"` returned
nothing before the first run and nothing between any two of them, and `ps -eo pcpu` showed the
only process above 1% CPU to be this session's own `claude`. Load average was 0.13 at the start
and 2.0–2.4 during and shortly after the browser runs — **that load is the runs' own** (Chromium
plus Vite plus the simulation worker on 4 cores), not another agent's suite. The three canaries
(#88, #285/#703, #331) were not run and are not implicated: nothing here touches `src/`.

**Claim tiers**, in this corpus's own vocabulary
(`2026-09-01-what-the-corner-and-strip-cost.md`): every figure below is **MEASURED** — a
`getBoundingClientRect`, a `clientWidth`, a `Range.getClientRects()` count or a `performance.now()`
stamp, taken in Chromium on the tree named above — unless the sentence says otherwise. The two
exceptions are marked where they appear: the "corner footprint" column in §2, which is measured
label widths plus a measured 214.31px of surrounding box, and the world-view arithmetic beside it.
Nothing here is derived from a declared CSS value.

Each of the five below closes with a **verdict** on the derivation that asked for it.

---

## What this note found before it found anything about the HUD

Two of the five had already been taken by other agents, on branches that are pushed but not on
`main`. The brief that commissioned this pass said nobody could take them; that was true when it
was written and is no longer true:

- **Measurement 4** (the funds badge) is taken on `origin/feat/name-the-rung-on-screen`, commit
  `74a48909`, in `tests/browser/ui-overdraft-badge.spec.ts`'s closing docblock. This pass
  re-took it independently, by a different method, and **reproduces every figure to the
  hundredth of a pixel** — see §4.
- **Measurement 5**'s ADR, `docs/adr/0086-what-refreshes-a-pulled-hud-readout.md`, was on
  `origin/docs/718-what-cadence-a-pulled-readout-has` and **not on `main`** when this pass started;
  it **landed on `main` while this pass was measuring it** (`dada4c8b`, v0.0.322). The runs below
  were taken at `a64709f6` (v0.0.321), one commit earlier, and `dada4c8b` changes nothing they
  observe: its `src/main.ts` diff is comments only — six sentences renumbered from "500ms for the
  next counts publication" to "255ms for the next clock heartbeat" — plus a foundation contract
  test, which is not the browser measurement §5 asks for. This branch has since merged
  `origin/main` at `46f70141` and the figures stand against it.

---

## 1. What the alerts row's label measures with a dismiss control on it

**Owed by** [ADR 0084](../adr/0084-what-the-alerts-channel-owes-a-player.md) decision 3, and by
the arithmetic block above `.hud-alerts__list > .ui-row` in `src/ui/hud/hud.css`, which derives
*"the label falls from 88px to about 36px, which is roughly five characters a line"* and
*"~330px of row height … one alert can be taller than the list box"*.

**Why nobody had it.** `ui-shell.spec.ts`'s `withSentences` fixture builds alerts with no
`occurrences`, and `hud.ts:1870` reads `const dismissible = alert.occurrences !== undefined` —
so every fixture row in the suite renders *without* a control and measures the pre-ruling
geometry. The instrument here puts `occurrences` on the rows.

### The row, at `--ui-scale: 1`, identical at 1920×1080, 1280×800, 1280×720 and 900×600

Selectors: `.hud-alerts__list [data-alert] .ui-row__label` (`clientWidth`), the row's
`:scope > .ui-icon`, its `.ui-badge`, its `.ui-icon-button`, and the row's own computed
`column-gap` and horizontal padding.

| severity | badge | control | **label** | label line boxes | row height |
| --- | --- | --- | --- | --- | --- |
| `danger` | 58.00px | 44px | **42px** | 26 | 407px |
| `warning` | 64.31px | 44px | **36px** | 27 | 422px |
| `info` | 38.59px | 44px | **61px** | 17 | 272px |
| `info`, **no** control (today's fixtures) | 38.59px | — | 113px | 7 | 122px |

The chain closes exactly, which is the check that the model in `hud.css` is the right model and
not a coincidence: row 200px − 16px padding = 184px of content = icon 16 + label + badge +
three 8px gaps + control 44. For the `warning` row: 16 + 36 + 64.31 + 24 + 44 = **184.31**.
Without the control it is two gaps and no 44: 16 + 87.69 + 64.31 + 16 = 184 — and 87.69 is
**#720's 88px**, so the 88px baseline is the *warning* row, and 88 − 52 = 36 is the same row
with the control on it.

### The label is a range, not a number, and `hud.css` states only one end of it

`.ui-row__label` is the only `flex: 1` child, so it absorbs whatever the badge does not take, and
the badge's width is the severity word. **36px is the worst case, not the case** — the same list
draws 42px and 61px on the rows beside it. Nothing in ADR 0084 or `hud.css` says so.

### One long alert against the list box

`hud.alert.refusal.zone.not-enclosed` is 109 characters; with `occurrences` the row's label is
that sentence plus `3× Day 17`, 119 characters.

| viewport | `.hud-alerts__list` clientHeight, one alert | that alert's row height |
| --- | --- | --- |
| 1920×1080 | 406px | 406px |
| 1280×800 | 333px | 406px |
| 1280×720 | 276px | 406px |
| 900×600 | 212px | 406px |

Eight such rows: `scrollHeight` **2,460px** against a `clientHeight` of 711 / 450 / 375 / 292px.
`overflow-y` is `auto`, so nothing is clipped and nothing is unreachable — exactly the "knowingly
over-subscribed" cost ADR 0084 states.

**Verdict: CONFIRMED, and the magnitude is understated.** The 36px figure is exact for the
severity it was derived at. The height is not: `hud.css` derives *"about five characters a line
… roughly 22 line boxes … ~330px of row height"*; the measurement is **4.5 characters a line, 26–27
line boxes and 407–422px of row**, ~25% taller than the derivation. "One alert can be taller than
the list box" holds at 1280×800, 1280×720 and 900×600; at 1920×1080 the alert and the box are the
same 406px, because with one row the list has not yet hit a cap.

---

## 2. The corner and the rail, for ADR 0085 decision 1

**Owed by** [ADR 0085](../adr/0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md)
decision 1 — *"What is not decided here: the exact width … the 109-character sentence's line
count at candidate label widths of 160, 200, 260, 320 and 400px, at all four viewports … and it
has not been taken"* — and by `2026-09-01-what-the-corner-and-strip-cost.md` §2, which could only
**derive** `.hud__rail` at ≈290px and said so.

### The line count, measured rather than modelled

A clone of the real `.ui-row--wrap .ui-row__label` — same element, same class chain, same
resolved font, `overflow-wrap` and line height — placed in the same list at an explicit width,
with line boxes counted by `Range.getClientRects()`. **Identical at all four viewports**, which is
D1's own point: the label's width is a function of the panel, not the viewport.

| label width | line boxes | rendered height |
| --- | --- | --- |
| 36px (today, with a control, `warning`) | **24** | 360px |
| 61px (today, with a control, `info`) | 15 | 225px |
| 88px (#720's figure, no control) | **11** | 165px |
| 160px | 6 | 90px |
| 200px | 5 | 75px |
| 216px | **4** | 60px |
| 260px | 3 | 45px |
| 320px | 3 | 45px |
| 400px | 2 | 30px |

The 88px→11 row reproduces **Finding D1 exactly** (*"eleven line boxes in an 88-pixel-wide
label, identically at 1920×1080, 1280×800, 1280×720 and 900×600"*).

### The rail, and the corner, at four viewports

`getBoundingClientRect().width`, on the **assembled page** (`/index.html`) — not only in the
`ui-harness`, because `hud.css:1604` records that the harness hands the rail more room than the
application does, and a width quoted off the harness would be a width of a page nobody loads.

| viewport | `.hud__rail` | `.hud__corner` | `.hud__corner .ui-panel` | world-view budget |
| --- | --- | --- | --- | --- |
| 1920×1080 | **288px** | 250px | 226px | 1382px |
| 1280×800 | **288px** | 250px | 226px | 742px |
| 1280×720 | **288px** | 250px | 226px | 742px |
| 900×600 | **288px** | 250px | 226px | **362px** |

(In the `ui-harness`, which mounts no save panel, the rail measures 288px at the first three and
**280px** at 900×600. The application's 288px is the figure to quote.)

### What a target width buys, from measured numbers only

Everything between the label and the corner's outer edge is fixed at 214.31px for a dismissable
`warning` row: 44 control + 24 gaps + 16 icon + 16 row padding + 64.31 badge + 26 panel chrome
(226 − 200) + 24 corner padding (250 − 226). So **corner = label + 214.31**, and the sweep above
reads as:

| corner footprint | label | line boxes for the 109-char sentence | world view at 900×600 |
| --- | --- | --- | --- |
| **250px (today)** | 36px | 24 | 362px |
| 302px | 88px | 11 | 310px |
| 374px | 160px | 6 | 238px |
| 414px | 200px | 5 | 198px |
| **430px (the ADR's guardrail)** | **216px** | **4** | **182px** |
| 474px | 260px | 3 | 138px |
| 614px | 400px | 2 | −2px |

**The 430px guardrail is internally exact, and this is worth recording.** ADR 0085 calls it
*"this document's own reasoning, not a measurement"* and states its rule as "do not cut the
900×600 world-view budget by more than half". Measured, that budget is 362px; half is 181px; a
430px corner leaves **182px**. The number the ADR reached by judgement is the number its own
stated rule produces from the measured budget, to one pixel. What stays unmeasured is the rule
itself — nothing in this repository has asked how much world view a player needs — so the
guardrail is confirmed as *consistent*, not as *right*.

**Verdict: the measurement ADR 0085 named is now taken, and it does not overturn the ADR.**
Direction A survives (the deficiency is identical at all four viewports, so a
breakpoint-gated cure still fails three of them). The `.hud__rail` figure the cost note could only
derive at ≈290px measures **288px** — a 2px derivation error, so §2's world-view budget table
(1380 / 740 / 740 / ≈360) was right to within 2px at every viewport. And the guardrail leaves the
longest sentence at **four line boxes**, which is the number the owner is actually choosing when
they accept or override 430px.

---

## 3. The strip's worst case after #723

**Owed by** ADR 0085 decision 2, and by `ui-strip-badged-width.spec.ts`'s own docblock:
*"How many chips it does return is a measurement, not an arithmetic, and this file is where it
should be taken."*

`EVERY_BADGE` as that file declares it — 178 prisoners with 36 unhoused, 42 understaffed and 36
unguarded, `incident-type.gang-retaliation.name`, `contraband.currency.name`. Badges drawn:
`36 with no bed`, `Unguarded`, `Gang Retaliation`, `Currency` — the four the file asserts, so
this is that state and not a near neighbour.

**Row content: 1,503.2px.** Chips, in declaration order, with the resolved 16px gaps:

| # | chip | width | badge |
| --- | --- | --- | --- |
| 1 | `prisoners` | 279.25px | `36 with no bed` |
| 2 | `high-risk` | 102.77px | |
| 3 | `staff` | 72.73px | |
| 4 | `coverage` | 185.70px | `Unguarded` |
| 5 | `rooms` | 81.14px | |
| 6 | `incidents` | 220.27px | `Gang Retaliation` |
| 7 | `contraband` | 194.28px | `Currency` |
| 8 | **`funds`** | 102.22px | |
| 9 | `earned-today` | 136.80px | |

| viewport | row clientWidth | chips fully on screen | dropped |
| --- | --- | --- | --- |
| 1280×720 | 1256 | **7 of 9** | `funds`, `earned-today` |
| 1280×800 | 1256 | **7 of 9** | `funds`, `earned-today` |
| 1440×900 | 1416 | 8 of 9 | `earned-today` |
| 1920×1080 | 1896 | 9 of 9 | — |
| 900×600 | 494 | 3 of 9 | six, `funds` among them |

An ordinary prison (`POPULATED`) measures 1,238px of content in the same 1,256px row and keeps all
nine at 1280 — so the row overflows only once the badges are drawn, exactly as #719 says.
The strip's height is 78.48px in both states at every desktop width and 48px at 900×600: **a
prison's state does not move the world's top edge**, which is the property
`ui-strip-badged-width.spec.ts` gates.

**Verdict: CONFIRMED, at the top of the predicted range.** The docblock reasoned the post-#723
worst case to **≈1,407–1,499px** under two models it said disagreed by ~90px; measured, it is
**1,503.2px**, 4px above the higher of the two. So the model anchored on the coverage badge's own
published `+140px` (≈1,499px) is the right one and the `{count} with no bed` anchor (≈1,407px) is
not. **`funds` is eighth of nine** — confirmed at the DOM, `chips.findIndex` over
`[data-metric]` — and it is one of the two chips actually lost at 1280, which is precisely
decision 2's premise.

---

## 4. The funds badge, and the owner's chosen wording

**Owed by** `2026-09-01-copy-variants-for-the-owner.md` §2c, candidate B2 —
`{remaining} left before deliveries stop`, 39 characters, *"+23 characters over the incumbent with
no measurement anywhere in this repository of whether that fits the badge"*.

Method: `POPULATED` with `treasuryOverdraftFloorMinorUnits` set to
`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` (−2,500) and the treasury below it, which is the only state
that draws this badge; then the candidate wording written into the badge's own text node before
the reading. Same element, same class, same padding, same resolved font — so the width is the
width that wording renders at. `src/` is untouched.

Selector `.ui-stat[data-metric="funds"] .ui-badge`; `.hud-strip__metrics` clientWidth 1256 at
1280.

| wording | balance | badge | FUNDS chip | row content @1280×800 | chips on screen | FUNDS on screen |
| --- | --- | --- | --- | --- | --- | --- |
| `{remaining} left` (`0 left`) | −2,500 | 46.95px | 125.77px | 1261.6 | 8 of 9 | yes |
| `{remaining} left` (`2,499 left`) | −1 | 73.20px | 150.97px | 1286.8 | 8 of 9 | yes |
| **candidate** (`0 left before deliveries stop`) | −2,500 | 179.94px | 258.75px | 1394.6 | 8 of 9 | yes |
| **candidate** (`2,499 left before deliveries stop`) | −1 | 206.19px | 283.95px | 1419.8 | **7 of 9** | **no** |

At 1440×900 the candidate keeps the chip on screen in both states (9 of 9 at the floor, 8 of 9 at
−1). At 1920×1080 it fits in every state. At 900×600 the chip is off the edge under **both**
wordings, which is #719 and not this ruling. The badge never wraps: one line box at every width
and both wordings.

**Verdict: the wording does not fit at 1280×800, and the owner has to hear that plainly.** The
candidate costs **+133px of chip** and pushes the FUNDS chip itself past the right edge of a
container whose scrollbar `hud.css:161-165` suppresses, for the whole four-digit range of the
remainder — present in the DOM, visible to nobody. The incumbent keeps that chip on screen in the
same states at the same viewport. This is not something to work around: narrowing the chip,
truncating the sentence or relying on the scroll a player cannot see would each be a worse answer
than the owner choosing again with these numbers in front of them.

**Independently confirms an existing measurement.** `origin/feat/name-the-rung-on-screen`
(`74a48909`) took this by editing the locale catalogue rather than the DOM, on a tree whose rung
was re-based, and published 46.95 / 73.20 / 179.94 / 206.19px of badge, 125.77 / 150.97 / 258.75 /
283.95px of chip, and rows of 1262 / 1287 / 1395 / 1420 against 1256. **Every one of those figures
is reproduced here to the hundredth of a pixel by a different method on a different tree.** Two
independent measurements agreeing is what this figure now rests on.

---

## 5. ADR 0086 §2's prediction

**Owed by** `docs/adr/0086-what-refreshes-a-pulled-hud-readout.md` §5 (on
`origin/docs/718-what-cadence-a-pulled-readout-has`, **not on `main`**), which names this as the
document's own weakest claim: *"open the Regime tab in a prison with two admitted, unhoused
prisoners, clock running at ×1, and record … `hud/prisoner-roster` request timestamps for 30 s.
The prediction from §3 is ~118 requests, no gap above 260 ms, and visibly moving need bars. A
result that disagrees falsifies this ADR's §2 and most of what follows."*

Method: the real application at `/index.html`, a prison built and populated with the mouse through
`playtest-harness.ts`'s `buildAndPopulate({ beds: 0, admits: 2, guards: 0 })` — an enclosed 6×6
cell with a toilet and **no bed**, so `occupiedPlaces === 0` and the counts channel has no
per-tick mover left in it. Clock set back to ×1 (`Play at normal speed`), Regime tab selected,
roster `data-total="2"` asserted. `Worker.prototype.postMessage` is wrapped in an init script that
stamps `performance.now()` on every `simulation/request-projection`; the playtest tee keeps the
messages but not their times, and the whole prediction is about times.

**Four runs.**

| run | requests / 30 s | shortest gap | median gap | longest gap | gaps > 260 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | **118** | 208.1 ms | 259.9 ms | **292.8 ms** | 58 |
| 2 | **118** | 220.5 ms | 259.0 ms | **290.1 ms** | 54 |
| 3 | **118** | 201.3 ms | 253.5 ms | **299.6 ms** | 46 |
| 4 | **119** | 89.5 ms | 257.6 ms | **293.1 ms** | 49 |

Gap histogram, run 4, 50 ms buckets: `{100: 2, 200: 9, 250: 92, 300: 15}`.

`hud/status-strip` was pulled the same number of times in the same window in every run (118, 118,
118, 119) — so this is the whole pull layer riding one heartbeat, not the roster alone.

**The need bars.** Read as text the answer is no: the row says `Idle Bladder Minimal` at both ends
of the window, because the word is a rung. Read as `data-need-permille`, which is what
`createSegmentedBar` is driven from, it is yes: **898 → 804 → 706** over the 30 s for one
prisoner and **875 → 776 → 678** for the other — ≈6.4 permille a second, so about one of the bar's
ten segments every 15 s.

**Verdict: §2's mechanism is CONFIRMED; §3's numeric gap bound is FALSIFIED, narrowly.**

- **The request count is exact.** 118 pulls in 30 seconds, three times out of four, in a prison
  whose `simulation/status-counts` channel publishes once and then falls silent. That is the
  ADR's central claim — *"the binding cadence of every pulled readout in the HUD is the clock
  heartbeat at 250 ms, not the counts channel"* — reproduced in a browser with a real render
  thread, and it holds.
- **"No gap above 260 ms" does not hold.** The median gap is 253–260 ms, and roughly **40–50% of
  the intervals exceed 260 ms**, with a worst case of **292.8–299.6 ms** across four runs. The
  harness said 255 ms because it has fake timers and no competing render thread; the browser adds
  ~5 ms of median drift and a ~40 ms tail.
- **This is the weak half of the ADR's own naming, not the strong one.** §5 says a disagreement
  falsifies §2 "and most of what follows", and its closing section ("The weakest claim, and what
  would change my mind") refines that to *"a result showing gaps well
  above 260 ms would push this ADR toward"* the harness-does-not-model-the-browser conclusion.
  300 ms against a 260 ms bound is 15% over, not "well above": a bound restated as **"no gap above
  ~300 ms at ×1 on a four-core container"** is what the browser supports. Nothing in §2's
  reasoning about *which channel* refreshes the readout is touched by it.
- **What the ADR should carry forward, and it is now urgent rather than tidy.** `dada4c8b` put
  the 255 ms figure into **seven places on `main`** as a bound a reader will take at face value:
  `src/main.ts:1185` (*"120 times, worst gap 255 ms"*), five interaction comments at
  `src/main.ts:1923`, `:1936`, `:1954`, `:1959`, `:1966` and `:1972` (*"waiting up to 255ms for the
  next clock heartbeat"*), and `docs/HUD_PROJECTIONS.md:554`. **255 ms is a fake-timer figure and
  the browser's real tail is 292.8–299.6 ms.** Nothing on that list is wrong about the mechanism
  and none of it is a promise to a player, so this note proposes no edit to `src/` — but the next
  pass that writes a budget, a poll timeout or a test bound against that number should take it
  from here and not from there.

  Concretely, the sentence those comments make — *"a player who presses this does not wait more
  than 255ms"* — is measurably a ~300 ms sentence on a four-core container at ×1.

---

## The instrument, and why it is not a spec

`tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts` is a `.playtest.ts` and
deliberately not a CI gate. Four of the five blocks report a figure whose whole purpose is to be
*changed* by the decision it informs — the corner's width, the badge's wording, how many chips
survive. `ui-strip-badged-width.spec.ts` already refuses to pin the last of those, for the reason
that applies to all four: *"An expectation reading '6 of 9 at 1280' would make the next person's
fix fail this file."* Each block does assert its own premise — the dismissable rows really carry
controls, the four-badge state really draws those four badges, the roster really holds two
prisoners — so an empty reading cannot be reported as a figure. **No case is made for promoting
any of it to a gate.**

### Three defects in the instrument itself, each found by reading a number rather than by a red run

Recorded because each of them would have produced a plausible, wrong figure:

1. **A view model with a negative treasury and no `treasuryOverdraftFloorMinorUnits` draws no
   FUNDS badge at all.** Eight readings came back "no badge", which would have been reported as
   *the badge is not there*.
2. **The HUD does not rewrite a badge whose view-model value has not changed**, so the candidate
   wording written into the badge's text node survived the next `setHudViewModel` and the next
   reading appended to it — a 1,301px badge reading the sentence seven times over. Every strip
   reading now remounts the shell.
3. **`.ui-row__icon` is not a class this codebase has.** `createListRow` appends
   `createIcon(...)`; every icon read 0px and the row's own arithmetic missed by exactly 16px.

### One observation about `src/`, reported and not acted on

`hud.ts` reuses an alerts row by `id` and builds the dismiss control **only** in the branch that
creates the row — a reused row gets `setLabel`, `setBadge` and `setActionLabel` and nothing else.
So a row that gains `occurrences` after it was first painted keeps its updated sentence and never
grows a control. **Not reachable from the live producer**: `simulation-events.ts` gives a row
`occurrences` from its first arrival (`count` starts at 1) and the refusal and protocol-fault rows
never gain them. It is recorded because it is what a measurement taken without a remount reports,
and because the asymmetry is one refactor away from mattering.
