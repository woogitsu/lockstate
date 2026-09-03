# Can a player read this?

**Date:** 2026-09-03 · **Version:** v0.0.422 (`31578e6`, `playtest/can-a-player-read-this`)
· **Method:** played in a real browser through
`tests/browser/playtest-2026-09-03-the-whole-screen-at-once.playtest.ts` and
`tests/browser/playtest-2026-09-03-can-a-player-read-this.playtest.ts`, both on
`tests/browser/playwright.playtest.config.ts`. **Neither is a CI gate**;
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/` and never
collects a `.playtest.ts`.

## The question

Not whether the text is grammatical. **Whether a person sitting down at this
game can work out what is happening to their prison and what to do about it,
from what is on screen.** That covers whether numbers are labelled, whether a
change is visible when it happens, whether a warning names an action, whether
two things that mean different things look different, and whether anything on
screen is quietly saying something untrue.

Every claim below starts from something observed in the running game. Where a
claim is refuted — including three of this pass's own opening hypotheses — the
refutation is recorded rather than the hypothesis quietly dropped
(`docs/AGENT_WORKFLOW.md` §4).

## What this pass proposes

**Nothing that is the owner's.** Every remedy below is a sentence a player
reads or a number a player is judged against, and `AGENTS.md`'s fourth
exclusion reserves both. Each finding therefore states **what the words must
convey**, never the words.

---

## 1. DEFECT — four numbers about guards on one screen, two of them called
coverage, counting different populations

**Reproduction** (`act 2`): build a 6x6 cell with eight beds and a toilet,
admit six prisoners, hire three guards, run to day 8 at x4, then read the
status strip and the Security tab.

What is on screen at that moment:

| where | reads | what it counts |
| --- | --- | --- |
| strip, `STAFF` chip | `3` | staff |
| strip, `COVERAGE` chip | `6 · COVERAGE · Covered` | **prisoners** on the covered rung |
| Security panel, coverage block | `GUARD COVERAGE  1 of 1  Covered` | **guards** assigned of required |
| Security panel, held summary | `1 held · 2 free` | guards on post / in the pool |

Worker counts at the read: `prisoners: 6`, `staff: 3`,
`dailyWageBillMinorUnits: 240`.

**The two "coverage" readouts are different quantities off different
derivations, and neither says so.** `projectStatusMetrics`' `coverage`
descriptor is `value: counts.prisonersCovered`
(`src/ui/hud/projection.ts:844`) with its word from `coverageBadge` over the
prisoner rungs `prisonersUnguarded` / `prisonersUnderstaffed`. The panel's
summary is `hud.security.coverage-summary`, `'{assigned} of {required}'`, over
`HudStaffCoverageViewModel` — `required` is *"Guards the prison asks for,
summed over every sector"* and `assigned` *"Guards assigned to a sector —
already on post, or still walking there"* (`view-model.ts:1785-1792`) — with
its word from `describeStaffCoverage` over `shortage`.

So a player reading left to right gets `3 STAFF`, then `6 COVERAGE`, then opens
Security and gets `1 of 1` and `1 held · 2 free`. Four figures about two
populations. **Only `1 held · 2 free` names its own units.** `6` under a label
reading `COVERAGE` beside a security icon, in a prison holding six prisoners
and three guards, is a number a reasonable player will read as either — and
which one they pick changes what they do next, because one of them is the
number a hire moves and the other is not.

**The refuting samples, taken.**

- *"They are the same quantity read twice, and the difference is a stale
  publication."* Refuted at the source rather than by timing: the two read
  different fields of different view models, argued above, and the strip's own
  docblock (`projection.ts`, `coverageBadge`) says where the panel's two counts
  are *"readable in full"* — the panel — which only makes sense if they are not
  the chip's number.
- *"The words tell them apart."* Partly. The panel's label is `Guard coverage`
  and the strip's is `Coverage`, so the distinction is present in one word on
  one of the two. It is not present in the badge: **both render the single word
  `Covered`**, out of one shared string set (`hud.security.coverage-met`), and
  the strip's chip deliberately reuses the panel's vocabulary so *"the panel and
  the strip cannot come to disagree about what a rung is called"*. That is a
  good property for a *rung* and it is what makes the two readouts look like
  restatements of each other.

**What is not established, and named as such.** Whether the two can print
*contradictory* words at the same instant — the panel `Covered` because
`assigned === required` while a guard is still walking, against the strip
`Unguarded` because no prisoner is yet on the covered rung. The derivations
allow it and `assigned`'s own doc comment ("already on post, **or still walking
there**") is why. `act 7` samples both readouts in one page evaluation across a
hire to settle it; on the box this pass ran on, its designation step was refused
twelve times over four minutes (`zone.not-enclosed`, the known ordering defect
in `2026-08-29-playtest-ordering-and-the-second-room.md` §7) and the act never
reached its samples. **So the contradiction is a hypothesis, not a finding.**
The finding above does not depend on it.

**What the words must convey**, without this pass authoring them: which
population each number counts. The strip's chip is the one that needs it — the
panel already says `Guard`.


## 2. DEFECT — the minimap says it is not available, and then answers a click

**Reproduction** (`act 8`, 27.6 s, no build needed): open the app, press
**New prison**, wait, read the minimap panel; press once in the surface;
read it again.

| | on arrival, nothing pressed | after one press |
| --- | --- | --- |
| sentence on it | `Minimap is not available yet` | `No map is drawn here yet — click to jump the camera there` |
| surface `cursor` | `pointer` | `pointer` |
| placeholder `cursor` | `pointer` | `pointer` |
| listeners on the surface | `click` | `click` |
| `role` / `tabIndex` / `aria-label` / `title` | `(none)` / `-1` / `(none)` / `(none)` | same |
| surface box | `224x224@99,501` | same |
| panel `data-collapsed` | `false` | `false` |

**The sentence swap is the proof the camera moved.** `src/ui/hud/hud.ts:1479`
is `if (navigated) minimapPlaceholder.textContent =
t(HUD_MESSAGE_KEY.minimapNavigable);`, and `navigated` is
`onMinimapNavigate`'s return — `false` exactly when the click "lands while no
world has ever been loaded". So the second row of that table cannot be reached
without the camera having actually gone somewhere.

**What a new player is therefore told.** A 224x224 panel, open on arrival and
present on all five tabs, states in its only sentence that a feature does not
exist. The feature works. **The only player who is ever corrected is the one
who ignored the sentence** — and the correction is a one-way latch
(`hud.ts:1479` is the sole writer; nothing resets it), so it is the *first*
press that is wasted, once per session, for every player who reads before
pressing.

**The refuting sample, taken.** `cursor: pointer` on both the surface and the
placeholder is a genuine affordance, so this is not a wholly hidden feature for
a mouse player — which is why it is filed as a defect about a *sentence* rather
than as HIDDEN. What that sample also shows is the shape of the problem: the
cursor says press me and the words say there is nothing here, on the same
224x224 box. And it does not rescue a keyboard player at all: `<div>`,
`tabIndex -1`, no `role`, no `aria-label`, no `title` — the surface cannot be
focused, so the swap can never fire and the sentence denying the feature is the
only thing that player will ever be told.

**What the words must convey**, without this pass authoring them: that the
square is a camera control now, and that what is missing is the drawn map
rather than the ability to jump. The second sentence already in the catalogue
(`hud.minimap.navigable`) says exactly that. The change is *when* it is shown,
not what it says — and choosing that is a player-visible promise, so it is the
owner's.


## 3. REFUTED — "the numbers on screen are not labelled"

This pass opened by assuming a legibility problem it could not find.

`probeNumbers` walks every visible leaf in `.hud` and `.save-panel` whose text
contains a digit, and reports **`hops`**: the number of steps from that leaf up
to the nearest ancestor whose *visible* text (screen-reader-only spans removed)
contains a word of three or more letters, together with that ancestor's text.
It is a distance rather than a verdict because the verdict version got the
answer wrong — see §6.

Measured across all five tabs, at 1440x900:

| Prison | tokens on screen | named 0–2 hops away | named further away or not at all |
| --- | --- | --- | --- |
| fresh, day 1, nothing built | 125 | 125 | **0** |
| built, 8 prisoners, 2 guards, day 4 | 163 | 158 | **5** |

Every one of the five is the same readout seen once per tab: the clock's
**speed value**, `×4`, whose only naming word is the screen-reader-only
`Speed 4×` beside it. So the honest count of *distinct* unlabelled readouts on
screen is **one**, and it carries the `×` glyph.

The chip values are labelled one hop away — `span.ui-stat__body` reading
`0Prisoners`, `25,000Funds` — and the panels label theirs in the leaf itself:
`Needs at least 3 × 3 tiles`, `Costs 80 now and 80 a day in wages.`,
`0 held · 0 free`, `2 waiting with no bed to sleep in`, `Buy 1 × Brick · 40`.

**What would change my mind:** a viewport narrow enough to drop a chip's label
while keeping its value. This pass measured 1440x900 only; the sibling pass
measures 375x812.

## 4. FIXED — the clock now says whether it is running

`2026-08-30-what-the-game-never-says.md` §1 recorded that a new session's clock
is constructed paused and *"no word on screen says so — the whole sighted clock
readout is `Day 1 / 0% / ×1`, and `×1` is what a running clock prints too"*.

Measured on `31578e6`, reading the sighted clock text and the computed
background luminance of all three transport buttons in each state:

| state | sighted clock reads | button background luminances |
| --- | --- | --- |
| a new session arrives | `Day 1 / 0% / PAUSED` | `[0.4141, 0, 0]` |
| after pressing Play | `Day 1 / 9% / ×1` | `[0, 0.4141, 0]` |
| after two Fast forwards | `Day 1 / 64% / ×4` | `[0, 0, 0.4141]` |
| after pressing Pause | `Day 1 / 70% / PAUSED` | `[0.4141, 0, 0]` |

Cross-checked against the worker rather than the paint: the tick moved
`242 → 424` over eight seconds after Play and `1691 → 1691` over eight seconds
after Pause. Two channels, both moving, both agreeing with the simulation. The
readout named in #629 §1 is closed.

## 5. CONFIRMED (#894) — one refusal from tick 0, rendered twice, still on
screen on day 7

The `calibrate` helper presses one empty tile with the Remove tool at the very
start of a build, at tick 0. On day 7 — tick 18,391, seven in-game days and one
autosave generation later — the whole visible text of the Build tab contains
**two** copies of the sentence that press produced:

```
| Nothing was removed — there is no object on that tile, and none being built there.
| MINIMAP
| Collapse
| MINIMAP IS NOT AVAILABLE YET
| ALERTS
| Nothing was removed — there is no object on that tile, and none being built there.
| Warning
```

One in the `.hud__refusal` band, one as a row in the folded-open alerts list,
with no dismiss control on either in that dump — while a contraband alert row
measured in the same session did carry one (`Contraband found: Currency. Day 3
Warning Clear this alert`). This is `HUD_PROJECTIONS.md` gap 34, which ADR 0084
declined to reopen; recorded here only because the reproduction is longer than
the day-9-from-tick-0 one already on file and because **the same sentence
occupies two places on the screen at once**, which the existing record does not
say.

## 6. This pass's instrument was wrong twice, and both are recorded

- **The number probe measured itself.** The first `probeNumbers` asked whether
  a word appeared inside the number's "smallest grouping" and stopped its
  upward walk on any class matching `^ui-[a-z]+$`. `ui-value` is one. So every
  chip value in the status strip reported *its own `<span>`* as its grouping,
  found no word in it, and was counted unlabelled. That run reported **71
  unlabelled numbers on a populated prison** and every one was an artifact.
  The rewrite reports a distance with no threshold to get wrong, and §3 is its
  answer.
- **The affordance probe counted the insides of working buttons.** A
  `<span class="ui-action__label">` inside a real `<button>` inherits
  `cursor: pointer` and carries no listener of its own, so the first sweep
  reported **101 "looks pressable and is not"** on the Build tab. It now skips
  any element with a pressable ancestor.

Both are why this record leads with a refutation.
