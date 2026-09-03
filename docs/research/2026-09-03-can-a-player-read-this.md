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

## 1. DEFECT — two readouts on one screen are both called coverage, count
different populations, and are told apart by nothing on screen

*(evidence pending act 7; see §1.3)*

## 2. DEFECT — the minimap says it is not available and then answers a click

*(evidence pending act 8)*

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
