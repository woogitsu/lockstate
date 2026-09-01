# ADR 0085: What the HUD's alerts corner is for, and what the status strip may drop

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0085, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076 and 0083 each pre-committed.
>
> **The sweep was performed rather than asserted.** `git fetch origin
> '+refs/heads/*:refs/remotes/origin/*'` then `git ls-tree --name-only <ref> --
> docs/adr/` over all **388** heads `git ls-remote --refs --heads origin`
> returns. Maximum on any of them: **0083**, on `origin/main` and on every
> other head that carries any ADR at all — `refs/remotes/origin/adr/0082-*`,
> every `agent/*`, `feat/*`, `fix/*`, `playtest/*`, `wip/*` and `docs/*` head
> checked carries 0083 as its highest number, and nothing carries 0084 or
> 0085 anywhere. `docs/adr/README.md`'s stated **Next free number: 0084** (as
> of this branch's cut, `4ac09736`, v0.0.309) is therefore consistent with the
> sweep rather than contradicted by it: 0084 was assigned to another agent's
> draft before this one was cut, and an unpushed assignment is exactly what a
> sweep of pushed heads cannot see — the same shape ADR 0083's own header
> records for `agent/build-order-execution-order` holding 0082. This document
> takes **0085**, one past the assignment it was told to skip, and reports
> that the sweep does **not** disagree with that skip, only that it cannot
> confirm 0084 is actually held anywhere yet.

## Status

**Proposed, 2026-09-01. Not self-approved.**

It answers issues [#739](https://github.com/matmaxalez/lockstate/issues/739)
(the alerts corner) and [#719](https://github.com/matmaxalez/lockstate/issues/719)
(the status strip), both of which are filed as decisions rather than defects —
each enumerates its own candidate cures and declines to choose among them. This
document is the choosing.

## Context

### The corner: a 226px box that has not widened since it existed

`.hud__corner` holds one panel that stacks a minimap placeholder above the
alerts log (`src/ui/hud/hud.ts:1307-1326`). The panel is `calc(224px *
var(--ui-scale))` (`hud.css:275`), which renders at a measured **226px**
including its hairline border — confirmed independently twice, by issue #720's
own measurement and by the mobile-collision comment's `250x127`/`250x380`
footprint figures (`hud.css:3232`, `:3242`; corner footprint = panel + 24px of
`.hud__corner`'s own padding). It has been this width at every viewport the
browser suite visits since before #720 was filed, and #726's fix (wrapping the
label instead of clipping it) changed *how* the box fails and not its size.

**Finding D1** (`docs/research/2026-09-01-playing-after-the-rulings.md`,
MEASURED, act 5b): the longest sentence in the refusal namespace — 109
characters, `hud.alert.refusal.zone.not-enclosed` — renders as **eleven line
boxes in an 88-pixel-wide label**, identically at 1920×1080, 1280×800, 1280×720
and 900×600, because the label's width is a function of the panel, not of the
viewport. At 900×600 a single such alert overflows the list's own box as well —
44px of the row's 181px is below the fold, behind a suppressed scrollbar.

Four of the owner's rulings of 2026-08-31 deliver into this list — ruling 1
(the fold opens by default), ruling 11 (severity-based eviction keeps the
worst rows), rulings 3 and 13 (the refusal sentences were authored precisely
to name what was found or what was wrong) — and `MAX_EVENT_ALERT_ROWS = 8`
with severity-graded eviction (`simulation-events.ts:335`, `:413-443`) is
itself evidence about what this list is *for*: a ticker that discards old rows
regardless of importance would have no use for a severity-graded eviction
policy. Grading by severity is what a log a player refers back to needs, and
is wasted design effort on a ticker nobody reads past the newest line.

### The strip: ruling 21 fixed the coverage badge, and the row still overflows

Issue #719's own cost table prices the `coverage` badge at its **pre-ruling-21**
length — `{understaffed} understaffed · {unguarded} unguarded`, +140px — but
`#723` (merged `8d495e62`, 2026-09-01 00:27+02:00, **after** #719 was filed at
17:31 UTC the prior day) already shortened it to one authored word:
`coverageBadge` (`src/ui/hud/projection.ts:368-381`) renders exactly one of
`Understaffed` / `Unguarded` / nothing (`Covered`), from
`hud.security.coverage-short` / `-unguarded`
(`src/content/default-locale-en.ts:980`, `:982`). **#719's route 1 is done.**

**And the overflow persists regardless.** D9 (MEASURED, act 6, post-#723): a
twelve-prisoner, four-guard prison measured `scrollWidth 1389` in `clientWidth
1256` at 1280×800 once the `prisoners` chip's `8 with no bed` badge and the
`contraband` chip's `Currency` badge joined the row — **133px over**, with
only the ninth chip (`earned-today`) confirmed pushed off — and that state
carries none of the strip's most expensive badges. `tests/browser/ui-strip-badged-width.spec.ts`'s own docblock reasons the true post-#723 worst
case (`EVERY_BADGE`: 178 prisoners, 36 unhoused, a named incident, a named
contraband find, a seven-figure treasury) to **≈1,407–1,499px** against 1,256,
under two models that disagree by ~90px, and says outright: *"How many chips
it does return is a measurement, not an arithmetic, and this file is where it
should be taken."* Nobody has taken it (`docs/research/2026-09-01-what-the-corner-and-strip-cost.md` §4, §5 item 2).

`.hud-strip__metrics` is `overflow-x: auto` with `scrollbar-width: none` and a
suppressed WebKit scrollbar (`hud.css:161-165`). Chips overflow off the
unscrolled right edge in declaration order (`prisoners`, `high-risk`, `staff`,
`coverage`, `rooms`, `incidents`, `contraband`, `funds`, `earned-today` —
`projection.ts:109-118`), so the chips lost first are always the last-declared
ones — confirmed in both the measured 8-of-9 case (`earned-today` off) and the
pre-ruling-21 6-of-9 worst case (`contraband`, `funds`, `earned-today` off).
**`funds` is eighth of nine.**

## Decision 1: the corner is a log, and it must widen

**The corner is not a deliberate ticker.** A ticker that discards its oldest
row regardless of importance has no use for `MAX_EVENT_ALERT_ROWS`'
severity-graded eviction (ruling 11); the fold opening by default (ruling 1)
and the sentences being authored to *name* what happened (rulings 3, 13) are
both effort spent on the assumption that a player reads this list, not glances
past it. Nothing in the evidence supports "the 226px width is intentional and
the sentences should be shorter" — the sentences were lengthened *the same
week* the width was never revisited, by the same rulings this list exists to
carry. **The 226px width is the part that was never decided, not the part
that was.**

### The four candidates (full cost tables: `docs/research/2026-09-01-what-the-corner-and-strip-cost.md` §3)

| candidate | world view | minimap placeholder | rail (queue rows, Rooms/Staff) | helps at 900×600 / 1280×720 / 1280×800 / 1920×1080 |
| --- | --- | --- | --- | --- |
| A. widen the whole corner | −1px per +1px widened, every viewport, always | grows with it, `1:1` — a benefit for a placeholder that already says a real minimap will draw here | 0px, structurally, until footprints meet (§2 of the research note) | all four, identically |
| B. widen only the alerts box, keep the minimap's size | same, only while an alert box is actually wider | unaffected | same as A | all four, identically |
| C. move the list out of the corner | depends entirely on the destination — unpriced | unaffected | depends on destination (the aside slot competes with Build/Rooms/Staff for the rail's own tight height budget) | all four, but the shape is undecided |
| D. two columns above a width breakpoint | only above the chosen breakpoint | UNDERIVED — no comparable element in this file | 0px above the breakpoint, same as A | **0 of 4** if the breakpoint reuses the strip's existing 1920–2559px band; 1 of 4 (1920×1080 only) if set lower |

**Recommended: A, widen the whole corner**, over B and C on cost-to-build
grounds and over D on the evidence directly. D fails the finding it is meant
to answer — D1 measured the deficiency *identically* at 900×600 and at
1920×1080, so a fix gated to wide viewports leaves three of the four measured
viewports exactly as broken as today, which is the same mistake #634's
viewport-breakpoint reasoning already made once for the strip and had to be
corrected for (`hud.css:2912-2917`, "AND IT IS A VIEWPORT BREAKPOINT"). C is
the most flexible in principle but every cost in its row is UNDERIVED — this
pass has no comparable element in this codebase to price a new destination
against, and choosing one is a bigger layout decision than this ADR should
make by default. B is strictly cheaper *to the minimap* than A for an
equivalent gain to the alerts box, but it commits this interface to an
asymmetric corner shape nothing here has built before, for a placeholder that
costs nothing to let grow — A gets the same alerts-box win with a shape this
codebase already knows how to lay out, and a bigger minimap footprint is
forward investment in the real minimap the placeholder already promises
(`hud.css:282`, *"the renderer will draw a square region of the world here"*),
not waste.

**What is not decided here: the exact width.** `docs/research/2026-09-01-what-the-corner-and-strip-cost.md` §5 item 1 lists the measurement this needs
— the 109-character sentence's line count at candidate label widths of 160,
200, 260, 320 and 400px, at all four viewports — and it has not been taken.
Sizing the corner off a guess would be exactly the kind of unmeasured number
`docs/AGENT_WORKFLOW.md` warns against reporting as a reading. **The
recommendation is the direction (A) and a guardrail, not a number**: at
900×600 the world view is already reduced to ≈360px of the viewport's 900
(§2 of the research note) by the corner and the rail together, and this
document recommends the corner not be widened past the point where that
budget is cut by more than half — i.e., the corner's total footprint should
stay under roughly 430px (today's 250px plus about 180px) until a real
minimap is rendered into that space and the tradeoff can be judged against
what the player actually sees there rather than against a text placeholder.
**That guardrail number is this document's own reasoning, not a measurement**
— nothing in this repository has asked "how much world view does a player
need at minimum" and this pass did not answer it either; it is named so the
owner can override it with an actual number rather than inherit an implicit
one.

## Decision 2: the strip must never drop a chip with nothing to say so, and `funds` must never be the first one gone

### The three candidates that need no new copy, and what each buys

| candidate | where it applies | cost | what it leaves unsolved |
| --- | --- | --- | --- |
| Wrap chips onto a second metrics row, height-gated | 1280×800 and any desktop viewport ≥800px tall (measured slack ~8px at 1280×800; `hud.css:3123-3135`) | ≈30–45px of world height where it fires | **Not available at 1280×720** — the Build panel's always-visible budget there is ~2px (the corrected figure from #726, not the "8px" `hud.css:3022-3023` still states for the same viewport — a stale figure this document flags rather than fixes, being out of scope for this ADR), which the ≈45px wrap cost overruns by more than 20× either way. 900×600 is already committed to the strip's one-row layout by a prior, explicit owner choice (`hud.css:2930-2937`, *"this file chooses the fold and says so"*) and this document does not reopen that. |
| Reorder chip priority so a badge-carrying chip is never among the ones silently dropped | every viewport, immediately, no structural change | none measurable — same chips, same widths, different order | Does not make the row fit; it only decides which chip yields when it does not. |
| Restore a visible scroll affordance (native scrollbar, or an edge fade/chevron) whenever the row actually overflows | every viewport | a visual change to the strip's chrome | **This is issue #634's own question, already ruled on once.** #634 refused a scroll affordance "as the answer" — but that refusal predates both ruling 21 (which reduced, not removed, the overflow) and the ninth chip (`high-risk`, #703 ruling 4), so the state being refused then is measurably less bad than the state on `main` today. This document does not overturn a standing ruling; it names that the ground it was ruled on has moved, and leaves whether to revisit it to the owner. |

**Recommended: the first two, together, now; the third is named for the owner
rather than recommended.** Wrapping onto a second row where the height budget
allows it (1280×800 and taller) closes most of the deficit for most desktop
viewports without an affordance question at all. Reordering priority is what
protects the one viewport the wrap cannot reach — **1280×720**, where D9-style
mid-game states already overflow and the worst case reasons to ≈150–250px
over — by guaranteeing that whichever chips are cut, `funds` is not one of the
first two. Both are decisions, not bugs, and neither ships with this ADR.

**Which chips a player must never lose.** `funds` — the resource the whole
economy runs on, the one chip ruling 18 gave its own danger badge to precisely
because a player needs to see it approaching the floor
(`docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md`
decision 2) — and any chip currently rendering a non-success badge:
`coverage` at `Understaffed`/`Unguarded`, `prisoners` at `{n} with no bed`,
`incidents` naming an open kind, `contraband` naming a find. Those are exactly
the moments the strip stops being decorative and becomes the thing a player
needs to act on, and the current declaration order (`funds` eighth of nine)
makes it one of the *first* two lost in the measured worst case rather than
one of the last. `earned-today` — the one chip with no tone and no badge at
any reading this repository has taken — is the one this document recommends
as the deliberate, documented, always-last-to-drop chip. That is a promise
about what a player can rely on seeing, so the reorder itself is recorded here
as a decision and is the owner's to accept, in keeping with `AGENTS.md`'s
mandate that a change to what a player is promised is not an agent's to make
alone.

**The owner's standing directive applies here by name.** *"Gra ma być łatwa,
przyjazna do grania, a nie jakieś ukryte funkcje"* — a chip that exists, that
the state has already computed, and that vanishes behind a scrollbar this
stylesheet deliberately hides is precisely a hidden function. Every candidate
in the table above is judged against that directive rather than only against
pixels: silent loss is the failure mode the directive names, and both
recommended candidates reduce it — the wrap by making the loss rarer, the
reorder by making what is lost, when it still happens, the least important
thing on the row rather than the resource the game is about.

## Consequences

- **No layout ships with this document.** Both decisions are Proposed; the
  `.hud__corner`, `.hud-minimap`, `.hud-strip__metrics` and `HudMetricId`
  order all stand as measured above until the owner rules.
- **One measurement gates the corner's exact size** — the line-count sweep at
  candidate widths, `docs/research/2026-09-01-what-the-corner-and-strip-cost.md`
  §5 item 1 — and one gates the strip's actual worst case post-#723, §5 item
  2. Neither this document's recommendation for the corner's direction (A) nor
  its recommendation for the strip (wrap + reorder) depends on either
  measurement; the corner's exact target width and the strip's precise chip
  count at each viewport do.
- **The chip-priority reorder is a promise about what a player can rely on
  seeing**, and ships only under the owner's sign-off, per `AGENTS.md`'s
  fourth exclusion read broadly (a change to what is guaranteed visible is
  adjacent to a promise even where no new string is authored).
- **Revisiting #634's scroll-affordance refusal is named, not taken.** This
  document does not reverse a standing ruling; it records that the ninth chip
  and ruling 21 both postdate it and that the measured deficit today differs
  from what was refused.

## What was considered and not taken

- **Shortening the alerts sentences themselves.** Player-visible copy
  (`AGENTS.md`'s fourth exclusion), and it fights rulings 3 and 13 directly,
  whose whole point was to say more, not less — the same reasoning issue #720
  already gave for declining this route.
- **Dropping chips outright below some width**, as a fifth strip candidate.
  Already refused by #634 for the reason #719 restates: the desktop browser
  comes first per the owner's 2026-08-31 steer, and dropping a chip a
  1920×1080 player would see is the more expensive direction of the two.
- **Choosing candidate C's destination for the alerts list.** Considered and
  set aside as its own layout decision rather than folded into this one — its
  cost table in the research note is UNDERIVED across the board, and
  inventing a destination to make this ADR's table complete would be exactly
  the unmeasured confidence `docs/research/README.md` warns against.
- **Sizing the corner off the pre-#726 or pre-ruling-21 figures still quoted in
  `hud.css`'s own two-row block and in `ui-strip-badged-width.spec.ts`'s
  docblock.** Both documents label their own figures as predating a landed
  change; this document uses the newer, MEASURED figures (D1, D9) wherever
  they exist and marks the gap where they do not (§5 of the research note)
  rather than trusting the older arithmetic.

## The weakest claim, and what would change my mind

**That the corner is a log rather than a deliberately narrow ticker** rests on
reading `MAX_EVENT_ALERT_ROWS`'s severity-graded eviction and rulings 1/3/11/13
as evidence of intent, not on a stated design decision anywhere in this
corpus — nobody has written "the alerts corner is a log a player refers back
to" as a decision, and this document infers it from what the surrounding
mechanics are built to do. One sentence from the owner either way settles it
faster than any further measurement could, and if the answer is "ticker," the
right fix is the opposite of this one: shorten the sentences, not widen the
box.

**Second weakest:** the 430px guardrail on the corner's width in Decision 1 is
this document's own judgment, not a measurement of what a player needs from
the world view at 900×600 — nothing in this repository has asked that
question directly, and a number the owner supplies for it would replace this
one outright.
