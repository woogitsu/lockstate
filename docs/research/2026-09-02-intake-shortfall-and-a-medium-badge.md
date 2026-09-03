# Playing INTAKE and CLASSIFICATION — what a shortfall looks like, and what a Medium badge actually reads as

**Date:** 2026-09-02
**Branch:** `playtest/intake-and-classification`, cut from `origin/main` at
**v0.0.380** (`1eb1b5b`). LFS content checked out with `git lfs checkout`
(62 objects, 93 MB confirmed present; `file public/assets/actors/actor.guard.base.idle.png`
reads `PNG image data`, not `ASCII text`).

**The brief:** find defects in intake, classification and the regime by
*playing* them, not by reading. Two concrete questions: when does a player
actually see the strip badge and `hud.intake.no-place` for someone with no
bed, and — given the brief's own correction that `Medium` has a name and is
screen-reader-reachable — what can a player actually tell apart on the risk
badges, including someone who cannot see colour.

## The box was contended, and it cost real time before any finding did

Before any usable run, `buildAndPopulate` (the shared harness routine every
playtest in this repository uses to build a walled 6×6 cell with the mouse)
took **9.4 minutes and 10.0 minutes** on two separate attempts and never
finished — both killed by their own `test.setTimeout`/outer timeout with
nothing past the build phase captured. `ps`/`uptime` at the time showed a
`load average` of 3.97/7.42/9.37 on a 4-core box with other agents' Playwright
and Vitest processes running. One step inside the build alone —
`designate attempt 1`, a single drag-and-confirm plus one `waitForQueueEmpty`
— was measured at **26.4s and 42.9s** on those two runs; the same step on a
subsequent, uncontended-looking run (no `playwright`/`vitest` process visible
in `ps` at the time) took **14.1s**. This matches
`docs/AGENT_WORKFLOW.md` §2's own recorded contention canaries and is
reported as arithmetic, not as a finding about the game: **do not read the
first two run's near-total-timeout as evidence about intake or classification
— they only measured how slow a contended CI-adjacent box is.** The third run
is the one everything below is drawn from. It passed in 3.1 minutes wall time
end to end.

## Reproduction

`tests/browser/playtest-intake-and-classification.playtest.ts`, one page
session, run whole (it is short enough not to need `-g`):

```
LOCKSTATE_BROWSER_TEST_PORT=5349 node --experimental-transform-types --disable-warning=ExperimentalWarning \
  node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-intake-and-classification.playtest.ts
```

`playwright.config.ts` matches `*.spec.ts` only; this is a `.playtest.ts` and
nothing in CI collects it — it is an instrument, not a gate, exactly as every
other file in `tests/browser/*.playtest.ts` is. It also does not need
`./network-changed-fixture`'s `test` import: that rule
(`tests/foundation/browser-network-changed-retry-contract.test.ts`) is scoped
to `*.spec.ts` files by its own directory walk, and `import { test } from
'@playwright/test'` matches every existing `.playtest.ts` in the directory.

## Act 1 — a prison with headroom: does the warning ever appear anyway

Built 10 beds, admitted 6 (an earlier, separately-run attempt at this exact
scenario — the first contended run above — captured this before timing out,
so it is real data even though the run itself failed on a later step). Right
after the six admits:

```
[main.build] no-place warning data: null
[main.build] status strip: … | 6 | PRISONERS | 0 | HIGH RISK | …
```

`.hud-intake__no-place`'s own `data-without-place` attribute reads `null`
(the block is `hidden`), and the `PRISONERS` chip on the status strip carries
no badge at all — there is no `"N with no bed"` text between `6` and the next
chip. **Confirmed: with real headroom, neither the panel line nor the chip
badge appears, at either sampling point taken.** This is the state
`intake-panel.ts`'s own docblock describes ("folded away at 0 … not
furniture") and it held.

**Not measured**: whether either surface flickers on for a fraction of a
second while a fresh arrival sits at `'queued'`/`'reception'`/`'classification'`
before reaching `'accommodation-assignment'`. Both this run and the settled
run below sampled at multi-second intervals, coarser than a single intake
tick; a true race in the first ~100ms after a press is neither confirmed nor
ruled out by this pass.

## Act 2 — a prison with no room: when the warning appears, and whether the two surfaces agree

Built 3 beds, admitted 8 in one pass (`beds: 3, admits: 8` — chosen to fold
what was originally planned as two acts into one `buildAndPopulate` call,
since a second built prison is a second multi-minute tax on a contended box).
Right after the eighth admit:

```
[main.build] intake panel after 8 admissions: INTAKE
5 waiting with no bed to sleep in
IN INTAKE
5 of 8
5 at Cell Assignment
[main.build] no-place warning data: 5
[main.build] status strip: … | 8 | PRISONERS | 5 with no bed | 0 | HIGH RISK | …
```

Sampled again 3s and 8s later (page t=+3s and settled, `test-results` log,
same numbers both times) and via `latestCounts`:
`{"prisoners":8,"prisonersInIntake":5,"roomOccupants":3,"accommodationCapacity":3,…}`.

**Both surfaces agree, every time sampled, at 5.** `hud.intake.no-place`
counts `waitingWithoutPlace` — arrivals stuck specifically at
`accommodation-assignment` with nowhere to put them
(`prisoner-projection.ts:606`, `waitingWithoutPlaceCount`). The `PRISONERS`
chip's badge counts a different, wider thing —
`prisonersWithoutBed = prisoners - occupiedPlaces` (`projection.ts:300`),
which is every admitted prisoner not currently occupying a place, at *any*
intake stage. In this run they coincide because, by the time either was
sampled, all 8 admissions had already cleared `'queued'`/`'reception'`/
`'classification'`: 3 sat in beds and the other 5 were all parked at
`'accommodation-assignment'`, with nobody left in an earlier stage to make the
wider count exceed the narrower one. **A hypothesis this pass went in with —
that the two counts could visibly disagree while fresh admits are still
mid-pipeline — was not observed, but it was not disproven either**: the
sampling granularity (first read at whatever real time the eighth admit
press's own `page.waitForTimeout(150)` left, then +3s, then +8s) is coarser
than the few intake-system ticks a prisoner spends in the earlier stages, so a
genuine transient disagreement in that narrow window would not have been
caught by this run. Worth a dedicated tighter-sampling pass if the two-number
question matters enough to settle definitively; this one settles only that
they do not *disagree while settled*.

**No defect found here.** The message and the badge both appear only when
there is a real shortfall, both name the same population once things settle,
and both stay silent with headroom. This is the surface working as
`intake-panel.ts` and `projection.ts`'s own docblocks say it should.

## Act 3 — what a Medium badge reads as next to Minimal and Low, played rather than read

The brief's own correction, verified rather than assumed: `describePrisonerRow`
(`regime-panel.ts:284`) gives risk tier 2 (`Medium`) its own `caution` tone,
landed same-day by `6d8352a0` ("A warning has a tone of its own (#788)"),
**after** an earlier playtest (`1c3eee98`, `docs/research/2026-09-02-playing-what-landed-today.md`)
found tier 2 still reading `neutral`. `git merge-base --is-ancestor 1c3eee98
6d8352a0` confirms the fix commit comes after the playtest that found the gap.
This pass plays the *fixed* `main` (v0.0.380, `1eb1b5b`) rather than
re-deriving that history, and the question is narrower and sharper than "does it have a name":
**what can a player actually tell these badges apart by, including someone
who cannot use colour at all.**

10 beds / 8 admits, clock run at 4× continuously. Tiers 0, 1 and 2 all
appeared inside the first ~750 ticks of watching (tier 0 and 1 together at
tick 8,778; tier 2 at tick 9,514 — a few hundred ticks later, consistent with
`ClassificationEarlyWarningSystem`'s once-a-day schedule catching one prisoner
on an early cycle). Row snapshots, read straight off the DOM:

| Tier | Word | `data-tone` | `title` | `aria-label` | `aria-describedby` |
| --- | --- | --- | --- | --- | --- |
| 0 | `Minimal` | `neutral` | absent | absent | absent |
| 1 | `Low` | `neutral` | absent | absent | absent |
| 2 | `Medium` | `caution` | absent | absent | absent |

**No badge, at any tier observed, carries a `title`, `aria-label` or
`aria-describedby`.** The badge's only accessible name is its own
`textContent` — the word itself. Since that word is derived per-prisoner from
`risk-tier.<tier>` (`prisonerRow`, `src/ui/simulation-prisoner-roster.ts:133`)
and differs by tier, **a screen reader gets a real, distinct word at every
tier and loses nothing** — the brief's correction holds, played and not just
read. Tier 3 (`High`, `warning` tone, `high-risk` group) was not reached in
this run's ~2.7 minutes of clock time (tick 8,778 → 10,469) — the full
`ClassificationReviewSystem` that can raise a tier that far only runs once
every `CLASSIFICATION_REVIEW_INTERVAL_TICKS` (24,000, ten in-game days), well
past this pass's real-time budget on a contended box. **Not reached, named
rather than guessed at.**

### What text alone cannot carry: colour, played and measured

Screenshot of the actual roster, archived here as
[`roster-medium-vs-low.png`](./2026-09-02-intake-shortfall-and-a-medium-badge/roster-medium-vs-low.png)
(246×178px, captured mid-run):

Two `Medium` rows and two `Low` rows are visible, four total, plus "and 4
more" below the fold (`PRISONER_ROSTER_ROW_LIMIT` is 4). **At normal
screenshot resolution the `Medium` and `Low` badges are very hard to tell
apart by colour alone** — both read as a muted grey-tan chip with dark text;
neither carries an icon (`createStatusBadge({ tone: 'neutral', text: '' })`
at `regime-panel.ts:575` passes no `icon`, and `status-badge.ts`'s `update`
only ever mounts one when `next.icon !== undefined`, so no roster badge at any
tone carries one — the tone is colour and colour only).

Read `getComputedStyle` on the two tones actually present: `neutral` painted
`background: rgba(238, 242, 246, 0.07)` / `color: rgb(168, 177, 188)`
(`--paper-400`, cool grey-blue); `caution` painted
`background: rgba(187, 168, 129, 0.14)` / `color: rgb(187, 168, 129)`
(`--straw-300`, warm tan) — matching `tokens.css:250-255` exactly, so nothing
about the token indirection changed what actually painted. WCAG relative
luminance, computed from those same values:

| Pair | Contrast ratio |
| --- | --- |
| `caution` fg vs `neutral` fg (straw `#bba881` vs paper-400 `#a8b1bc`) | **1.07:1** |
| `warning` fg vs `neutral` fg (amber `#e8b463` vs paper-400 `#a8b1bc`) | 1.15:1 |
| `caution` fg vs `warning` fg (straw vs amber) | 1.23:1 |

WCAG's own floor for meaningful non-text contrast (1.4.11) is 3:1; the
`caution`/`neutral` pair the owner's #788 ruling specifically exists to
separate sits at **1.07:1 — indistinguishable by lightness alone**, which is
exactly the axis a colour-blind viewer, a monochrome display, or (as the
screenshot shows at a glance, with no simulation needed) an ordinary viewer
not consciously comparing two chips side by side, has to work with. The two
tones differ almost entirely in *hue* (cool blue-grey vs warm tan) at nearly
identical *lightness*, and the background wash is a 0.14-alpha tint on top of
that, which compresses the visible difference further. `warning` (amber,
tier 3/`high-risk`) is not much better separated from either neighbour by
this measure, though it was not observed live this run.

**So: the brief's claim that `Medium` "had a colour and no name" was already
wrong before this pass started, and stays wrong — confirmed live.** The
sharper, previously unstated finding this pass adds: **the tone `#788`
deliberately added to be distinct now exists in the token layer and in the
DOM, but paints at a contrast so low against the tone it replaces that a
player scanning the roster by colour — which is the whole point of a tone
system, distinct from reading every word — gets almost no signal from it.**
The text is always there and always correct, so nobody is *misinformed*; the
colour channel `#788` added is real but, measured rather than eyeballed,
close to decorative. Whether to widen the separation (a straw further from
paper-400 in lightness, not only in hue) is a design call inside the token
layer the owner's mandate covers, not a player-facing sentence — proposed
here with the number that would justify it, decided nowhere in this pass.

**Tiers 0 and 1 (`Minimal`/`Low`) are not meant to be told apart by colour at
all** — both take `neutral` by `describePrisonerRow`'s own deliberate branch
(`row.riskTier === MEDIUM_RISK_TIER ? 'caution' : 'neutral'`), so within that
band the word is the *only* signal, always, by design — not a defect, and
worth stating plainly since it is the cleanest instance of "no hidden
mechanics" the roster has: nothing is implied by colour that the text does
not already say.

## What this pass did not reach, named rather than left implicit

- Tier 3 (`High`) and a `general-population → high-risk` group change, either
  direction — needs the full 24,000-tick review; this run's clock budget
  (~1,700 ticks of real watching) was two orders of magnitude short.
- The high-risk strip chip's own behaviour under a real tier-3 population —
  read from code only (`projection.ts:791-799`: no tone, no badge, by a
  deliberate "not a permanent amber chip" decision) and not observed live,
  since no prisoner reached that tier.
- Sub-second divergence between `hud.intake.no-place` and the `PRISONERS`
  chip badge during the first few ticks after an admission — see Act 2's own
  caveat.
- The regime's daily blocks (sleep/meal/hygiene/work/yard) and need bars —
  visible in the screenshot (`Association`, `Safety`, `Bladder` with a lit
  segmented bar) but not exercised or measured this pass; out of the time
  budget a contended box left after the three acts above.
- No actual screen reader (NVDA/VoiceOver) was run; "screen-reader-reachable"
  above is established by reading the accessible name a real screen reader
  would compute (`textContent`, no ARIA override) rather than by driving one.

## Weakest claim

That the two intake counts (`waitingWithoutPlace` and `prisonersWithoutBed`)
"agree once settled" rests on one built scenario and roughly a dozen seconds
of sampling at multi-second granularity, not on a proof that they can never
diverge — they are computed differently and a scenario deliberately admitting
in a tight burst while sampling every tick, rather than every few seconds,
could still catch a real disagreement this pass did not. Named above as
unreached rather than asserted closed.
