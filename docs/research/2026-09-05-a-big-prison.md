# A big prison — what happens when the prison is finally large

**Date:** 2026-09-05
**Tree played:** `b984445f`, **v0.0.475**, in worktree `/workspace/wt-a-big-prison`
on branch `agent/playtest-a-big-prison`. `origin/main` was re-checked at the
start of the session and was still `b984445f`, so the newest tree is the one
played. Nothing under `src/` differs from that commit — this branch's only
changes are `tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts`, this
file and the `docs/research/README.md` row. The running page confirmed the
version from inside itself: the status strip reads
`LockState.io | PRE-ALPHA | v0.0.475 · 4a76c03` (act 0), where the short hash is
this branch's instrument-only commit.

**Question, as given:** *every playtest in this repository so far has been
small. The largest was 30 prisoners; most were four to twelve. Build a big
prison — many blocks, many rooms, as many prisoners as the game will take — and
find out what happens.*

**LFS.** `git lfs checkout` was run in the worktree before anything, confirmed
by `file public/assets/actors/actor.guard.base.idle.png` →
`PNG image data, 260 x 3104, 8-bit/color RGBA`.

**The GPU is software.** Every act ran under swiftshader — the page logs
*"Automatic fallback to software WebGL has been deprecated"* on load. No claim
below is about frame rate, and none should be read as one.

---

## Claim tiers

- **MEASURED** — produced by one of the runs below and quoted from its output.
- **VERIFIED, read** — a file in this repository was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **JUDGEMENT** — what a *player* would do or feel, and marked as such.

Nothing here is **FROM MEMORY**. The weakest claim is named at the end.

**The two channels are kept apart.** Sentences come from `.hud` or a named
panel's `innerText`; numbers come from the worker — `simulation/status-counts`
and `simulation/clock-state` through the harness tee, and `hud/*` projections
through a second tee this instrument adds (see *Apparatus*). No claim mixes
them.

**No claim rests on wall-clock time.** The box is shared with a second tester.
Durations are in simulation ticks, in command counts, in DOM nodes and in
bytes. Where a real-time figure appears at all it is labelled as such and is
never the load-bearing part of a claim.

---

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5331 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts -g "act 1"
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`. A playtest is evidence, never a gate.

| act | what it plays | result |
| --- | --- | --- |
| 0 | the reachable canvas at zoom 1, the keyboard zoom, and the size of the plot | `1 passed` |
| 0b | the apparatus proved on one 3×3 room before 176 walls are spent on it | (filled in below) |
| 1 | eight rooms, three cell blocks, 64 beds, 64 admissions, 10 guards, run past day boundaries | (filled in below) |

---

## Apparatus — what was built by gesture and what by the harness

The brief asks for this distinction explicitly, because it decides what a
finding proves.

- **Every build gesture is a real mouse gesture.** Walls are `drag`s along tile
  edges, doors and furniture are `press`es on tile centres, materials are
  bought through the Build panel's Buy fold, rooms are designated by arming the
  Rooms panel and dragging a rectangle, prisoners are admitted by clicking
  *Admit a prisoner* once each and guards by clicking *Hire Guard* once each —
  all through `tests/browser/playtest-harness.ts`'s `press`, `drag`, `buy`,
  `armBuildable` and `tab`.
- **`buildAndPopulate` is deliberately *not* used.** It builds one 6×6 cell at
  fixed tiles `(12,12)-(17,17)` and computes every point as
  `originX + tx * 64`, which is only true at zoom 1 — and a prison that fills
  the plot does not fit on a 1440×900 screen at zoom 1 (§1). What this
  instrument does instead is drive the same primitives from a layout table.
- **One thing is not a gesture, and it is a read.** `__ask` posts a
  `simulation/request-projection` for `hud/prisoner-roster` and `hud/room-list`
  with `limit: 500` — the same projection the HUD asks for, with a window the
  HUD never uses (`PRISONER_ROSTER_ROW_LIMIT` is 4). It advances no tick, draws
  no RNG and never touches `SimulationCommandSender`'s sequence. Every claim
  about *what a player sees* is from the panels; the projection is only ever
  used for claims about what the simulation is doing.

---
