# Playtest: nine changes landed overnight — does the escape sentence reach a pixel, is a weapon anything the player can see, and does the Rooms tool read as friction?

**Date:** 2026-08-31
**Branch played:** `agent/playtest-2026-08-31`, cut from `main` at **v0.0.273**
(`6b5dc8d`), which is the release commit carrying
[#685](https://github.com/matmaxalez/lockstate/pull/685),
[#690](https://github.com/matmaxalez/lockstate/pull/690),
[#640](https://github.com/matmaxalez/lockstate/pull/640) /
[#693](https://github.com/matmaxalez/lockstate/pull/693),
[#650](https://github.com/matmaxalez/lockstate/pull/650),
[#691](https://github.com/matmaxalez/lockstate/pull/691),
[#681](https://github.com/matmaxalez/lockstate/pull/681) and
[#694](https://github.com/matmaxalez/lockstate/pull/694). The branch adds one
file under `tests/browser/` and changes nothing under `src/`.

**`main` moved once underneath this pass and it does not touch anything here.**
By the time the runs finished, `main` was **v0.0.274**, and
`git diff --stat 6b5dc8d..origin/main -- src/` is two files:
`src/services/localization/chunk-catalog-loader.ts` (new) and
`src/services/localization/index.ts` (one line). No finding below rests on
either.

**Reproduction:** `tests/browser/playtest-2026-08-31.playtest.ts`, run with

```
LOCKSTATE_BROWSER_TEST_PORT=5199 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-08-31.playtest.ts -g "act 1"
```

Nothing in CI collects `.playtest.ts`. Viewport 1440x900, real Chromium, mouse
gestures only, driving `index.html` + `src/main.ts` through a `Worker` tee.

**LFS.** `git lfs checkout` was run in the worktree first — 62 objects, 93 MB —
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` rather than `ASCII text`.
`docs/AGENT_WORKFLOW.md` records a playtest that ran green with no actor sprites
at all, which is why this is checked rather than assumed. **No claim here is
about rendering the world**; every claim is about HUD text, a DOM box, a tick or
a treasury value.

**The brief, in the owner's own words:** *"znajdź bugi i błędy grając, bo ja nie
mogłem postawić więzienia itp grając sam"* — find defects **by playing** — under
the standing directive *"gra ma być łatwa przyjazna do grania, a nie jakieś
ukryte funkcje"*.

## Runs

| run | act | result | what it added, or what it cost |
| --- | --- | --- | --- |
| act1 (first) | 1 | abandoned | hung on `click()` of a `Cancel` that is in the DOM and has no box — **that hang is finding 1** |
| act1c | 1 | `1 failed (1.7m)` | the same hang with a 20 s cap, which produced the timeout log quoted in §1 |
| **act1d** | 1 | **`1 passed (8.3m)`** | the whole money route, the hire control, the band's first painted sentence |
| act2a | 2 | see §3 | five disjoint enclosed rooms, four presses each |
| act3a | 3 | killed at 2 min | killed deliberately: the instrument was wrong and §2 explains why |
| **act3b** | 3 | see §2 | the same act with a `MutationObserver` and a frame sampler |

**Contention, sampled rather than assumed.** A sampler wrote
`ps -eo args | grep -c "[p]laywright/test/cli"` and the load average every 60 s
for the whole session. What was on the machine:

- Another agent's `vitest run` was live for most of act1c and act1d
  (`vitest=3` to `vitest=8`, load 2.25 → 4.34 on 4 cores).
- Another agent's `app-shell.spec.ts -g "what a zoned room is missing"` run was
  live for part of it.
- **This pass ran act 2 and act 3 concurrently on ports 5202 and 5201**, which
  is two Playwright runs of its own, both mine and both known.

**So no wall-clock duration below is load-bearing.** Every figure this record
rests on is a tick, a treasury value, a press count, a DOM box in CSS pixels or
panel text — all of which come from the simulation or the layout and not from
the scheduler. Where a duration in milliseconds is quoted it is labelled and is
part of a *comparison between two events in the same run*, never an absolute.

**One thing this pass broke, and it was another agent's.** Clearing a stale Vite
server, it ran `pkill -f "vite/bin/vite"`, which matched a second agent's dev
server on port 5188 and killed it while that agent's `app-shell.spec.ts` run was
live. That run will have failed with its web server gone. Recorded because a
failure in someone else's log with no cause in their diff is exactly the kind of
thing `docs/AGENT_WORKFLOW.md` says costs hours, and because the fix is one
line: kill by PID, never by pattern, on a shared box.

## Claim tiers

- **MEASURED** — this pass ran it and the output is quoted verbatim.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from two MEASURED or VERIFIED facts, and says so.
- **UNKNOWN** — could not be established, and named as such.

---

# Part A — what the player meets, in the order they meet it

## 1. The whole money route works, and the one control it needs has no box

**This is the finding of the pass, and it is a consequence of two changes that
are each correct on their own.**

### 1a. A wall buys itself, and the arithmetic is legible

**MEASURED**, act1d, a fresh prison, the Buy fold never opened, four wall runs
dragged around tiles (12,12)–(17,17):

```
[act1] treasury before any order: 25000
[act1] after the north run: treasury=24520 queue="QUEUED\n6 waiting · 0 being built"
[act1] after the south run: treasury=24040 queue="QUEUED\n12 waiting · 0 being built"
[act1] after the west  run: treasury=23560 queue="QUEUED\n18 waiting · 0 being built"
[act1] after the east  run: treasury=23080 queue="QUEUED\n24 waiting · 0 being built"
```

480 per six-segment run, 80 per segment, 24 segments for 1,920 — with **no
procurement press at any point**. #640 does what it says.

### 1b. The report of that spending is painted into a 0x0 box

**MEASURED**, the same run, from a sampler inside the page that records every
change of the `.hud-build__deliveries` block:

```
{"t":98538,"blockHidden":"false","pending":"24",
 "header":"On the way24 bought · 1,920 back if cancelled",
 "rows":["2 × Brick · 80 backCancel","2 × Brick · 80 backCancel","2 × Brick · 80 backCancel"],
 "visibleRows":3,"width":0,"height":0}
```

and, probed directly:

```
[act1] the first delivery row and the fold above it:
       {"rowHidden":"false","rowBox":"0x0","buyRowHidden":"true","buyRowDisplay":"none"}
[act1] is the first Cancel visible to a player? false
```

Every internal signal says this block is on screen. It is **not** `hidden`, it
carries `data-pending="24"`, three rows are filled with correct text, and the
header quotes the correct refundable total. It occupies **zero pixels**, because
its ancestor does not.

**VERIFIED, read** — `src/ui/hud/build-panel.ts:1293`, `:1308` and `:1311`:
`deliveriesBlock` is the last child of `buyRow`, and the statement after that
element is `buyRow.hidden = true`.
**VERIFIED, read** — `src/ui/hud/build-panel.ts:1430`: `paintDeliveries` sets
`row.element.hidden = false` on every row it fills, which is why
`:not([hidden])` matches a row nobody can see.

**This half is not new.**
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§2b established it and stated it well: *"The purchase the game makes on the
player's behalf is announced only inside the procurement fold — the exact fold
#627 exists so that the player never has to find."* This pass reproduces it at a
different viewport with a different instrument, and adds the box measurement
(`0x0`, `display: none` on the ancestor) rather than only the `not laid out`
verdict.

### 1c. What is new: the control #693 just fixed is in there too

#693's subject is a **cancellation**: *"Cancelling a `jit:` delivery now
withdraws queued build orders until the prison no longer has to buy the material
back."* The only producer of that command in the interface is the `Cancel` button
on a delivery row — which §1b just measured at `0x0`.

**MEASURED**, the cost of that, as a hang. The first run of act 1 called
`click()` on a row matched by `:not([hidden])` and never returned; act1c capped
it at 20 s and produced the log:

```
TimeoutError: locator.click: Timeout 20000ms exceeded.
  - locator resolved to <button type="button" class="ui-action" aria-busy="false"
      data-tone="default" aria-label="Cancel: 2 × Brick · 80 back">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
```

**And with the fold opened by hand, everything #693 promises happens.**
MEASURED, act1d:

```
[act1] NOTHING TO CANCEL with the fold shut. Opening .hud-build__buy-toggle …
[act1] deliveries after opening the Buy fold: "ON THE WAY\n24 bought · 1,920 back if cancelled\n2 × Brick · 80 back\nCancel\n…\nand 21 more on the way — these arrive first, and the rest come into view as they land."
[act1] Cancel controls with a box, fold open: 3
[act1] cancelling from inside the fold. row says "2 × Brick · 80 back | Cancel" | treasury 23080 | queue "QUEUED\n24 waiting · 0 being built"
[act1] treasury right after Cancel = 23160 (delta 80)
[act1] queue right after Cancel: "QUEUED\n23 waiting · 0 being built"
```

The refund is exactly the 80 the row promised, **and the queue went from 24
waiting to 23** — the withdrawal #693 landed, seen from the chair. Then Play:

```
[act1] clock: {"mode":"running","speed":4}
[act1] t+5000ms  into Play: treasury=23160 queue="QUEUED\n14 waiting · 1 being built"
[act1] t+10000ms into Play: treasury=23160 queue=".hud-build__queue: not laid out"
[act1] t+15000ms into Play: treasury=23160 queue=".hud-build__queue: not laid out"
```

**The 80 stayed refunded across Play and past the procurement pass**, which is
the exact defect #687 described and #693 fixed. `0 taken back out`, measured
from the interface rather than from a test double.

**So the statement, with the cause and the cost kept separate.**

- **Observation.** #640 spends the player's money at the press, #693 makes the
  refund survive, and both the report of the spending and the only control that
  reverses it live inside a disclosure that starts shut and that #640 exists so
  the player never has to open. The control measures `0x0` and twenty seconds of
  actionability polling.
- **What would establish the cause**: nothing further — it is read, at
  `build-panel.ts:1293-1311`, and the DOM box agrees.
- **What would establish the impact**: a decision about where a spend the game
  makes on the player's behalf should be reported. That is copy and layout, so
  it is the owner's, and #636 already lists this surface under "copy owed to the
  owner". **Not filed here as a defect.** What this pass adds is that the
  question is no longer only about a *report*; it is about a *control*.

### 1d. Re-dragging a wall run over finished walls says an order exists

**MEASURED**, act1d, after the perimeter was built and one order had been
withdrawn by the cancellation, re-dragging all four runs:

```
[act1] north(again): treasury=23160 refusal="The build order failed — that order already exists."
[act1] south(again): treasury=23160 refusal="The build order failed — that order already exists."
[act1] west(again):  treasury=23160 refusal="The build order failed — that order already exists."
[act1] east(again):  treasury=23080 queue="QUEUED\n1 waiting · 0 being built" refusal="The build order failed — that order already exists."
```

The last line is the coherent part and it is worth saying plainly: the one
segment the cancellation withdrew was re-orderable, and it cost **80 again**, so
cancel-then-rebuild is money-neutral end to end.

The wording is the observation. `hud.alert.refusal.build.duplicate-order`
(`src/content/default-locale-en.ts:250`) is *"The build order failed — that
order already exists."* — and what actually exists on those tiles is a **wall**.
A player who has watched the wall go up is told an *order* is in the way. The
locale comment beside it explains the phrase as transcribed from
`place-object.duplicate-order` for *"the identical fact"*, which it is at the
command layer and is not from the chair.

- **Observation.** For the ordinary gesture of dragging over work already done,
  the sentence names the wrong object.
- **What would establish the impact**: whether players re-drag. This pass did it
  because the cancellation had left a hole; **UNKNOWN** how common that is.
- No new wording is proposed here: a replacement sentence is copy.
