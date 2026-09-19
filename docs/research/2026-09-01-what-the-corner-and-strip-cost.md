# What widening the corner or the strip would actually cost

**Date:** 2026-09-01
**Written for:** [ADR 0085](../adr/0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md), answering issues [#739](https://github.com/matmaxalez/lockstate/issues/739) (the alerts corner) and [#719](https://github.com/matmaxalez/lockstate/issues/719) (the status strip).
**Method:** source-level geometry off `hud.css`, `tokens.css`, `projection.ts` and `default-locale-en.ts` on this branch (cut from `origin/main` at `4ac09736`, v0.0.309), cross-checked against the already-measured figures in `docs/research/2026-09-01-playing-after-the-rulings.md` (§5, §5b, D1, D5, D6, D7, D9) and in `hud.css`'s own two-row block and `tests/browser/ui-strip-badged-width.spec.ts`'s docblock. **No Playwright was run in this pass** — another agent held the browser — so nothing below that needed a real layout engine was taken; it is either cited from an existing measurement or computed from declared CSS values and marked as such. §5 lists every measurement this document could not take, precisely enough to schedule.

## Claim tiers

- **MEASURED** — read directly off a cited playtest or browser-spec record, unchanged.
- **DERIVED** — arithmetic on declared CSS values (tokens, widths, paddings) in this tree. Real, but not a rendered pixel; a proportional or box-sizing surprise would falsify it, the way `.hud-minimap`'s declared `224px` renders at a measured `226px` (§1).
- **UNDERIVED** — stated because it is needed for a decision and nobody has measured it. Listed in §5 rather than guessed.

---

## 1. The corner's footprint, and why 224 declared renders as 226 measured

`.hud__corner` holds one panel, `.hud-minimap`, whose body stacks the minimap placeholder above the alerts section (`src/ui/hud/hud.ts:1307-1326`). Both live inside the same box:

- `.hud-minimap { width: calc(224px * var(--ui-scale)); }` (`hud.css:275`), and `--ui-scale: 1` by default (`tokens.css:281`).
- `.ui-panel` gives every panel `border: var(--hairline) solid var(--border);` (`primitives.css:459`) on top of that content width, in the default `box-sizing: content-box` this stylesheet never resets to `border-box` for `.ui-panel` itself. A `1px` hairline each side is `+2px`, which is exactly the gap between the declared **224px** and issue #720's independently measured **226px** (`.hud-minimap` at both 1280 and 1920). This document uses 226px as the panel's real rendered width and 224px only when quoting the token.
- `.hud__corner` itself adds `padding: var(--space-3)` — 12px — on all four sides (`hud.css:229-264`).

So the corner's total footprint is **226 + 24 = 250px**, at every viewport that does not hide it (720px and above; below that `.hud__corner { display: none; }`, `hud.css:3261`). This is not a derivation this document had to make — it is the exact figure the mobile-collision comment at `hud.css:3232` and `:3242` already measured twice (`250x127`, `250x380`) for an unrelated reason (what the corner collides with at 375×812), which cross-checks the arithmetic above independently.

**MEASURED** (via #720, cross-checked against `hud.css:3232`/`:3242`): corner footprint 250px at every desktop viewport.

Inside the panel, `.ui-panel__body` padding and the row's own icon/badge/gap consume the rest: issue #739's own measurement puts the label at 88–113px inside a 200×181 row inside a 226px panel, so roughly 26px of the panel's width is header/body chrome the label never gets, whichever badge word is beside it.

## 2. The right rail's footprint is a derivation, not a measurement, and this document could not close that gap

The four candidate cures for the corner (§3) are asked to cost "the queue rows and the Rooms/Staff panels" — which live in `.hud__rail`, on the opposite edge of the same `grid-area: middle` row (`hud.css:674-681`, `justify-self: end`; `.hud__corner` is `justify-self: start`). Both share the row only for *vertical* alignment: a grid area can hold more than one item, and neither constrains the other's width. So structurally, widening `.hud__corner` costs `.hud__rail` **nothing** — until the two footprints sum to the viewport width and visibly meet in the middle, which is a collision the game already has a documented instance of, just on the *other* axis (`hud.css:3210-3261`: below 720px wide, `.hud__rail` stretches and the corner is hidden specifically because the two collide).

The right rail's own footprint: `.ui-panel.hud-build`/`.hud-rooms`/`.hud-staff` are `width: var(--hud-rail-panel-width)` = `calc(264px * var(--ui-scale))` = 264px (`tokens.css:339`), each panel adds its own hairline border (+2px, same as §1) = 266px, and `.hud__side`'s `padding: var(--space-3)` (`hud.css:736`) adds another 24px. **DERIVED: ≈290px.** This is arithmetic on declared tokens, not a rendered measurement — no research record in this repository states `.hud__rail`'s outer `getBoundingClientRect().width` directly (the only `.hud__rail` figures on record, `572.3/652.3/932.3`, from the unmerged `fix/720-alerts-log-clipping` branch's comment, are **heights**, paired with a 396px-wide `.hud-build` content figure). §5 lists the measurement that would close this.

**World-view budget at the four viewports this decision is about** (viewport width − 250 corner − ≈290 rail), DERIVED from §1's measured figure and §2's own estimate:

| viewport | width | world-view budget (today) |
| --- | --- | --- |
| 1920×1080 | 1920 | ≈1380 |
| 1280×800 | 1280 | ≈740 |
| 1280×720 | 1280 | ≈740 |
| 900×600 | 900 | ≈360 |

At 900×600 the two side columns already claim exactly 60% of the viewport's width between them. That is the number that matters for how much slack candidate widths in §3 actually have to spend, and it is why every candidate below is costed against 900×600 explicitly rather than only against the widest viewport.

## 3. The corner: four candidates, costed

The label's own share of the corner today, from issue #739's measurement (§5, act 5b of the playtest record): **88–113px**, depending on which badge word sits beside it — identical at 1920×1080, 1280×800, 1280×720 and 900×600, because the corner never widens with the viewport. That is the deficiency every candidate below is answering, and it is present identically at three of the four desktop viewports this decision names; only 1920×1080 is a wide viewport in any sense a breakpoint could use.

### Candidate A — widen the rail (the whole corner, minimap included)

Grow `.hud-minimap`'s declared width. The minimap placeholder is `aspect-ratio: 1/1` off the frame's own width (`hud.css:241`, `:283`), so widening the panel widens the placeholder square too — as a side effect, not a separate cost.

| what it costs | figure | tier |
| --- | --- | --- |
| world view, per pixel widened | −1px per +1px, at every viewport | DERIVED (§2 arithmetic) |
| minimap placeholder | grows with the panel, `1:1`, so a wider corner is a *visibly bigger* minimap — likely a benefit, not a cost, since today's is a text-only placeholder | DERIVED from `hud.css:283` |
| queue rows, Rooms/Staff panels (`.hud__rail`) | **0px**, structurally, until corner + rail footprints reach the viewport width (§2) | DERIVED |
| world view at 900×600, corner widened to 450px total (+200px over today's 250) | ≈360 − 200 = **≈160px** | DERIVED |
| collision threshold with `.hud__rail` at 900×600 | corner would need to reach ≈610px total (+360px) before touching the rail's ≈290px | DERIVED |
| how many lines the 109-character sentence takes at a given label width | **UNDERIVED** — §5 item 1 | — |

This is the only candidate of the four that helps identically at all four desktop viewports, because it does not depend on a breakpoint. Its cost is a fixed pixel tax on the world at every moment, at every viewport, whether or not an alert is showing — which is exactly what issue #720's own enumeration (before #726) called out about this route, and it is still true.

### Candidate B — let the alerts row span wider than the minimap, without widening the minimap

Decouple `.hud-alerts__list`'s width from `.hud-minimap`'s: keep the placeholder square at its current 224/226px, and give the alerts section (or a container around it) a wider box of its own within the corner region.

| what it costs | figure | tier |
| --- | --- | --- |
| world view | same arithmetic as A, per pixel the alerts box is widened beyond the minimap's width | DERIVED |
| minimap placeholder | **unaffected** — this is the point of the candidate | — |
| queue rows, Rooms/Staff panels | 0px, same reasoning as A | DERIVED |
| layout cost | the corner becomes an irregular shape (a narrow column above a wider one, or an L), which nothing in this codebase's HUD does today — every other panel in `.hud__corner`/`.hud__rail` is a uniform-width column | UNDERIVED (no comparable element to cost against) |

Strictly better than A for a fixed alerts-box width, because it does not force a minimap the placeholder does not need to be wider than the alerts text — but it is a shape nothing here has built before, so its layout cost (does the wider alerts box read as belonging to the same corner, does it crowd the tab bar at narrow heights the way `hud.css:230-233` already had to guard the minimap against once) is not something this pass can price without seeing it built.

### Candidate C — move the alerts list out of the corner entirely

Two plausible destinations, each a real layout decision with its own cost, not evaluated further here because moving a list to a *specific* place is exactly the kind of thing this document should not choose:

- **Into `.hud__rail`'s aside slot** (`hud.css:711-718`, `HudHandle.asideSlot`). That slot is currently empty on every path this repository ships (nothing in `src/` fills it, per a grep of `asideSlot` callers). It already gets `flex: 1 1 0` of the rail's own height and `min-height: 25%` — so the alerts list would inherit the rail's **264px** content width, an 18px gain per row over today's 226px panel, at the cost of competing with the Build/Rooms/Staff panel below it for the rail's vertical budget, which `hud.css`'s own comment (`hud.css:2930-2936`) already treats as too tight to spend on a second thing at 900×600.
- **A new band of its own**, e.g. along the bottom beside the tab bar, or an overlay atop the world. Either is a real layout decision with its own collision risk (the tab bar is centred and the corner already had to be pulled to a row above it once, `hud.css:230-233`, to avoid exactly this kind of collision) and neither has a comparable element in this file to cost against.

**Cost table:** UNDERIVED across the board. This is the most structurally different of the four candidates and the one this pass is least equipped to price without a layout prototype.

### Candidate D — a two-column corner above some width

Lay the minimap and the alerts list side by side rather than stacked, only above a chosen breakpoint, the way `.hud-strip__metrics` already gets a row of its own above `(min-height: 701px)` and the strip's own one-row/two-row breakpoint sits at 2559px (`hud.css:3150`, `:2953`).

| what it costs | figure | tier |
| --- | --- | --- |
| helps how many of the 4 desktop viewports this decision names | **0 of 4**, if the breakpoint reuses the strip's own 1920–2559px band, since none of 1920×1080, 1280×800, 1280×720 or 900×600 is inside it; **1 of 4** (1920×1080 only) if set lower, at the cost of the two-column layout applying at a width nobody has measured it against | DERIVED (arithmetic on the four named viewports, not a rendered layout) |
| world view above the breakpoint | roughly the alerts box's added width, same arithmetic as A/B | DERIVED |
| below the breakpoint | **identical to today** — 88–113px, 11 lines, at three of the four viewports this decision is about | DERIVED |
| minimap placeholder, layout shape | UNDERIVED — no two-column HUD panel exists in this file to cost from | — |

This is the weakest of the four against the actual evidence in front of it: D1's finding is that the deficiency is present *identically* at 1920×1080 and at 900×600, because the corner's width has never depended on the viewport. A candidate that only helps above some wide threshold answers a version of the problem the playtest did not find — a narrow-viewport ticker — rather than the one it did.

## 4. The strip: what ruling 21 already fixed, and what it did not

Issue #719 was filed the same day as the owner's ruling 21 (#723, PR merged **after** #719: `git log` puts `8d495e62` — *"Make the standing overdraft visible, and shorten the coverage badge"* — at 2026-09-01 00:27+02:00, roughly seven hours after #719 opened at 17:31 UTC). So #719's own cost table, which prices the coverage badge at its **pre-ruling-21** length (`{understaffed} understaffed · {unguarded} unguarded`, +140px), describes a state ruling 21 already changed. **Route 1 of #719 — "shorten the coverage badge to the authored one-word state" — is done.** `coverageBadge` in `projection.ts:368-381` renders exactly one of `Understaffed` / `Unguarded` / (no badge, `Covered`), sourced from `hud.security.coverage-short` / `-unguarded` (`default-locale-en.ts:980`, `:982`).

**And the overflow persists anyway.** D9 (MEASURED, act 6 of the 2026-09-01 playtest, post-ruling-21): a twelve-prisoner, four-guard prison measured `scrollWidth 1320` in `clientWidth 1256` at in-game day 4, and **`1389` in `1256`** at day 7 once the `prisoners` chip's `8 with no bed` badge and the `contraband` chip's `Currency` badge joined the row — **133px over**, with only the ninth chip (`earned-today`) confirmed pushed off. That state carries none of the strip's most expensive badges (no named incident, no `understaffed`/`unguarded` word, no seven-figure treasury) — it is a mid-game state, not the worst one.

**The worst case is unmeasured post-ruling-21, and `ui-strip-badged-width.spec.ts`'s own docblock already says so.** Its `EVERY_BADGE` fixture (178 prisoners, 36 unhoused, a named incident at its widest word, a named contraband find, a seven-figure treasury) measured **1,627px** in 1,256px pre-ruling-21 (6 of 9 chips). The spec's author reasoned the post-ruling-21 figure to **≈1,407–1,499px**, explicitly two different linear models that disagree by ~90px, and wrote: *"How many chips it does return is a measurement, not an arithmetic, and this file is where it should be taken."* Nobody has taken it. §5 item 2 lists it.

**Order is drop order.** `HudMetricId` is declared, and rendered, in this order (`projection.ts:109-118`): `prisoners`, `high-risk`, `staff`, `coverage`, `rooms`, `incidents`, `contraband`, `funds`, `earned-today`. `.hud-strip__metrics` is `overflow-x: auto` with `scrollLeft` never set away from 0, so the chips that fall off the unscrolled edge are always the *last* ones in this list — which the 6-of-9 worst case confirms (`contraband`, `funds`, `earned-today` off) and the 8-of-9 mid-game case confirms again (`earned-today` off). **`funds` is the eighth of nine** — one of the two chips silently lost first in the worst measured case, in a game whose whole economy the owner has repeatedly treated as central (ADR 0017, 0049, 0075, 0083). `earned-today` is the one chip with no tone and no badge state at any reading this repository has taken.

## 5. What this document could not measure, listed for scheduling

Precise enough to run without further scoping, all with the assembled page (`index.html` + `src/main.ts`) unless noted:

1. **The corner-widening candidates' actual line count.** Render `hud.alert.refusal.zone.not-enclosed` (the 109-character sentence act 5b already used) through `.ui-row__label` inside `.hud-alerts__list`, at label-box widths of **160, 200, 260, 320, 400px** (i.e., corner/alerts-box content widths of roughly 186–426px once icon, badge and gaps are subtracted at each of the three badge-word widths §1 names), at each of 1920×1080, 1280×800, 1280×720 and 900×600. Method: `Range.getClientRects()` over the label's own contents, the same instrument act 5b used. Report line count and widest line per width per viewport.
2. **The current, post-ruling-21 `EVERY_BADGE` worst case.** Run `tests/browser/ui-strip-badged-width.spec.ts`'s existing `EVERY_BADGE` fixture (or the harness state it builds) at 1280×800, 1280×720, 900×600 and 1920×1080; report `scrollWidth`, `clientWidth`, and which of the nine chips are `fullyVisible`. This closes the 1,407–1,499px range the spec's own docblock leaves open, and it may already be captured by the spec's current assertions — if so, quoting its latest CI numbers is enough; no new run may be needed.
3. **`.hud__rail`'s outer width**, measured (`getBoundingClientRect().width` on `.hud__rail` itself) at each of the four viewports, to replace this document's ≈290px derivation (§2) with a real figure and pin the exact corner-widening collision threshold.
4. **Whether the alerts corner and the right rail ever visibly overlap** at any corner width up to, say, 500px total, at 900×600 specifically — the narrowest viewport where §2's world-view budget is tightest. A screenshot or `elementFromPoint` probe at the seam, the same method `hud.css:3232`/`:3242` already used for the mobile collision, would settle candidate A's outer bound directly rather than by derivation.

None of the four decisions in ADR 0085 is gated on all four of these; §3 and §4 say which candidate each measurement would sharpen.

## Weakest claim, and what would change it

**§2's ≈290px rail footprint is a derivation from declared tokens, not a measurement**, and every "0px cost to the rail" conclusion in §3 rests on it being roughly right and on the grid's `grid-area: middle` sharing actually behaving the way `hud.css:674-681`'s comments say it does. Item 3 in §5 is what would confirm or correct it; if the real figure is meaningfully larger (a scrollbar gutter, a rounding step this document did not account for), the "world view at 900×600" row in §3's tables moves, though the *structural* claim — that corner and rail do not compete for width except by visibly meeting — does not depend on the exact number and is read directly off the grid rules rather than derived.
