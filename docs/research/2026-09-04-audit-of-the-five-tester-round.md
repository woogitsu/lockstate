# The five-tester round, audited — 2026-09-04

**What this is.** On 2026-09-04 a coordinator ran five play-testers against
`origin/main` at **v0.0.451** (`0e614c7`) and wrote a consolidated report
ranking their findings against each other. This document is the **integrator's
audit of that report**: which of its load-bearing claims survive an independent
reading of the code, which do not, and what the round produced that its own
report does not say.

**Why it exists rather than the consolidated report itself.** The five session
records are the primary sources and each lands as its own document, indexed
beside this one. The consolidated report's unique contribution is the
*cross-session ranking* and its *not-a-defect* calls, and both are carried
forward here with attribution. Its three claims that did not survive are
recorded with what replaces them — **not silently corrected**, because a reader
of that report needs to see which parts of it to trust.

`docs/AGENT_WORKFLOW.md` §1 requires a coordinator to verify agents' load-bearing
claims rather than accept them. The consolidated report did that for roughly
thirty citations and labelled where it had and had not. This document does the
same to *it*.

---

## 1. What the audit confirmed, exactly

Each of these I opened myself at the line cited, on `main`. **All of them
survive**, and two are sharper than the report's own framing.

### The Security panel says `Covered` at the guard count the code predicts is fatal

**Confirmed, verbatim.** The docblock above
`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` in
`src/simulation/security/default-sector.ts` reads:

> a prison of `n` prisoners needs `ceil(n / 8)` guards posted **plus** a reserve
> for `IncidentResponseSystem` to claim, and **a player who hires exactly the
> requirement will watch every incident lapse.** That is the bound ADR 0036
> decision 3 records, made visible by a requirement that grows.

The requirement is `ceil(occupants / 8)`
(`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8`, `sector-staffing.ts`), responders come
only from *unposted* guards, and the panel whose job is to say how many guards to
hire prints the number that leaves no reserve — then calls it `Covered` with the
sentence *"This prison has the guards it asks for."*

**And the measurement is stronger than the comment.** The session measured 17
residents and **4** guards, panel reading `3 of 3 / Covered` and `3 held · 1 free`
— `ceil(17/8) = 3`, so that prison held the requirement **plus one reserve** and
still lapsed **7 of 7**. The comment predicts failure at *exactly* the
requirement; the measurement shows it at requirement **+1**. **So raising the
requirement by one would not have saved this prison**, which matters for the fix
and is not something the report drew out. Filed as **#941**, with that reading
marked as a single sample and the discriminating follow-up named.

### A run of presses silently loses some of them

**Confirmed, and the arithmetic holds.** `src/ui/simulation-commands.ts`:

```ts
const DEFAULT_LEAD_TICKS = 20; // 1 second at the kernel's 20 Hz.
/** `FixedStepClock`'s step. The worker converts `elapsed * speed` into whole steps of this size. */
const TICK_MILLISECONDS = 50;
```

**The comment is true at 1× and false at every other speed**: 20 ticks × 50 ms is
one second of *kernel* time, and the worker converts `elapsed × speed` into
steps, so at 4× the lead is **250 ms of real time**. The cascade is real too — a
rejection sets `sequenceSynced = false` under the comment *"A rejection means our
idea of the sequence is wrong in an unknown direction"*, after which every press
throws *"The simulation has not reported its command sequence yet; try again in a
moment."* until a snapshot restates the baseline. That is the exact string the
session saw seven times.

**So one late press disables the control surface.** Filed as **#942**.

### Asking for a second prison destroys the first one's unsaved play

**Confirmed.** `SessionController.createPrison` runs
`await this.host.startNew(masterSeed)` and then `this.adoptSession(prisonId)`
with **no capture of the outgoing session first**. Filed as **#943**.

### Twenty-eight people on two tiles draw two figures

**Confirmed, and it is a guarantee rather than a tendency.** `LAYER_BIAS` is
`{ structure: 0, actor: 1 }` (`src/rendering/depth.ts`) and **both populations are
`actor`**, so co-located actors get identical depth; Phaser's sort is stable; and
`actors-from-snapshot.ts` builds guards **last**. So on a shared tile the guard
always wins and **the prisoners are always the ones hidden**. Filed as **#944**,
together with the question underneath it that the session correctly declined to
guess at.

### Removing a standing object destroys what it cost and says nothing

**Confirmed, and this is the finding the audit most needed.** The grep is exact:

```
$ grep -n "events\.record" src/simulation/runtime/session-commands.ts
515:        events.recordDeliveryCancelled(outcome.refundedMinorUnits, context.tick);
```

**One line.** And the two removal paths in
`src/simulation/objects/object-placement-service.ts` diverge: a *pending* object
order goes through `orders.cancelOrder`, while a *standing* object goes through
`placedObjects.remove` and **never reaches `cancelOrder` at all**.

**That matters because of what landed the same day.** PR #932 (closing #927) made
the `Undo` and `CancelBuildOrder` channels state-aware, and the integrator who
merged it — this author — believed it closed the class. **It does not.** The
standing-object case is on neither channel and was still silent after that merge.
Filed as **#945**.

---

## 2. Three claims that did not survive, and what replaces them

Recorded rather than corrected in place, so a reader of the consolidated report
knows which parts to re-check.

### The shallow-clone claim is no longer true

The report states, labelled as re-verified by its coordinator, that
`tests/foundation/documentation-commit-citation-contract.test.ts` is **red on
clean `main` in this container** (`2 failed | 6 passed`) because the clone is
shallow and every cited commit falls outside the graft boundary.

**At audit time it is false:**

```
$ git rev-parse --is-shallow-repository
false
$ ls .git/shallow
(no such file)
$ vitest run tests/foundation/documentation-commit-citation-contract.test.ts
Tests  8 passed (8)
```

**The likely cause is this session's own doing.** An agent working earlier the
same day hit exactly that failure and fixed it with `git fetch --unshallow`;
worktrees share the object store with the primary checkout, so that one command
plausibly unshallowed the container for everybody. A second agent an hour later
reported `--unshallow` as *fatal — "on a complete repository does not make
sense"*, which is consistent.

**The consequence the report drew from it still stands and is the part worth
carrying:** that gate **did not** validate the citations in the five records the
round produced. So each record was re-run against it during merge, on the merged
tree, and each passed — which is recorded in the five pull requests rather than
asserted here.

### "An admitted prisoner has no route back of any kind" overreaches

The report's finding B2 is accurate in its body — **no player command removes a
prisoner**, and the protocol's fifteen verbs are `AdmitPrisoner`,
`CancelBuildOrder`, `CancelMaterialPurchase`, `DismissAlert`, `DismissStaff`,
`HireStaff`, `PlaceBuildOrder`, `PlaceObject`, `PurchaseMaterials`, `Redo`,
`ReleaseGuardAssignment`, `RemoveObject`, `Undo`, `UnzoneRoom`, `ZoneRoom`,
confirmed by reading them.

**Its heading is not.** `src/simulation/prisoners/discharge-system.ts` exists and
discharges on sentence expiry. So there *is* a route out; it is simply **not the
player's**, and at sentences of 14–90 in-game days it is unreachable inside the
~24 days any session played — which the report's own D2 records. The honest claim
is **"no player-initiated route"**.

### The #902 framing is incomplete in a way that misleads

The report says *"#902 is closed and the problem stands"*, and treats it as a
closed issue whose fix is absent from the tree.

**#902 was closed because its stated cause was refuted.** Its subject was a
**0px scrollbar gutter**, and `--hide-scrollbars` is appended to every headless
Playwright launch (`playwright-core/lib/server/chromium/chromium.js:281-285`), so
**no test in this repository can gate a scrollbar** and that measurement was an
artefact of the test browser. PR #924 built a fix, proved it, and **withdrew it**
on two decisions it judged were not its to take.

**What does stand is the geometry** the report measures independently as C3 — a
two-row window on twenty-one rows at tablet landscape, with
`--hud-build-catalogue-floor` = `calc(2 * var(--tap-target))` and `--tap-target`
= `calc(44px * var(--ui-scale))` confirmed at `src/ui/tokens.css`. **That is a
different defect from the one #902 named** and belongs in an issue of its own
rather than a reopening.

---

## 3. What the round produced that its own report does not say

**None of the five records was in the repository.** The report describes 8,229
lines across five records and five instruments and says nothing about where they
live. They were on pushed branches — `agent/playtest-*`, with `wip/playtest-*`
snapshots beside them, so `scripts/wip-sweep.sh` had done its job — and **no note
was on `main`**.

**And all five index themselves in `docs/research/README.md`, which appends at one
point.** So four merge conflicts were structural rather than accidental, whatever
order they landed in. Each was resolved by keeping every row, in landed order,
editing no row's text — the same treatment three notes needed earlier the same
day. **This is #428's unimplemented one-file-per-entry fix showing its cost for
the second time in one day**, now at a scale where the arithmetic is plain: *n*
self-indexing notes cost *n − 1* hand resolutions.

---

## 4. The ranking, carried forward

The consolidated report's own priority order, kept because the audit agrees with
it and because the reasoning is worth preserving:

1. **The Security panel** (**#941**) — a sentence asserting a state the code
   predicts is false, in the panel a player consults to fix exactly that state,
   with the prediction already written in a comment.
2. **Why prisoners stack, before the draw order** (**#944**) — fixing depth makes
   twenty-two prisoners on one tile *visible* rather than *correct*.
3. **The dropped command runs** (**#942**) — because they silently corrupt every
   other measurement anyone takes of this game, including future playtests.
4. **The second prison** (**#943**) — unrecoverable and one press away, and the
   same property was already found on Load and fixed on neither.
5. **The standing-object silence** (**#945**) — the one case that survives the
   work that landed the same day.
6. **The touch labels** — `createIconButton` puts a control's only words in a
   `title` attribute, and the sibling primitive states the rule being broken in
   terms: *"Touch has no hover, so a tooltip is not a label."*
7. **Hour two** — not a bug list but the roadmap question, and the one thing here
   nobody but the owner can settle.

---

## 5. What this game does well, with the numbers

The report asked its testers for this category and four of five produced one.
Carried forward because three of them **refute a premise the round's own brief
assumed**, which is the strongest form this section can take.

- **The money is handled exemplarily.** Every money mistake had a complete,
  correct, findable route back **that names the figure**: six walls on the wrong
  line returned 480 of 480, one order at a time; sixty bricks bought instead of
  six returned 2,400 of 2,400; a room drawn a tile short is refused **before**
  the press, with the reason. *Caveat the tester flagged itself:* those runs were
  paused by choice, so every figure is the paused best case.
- **The whole game is completable with a finger**, at both tablet orientations,
  with no `page.mouse` and no `page.keyboard` anywhere in the instrument — and
  **0 visible controls below the 44px tap target across all five tabs at both
  viewports**.
- **Switching prisons is exact**: kernel tick **13,622 in, 13,622 out**, same
  names, same need percentages, same tab.
- **It holds structurally over a long session**: `hudNodes` 1,063 → 1,088 over
  seventeen in-game days, no fold state drifted, the alerts list peaked at 4 rows
  against a cap of 8. **The problem with hour two is that it is empty, not that
  it breaks.**

## 6. Not defects, and the calls were right

Each tester made these calls itself, which is the discipline `AGENTS.md` asks
for, and the audit agrees with all three.

- **Five free save slots** — a product direction not yet started, not a broken
  promise. `BASE_SAVE_SLOTS` bounds a cloud capacity nothing local reads, and
  ADR 0043 records that there is no client identity layer for it to attach to.
- **Object art** — `SPRITE_BY_OBJECT_ID` is literally `{}`, which the file
  documents along with the cost of fixing it. **Pre-alpha placeholder art is not
  a bug.**
- **A dismissal not refunding the day already paid** — deliberate and argued at
  length in `src/simulation/staff/dismissal.ts`: *"A refund would make
  hire-then-dismiss a way to get money back for a day already worked … Both of
  those are balance, and balance is the owner's."* **The 80 is not a defect;
  that nothing on screen says it is gone is.**

---

## 7. The audit's own weakest claim

**That roughly thirty re-verified citations generalise to the rest.** The audit
opened the load-bearing ones — every Tier A finding, the one-line grep behind the
silence finding, the two removal paths, the depth composition, and the three
claims in §2 — and did **not** re-open the report's Tier C and D citations, which
it labelled as its own coordinator's re-verification rather than a tester's
unchecked claim. **Every citation this audit opened matched; none was withdrawn.**
That is a good record and it is not proof of the rest.

**What would change it:** re-opening the Tier C citations, which is a reading pass
rather than a play session, and which the five records make cheap because each
names its own `file:line` beside each claim.

## 8. The five records

| session | question it played |
| --- | --- |
| [a tablet and nothing else](./2026-09-04-touch-only.md) | a tablet player with no keyboard and no mouse, end to end |
| [can I see my prison](./2026-09-04-can-i-see-my-prison.md) | looking at the world rather than the panels, can a player tell what is going on? |
| [hour two](./2026-09-04-hour-two.md) | the game *after* the first prisoner — several in-game days, 20–30 residents |
| [the misplay](./2026-09-04-the-misplay.md) | every first-half-hour mistake made on purpose, and the route out of each |
| [many prisons](./2026-09-04-many-prisons.md) | a player who already has one prison wants a second |

Each instrument is `tests/browser/playtest-2026-09-04-<slug>.playtest.ts`,
structured as numbered acts so one finding can be re-run without re-running the
round. **Nothing there is collected by CI** — `playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is what matches
`*.playtest.ts`. **A playtest is evidence, never a gate.**
