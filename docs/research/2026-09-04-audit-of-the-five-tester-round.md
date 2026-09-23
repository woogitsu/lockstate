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

---

## Amendment, 2026-09-04: the Tier C and D citations, re-opened

**§7 is left exactly as it stands and is not corrected in place.** It was true
when written and this section is what dated it — the form
`docs/adr/README.md` requires of an amendment, and the form §2 above already
uses. §7 named its weakest claim as *"that roughly thirty re-verified citations
generalise to the rest"* and said what would change it: *"re-opening the Tier C
citations, which is a reading pass rather than a play session."* That pass was
run against `origin/main` at **v0.0.465** (`4c00eaba`), sixteen merges and
fourteen releases past the **v0.0.451** (`0e614c7`) the round played.

### How the tiers were resolved, because the report is not in this repository

The consolidated report carried the tier labels — §2 above cites its findings
`B2`, `C3` and `D2` by them — and **that report is on no branch**: its unique
contributions were carried forward into this note rather than merged, which §1
above says in its second paragraph. So there is no Tier C row to enumerate by
name. Rather than guess at the mapping, the pass took the **superset**: every
`file:line` in the five primary records, mechanically extracted and then opened,
including the ones §1 and §2 above had already opened. That is strictly more
than Tier C and D and it removes the tier question from the result.

**176 distinct citations**, counted per record as a (record, coordinate) pair
and de-duplicated: touch-only 34, can-i-see-my-prison 25, hour two 51, the
misplay 39, many prisons 27. The extraction had to allow for three citation
shapes, because two of them are invisible to the obvious grep: a full path
(`src/ui/tokens.css:415`), a bare filename (`appearance.ts:276`), and a bare
continuation that inherits the file named before it (`` `:1898` ``). The third
shape alone accounts for **47** of the 176.

**One trap in the extraction itself, disclosed because it produced a false
pass.** A bare `` `:NNNN` `` inherits the file named before it, and *before it*
is not always on the same line. Two of the 47 inherited the wrong file — and
where the borrowed file is shorter than the line number, an unguarded
comparison reads empty against empty and reports a match. Both were caught by
asserting the coordinate is in range at both revisions, and both were then
resolved by hand from the record's own sentence: touch-only's `` `:1933` ``
belongs to `default-locale-en.ts` (`'hud.rooms.arm-hint'`, now `:2071`) and not
to `bindings.ts`, and many prisons' `` `:133` `` belongs to
`src/services/entitlements/projection.ts`, where it and `:129` are both still
exact. The first of those is counted below as stale; it would otherwise have
been counted as exact.

### The result in one table

| | touch-only | see my prison | hour two | the misplay | many prisons | **all** |
| --- | --- | --- | --- | --- | --- | --- |
| coordinate still exact on `main` | 28 | 22 | 35 | 25 | 22 | **132** |
| coordinate stale (drifted or dead) | 6 | 3 | 16 | 14 | 5 | **44** |

Of the 44 stale coordinates, **28** were correct at `0e614c7` and moved
afterwards, and **16 were already stale on the very commit that carried their
own record onto `main`** — falsified by #932, #940 and #950, each of which
merged *before* the record did. Nobody re-pinned them, and nothing gated it:
`tests/foundation/documentation-commit-citation-contract.test.ts` checks cited
*commits*, not cited lines.

**What "still exact" means, said narrowly, because it is not the same as
"true".** It means the line at that number holds, byte for byte, the text the
record was written against. It does not mean the record read it correctly —
three citations are exact by that test and wrong by inspection, and they are in
the refutations below.

### 1. Seven claims are no longer true, and six of them because they were fixed

**This is the most valuable half of the pass**: it stops a future agent working
on something already done.

| record | claim, and the coordinate it rested on | what `main` says now | fixed by |
| --- | --- | --- | --- |
| hour two §1 | *"`const DEFAULT_LEAD_TICKS = 20; // 1 second at the kernel's 20 Hz.`"* — `src/ui/simulation-commands.ts:77` | the comment is gone. `const DEFAULT_LEAD_TICKS = 20;` is at `:118` under a docblock at `:86-117` that states the old sentence *"was true at ×1 and false at every other speed"* | **PR #952** (#942) |
| hour two §1 | *"a 20-tick lead is **250 ms of real time** at 4×"* — `projectFromClock`, `:190-195` | `:246-251` adds `leadTicks * TICK_MILLISECONDS` **before** the speed conversion, so the margin is one *real* second at every speed | **PR #952** |
| hour two §1 | *"A rejection means our idea of the sequence is wrong in an unknown direction. Drop the baseline"* — `:327`, and *"every press after it is refused until the next snapshot"* | `:385-388` calls `observeRejection` (`:483`), which **rewinds** the baseline on a `past-tick` refusal instead of dropping it, because that refusal proves the sequence was the expected one | **PR #952** |
| the misplay §1 | *"a bed standing on the wrong tile → `(not laid out)` — nothing"*, and *"the whole set of player-command successes the game will speak about is **four**"* | `ObjectPlacementService.remove` calls `recordObjectRemoved` at `:653`, and the locale carries `'hud.alert.event.objects.removed-spend-destroyed': 'The object was removed — the money it cost does not come back.'` The set is **five** | **PR #951** (#945) |
| the misplay §1 | *"`:174` `recordConstructionUndone`"* — `src/simulation/construction/handler.ts` | `:191`, and the signature changed: `recordConstructionUndone(undone.spendDestroyed ? 'spend-destroyed' : 'nothing-destroyed', context.tick)` — one call, two sentences | **PR #932** (#927), merged *before* this record landed |
| many prisons §1, §1.1 | *"`await this.host.startNew(masterSeed)` and `this.adoptSession(prisonId)` — it never captures or saves the outgoing session"* — `session-controller.ts:166-167` | `:216-217`, preceded at `:215` by `await this.captureOutgoingSession()`, inside a `try` whose `catch` runs `discardFailedCreation` | **PR #950** (#943), merged *before* this record landed |
| see my prison §5, §5b | *"Two actors on one tile therefore get the identical depth … the guard always wins and **the prisoners are always the ones hidden**"* — `actor-layer.ts:146`, `depth.ts:14-31`, `actors-from-snapshot.ts:149-172` | `src/rendering/actors/crowd-spread.ts` draws co-located actors at distinct points inside their own tile and `ActorLayer` takes the depth anchor from the **drawn** foot (`:224`), so there is no tie left to break. `actors-from-snapshot.ts` now says in its own comment that this order became load-bearing | **PR #954** (#944) |

**The last one is bounded and the bound matters.** `crowd-spread.ts`'s own
docblock says it: *"two or three actors on a tile read as two or three figures;
twenty-two read as a crowd standing on one tile rather than as one person… It
reports the crowd. It does not count it, and it does not unstack it."* So §5b's
headline — twenty-eight people drawing two figures — is dead, and its
underlying question, *how many are there*, is not answered on the canvas. The
simulation still puts them on one tile by construction.

**And one trap this pass is here to disarm.** the misplay §1's load-bearing
grep — *"`grep -n "events\.record" src/simulation/runtime/session-commands.ts`
returns exactly one line"* — is **still literally true** at `:539`, because
#951 recorded the removal in `ObjectPlacementService` rather than in that file.
An agent re-running that grep will see one line and draw the withdrawn
conclusion. The fact drifted; the inference behind it is dead.

### 2. Three citations that were wrong when written — the pass's actual refutations

Each is exact by the byte test above and wrong on inspection. This is the
category §7 could not have found by the method it used, and it is why a reading
pass is not the same as a diff.

- **`src/content/default-locale-en.ts:879-883`** (the misplay §1), cited for the
  owner's reasoning *"silence about a loss is the worst option"*. That range is
  a comment about `ProtocolFaultCode` locale entries and contains no such
  quote. The quote is in the same file at **`:929-933`** — at `:931` on
  `0e614c7` too, so the coordinate was **wrong the day it was written**, and it
  is wrong on the tree the record landed on. It also appears in four other files
  (`simulation-events.ts:225`, `types.ts:2204`, `event-log.ts:568`,
  `default-locale-en.ts:984`). **The substance is unaffected** — the quote is
  real and 75 lines away — which is exactly what makes this the cheap error to
  leave in place and the expensive one to follow.
- **`src/simulation/runtime/session-commands.ts:684`** (the misplay §1), cited
  for the `RemoveObject` arm's `refusals.supersede(removeKey)`. That statement
  was at `:672` on `0e614c7`; `:673` is the closing brace. Off by one, now at
  `:696`.
- **`src/main.ts:3164-3166`** (many prisons §1.1), cited for *"`WorkerPerSessionHost`
  **terminates** it"*. Those three lines are the worker-per-session comment the
  record quotes correctly and they do not mention termination; the sentence
  *"the outgoing worker is terminated before its replacement is built"* is at
  `:3171-3173`, and `terminate()` appears nowhere in `main.ts`. Imprecise
  rather than false.

### 3. Thirty-seven coordinates drifted and stayed true

Recorded so nobody re-derives them. Every one was located by its own text, not
by a guess at the offset.

| record | as cited | now on `main` |
| --- | --- | --- |
| touch-only | `hud.css:3716` (`@media (max-width: 720px)`) | `:3894` |
| touch-only | `default-locale-en.ts:1216` (`hud.build.arm-hint`) | `:1354` |
| touch-only | `default-locale-en.ts:1253` (`hud.build.arm-hint-object`) | `:1390-1391` |
| touch-only | `default-locale-en.ts:1933` (`hud.rooms.arm-hint`) | `:2071` |
| touch-only | `object-placement-service.ts:582-620` (`remove`, no wall edge in it) | `:627-687` |
| touch-only | `build-panel.ts:2010` (*"`queueSection` opens collapsed"*) | `:2133` |
| see my prison | `actor-layer.ts:146` (`setDepth(depthForAnchor(…))`) | `:224` |
| see my prison | `depth.ts:14-31` (`LAYER_BIAS` `{structure: 0, actor: 1}`) | `:14-25` and `:51-56` |
| see my prison | `actors-from-snapshot.ts:149-172` (guards built last) | `:149-177` |
| hour two | `simulation-commands.ts:251-253` (the *"has not reported its command sequence"* throw) | `:310-312` |
| hour two | `session-commands.ts:543` (`roster-full` at 500 hires) | `:567` |
| hour two | `default-locale-en.ts:1869` / `:1898` (the two refusal sentences) | `:2007` / `:2036` |
| hour two | `simulation-events.ts:447` (`MAX_EVENT_ALERT_ROWS = 8`) | `:488` |
| hour two | `new-session.ts:1187` / `:1190-1194` (`applyDefaultSecuritySector`) | `:1205` / `:1208-1212` |
| hour two | `construction/system.ts:1316` (`order.progress += 10`) | `:1419` |
| hour two | `construction/system.ts:210` (`intervalTicks: 10`) | `:269` |
| hour two | `construction/system.ts:203` / `:1310` (`MOCK_CREW_WORKER_ID`) | `:262` / `:1413` |
| hour two | `construction/system.ts:1142` (*"one order in progress at a time"*) | `:1245-1246` |
| the misplay | `session-commands.ts:515` (`recordDeliveryCancelled`) | `:539` |
| the misplay | `session-commands.ts:239` (`refusals.supersede(unzoneKey)`) | `:263` |
| the misplay | `object-placement-service.ts:582` / `:586` / `:608` | `:627` / `:631` / `:674` |
| the misplay | `construction/handler.ts:178` (`recordConstructionRedone`) | `:197` |
| the misplay | `build-panel.ts:1938` (`formatNumber(delivery.paidMinorUnits)`) | `:2061` |
| the misplay | `build-panel.ts:2146` (`collapsed: true` on the queue) | `:2269` |
| the misplay | `build-panel.ts:2283-2298` (*"`setUnavailable`, not `setDisabled`"*) | `:2431-2446` |
| the misplay | `simulation-events.ts:869-876` / `:877` (the *"render alike"* docblock and the raw integer under it) | `:910-917` / `:918` |
| the misplay | `default-locale-en.ts:1375` (`hud.build.queue-more`) | `:1513` |
| many prisons | `session-controller.ts:10` (`DEFAULT_AUTOSAVE_INTERVAL_MS`) | `:11` |
| many prisons | `session-controller.ts:434-437` (`adoptSession`) | `:603-606` |
| many prisons | `default-locale-en.ts:2049` / `:2051` (`save.list.item`, `save.status.idle`) | `:2187` / `:2189` |

Three of the drifted are worth a sentence of their own. `construction/system.ts`
carries **five** of them, all from one commit — `889ff5f9`, *"fix(construction):
an undo says what it destroyed (#927)"*, PR #932 — which merged before hour two
landed, so §8's arithmetic (59.1 measured ticks a wall against 60 predicted)
survives with every one of its five coordinates already stale on arrival. And
hour two §1's `simulation-commands.ts:167` is **not a citation at all**: the
record says so itself, in terms, before anyone could mistake it — it is a
`console.warn` stack frame from the Vite-served module, and the record's own
paragraph explains that the served line numbers are not the file's.

### 4. What is still live, checked rather than assumed

Of §4's seven ranked rows above, **four are done and one is not**:

- Row 1, the Security panel (#941), is **still true on `main`**. PR #955 is
  open, not merged (`mergeable_state: unstable`), and its own body sharpens the
  arithmetic further than §1 above did: *"requirement +1 is arithmetically
  insufficient for every incident this build can open — assault ≥3→2,
  escape ≥6→3, riot/gang ≥7→4, ceiling 10→5."* Every citation behind hour two
  §2 was re-opened and every one is exact: `sector-staffing.ts:190` and `:147`,
  `default-sector.ts:113` and `:100-112` (the quoted prediction is at
  `:108-111`, inside the cited range), `response-system.ts:345`, `:26` and
  `:499-512`, `trigger-system.ts:444`, `flashpoint.ts:373`.
- Rows 3, 4 and 5 — #942, #943, #945 — landed as PRs #952, #950 and #951.
- Row 2 splits. #954 fixed the *drawing*; the question underneath it — why the
  simulation stacks twenty-two prisoners on one tile — is answered in a
  measurement record and **unchanged in the simulation**, which
  `crowd-spread.ts`'s docblock states as its own limit.
- Rows 6 and 7 are untouched, and row 6's two citations are exact:
  `icon-button.ts:34` still puts the label in `title`, and
  `action-button.ts:8-10` still states the rule it breaks.

### 5. Was §7 too harsh, or not harsh enough?

**Both, in different directions, and the second is the finding.**

**Too harsh about the testers.** §7 worried that thirty verified citations might
not generalise. They do: 132 of 176 coordinates are byte-identical at the number
cited, and every claim this pass read beside its code was supported by it. Three
errors in 176 — one wrong range, one off-by-one, one imprecise — is a better
record than §7's caution implied, and two of the three are in one paragraph of
one record.

**Not harsh enough about the audit.** §7 framed the risk as *were these
citations right?* The risk it missed is that **a citation can be right and dead
at the same time**, and 44 of 176 are — including **16 that were already stale
on the commit that carried their own record onto `main`**. That is not a
tester's error. It is the merge sequence: #932, #940 and #950 landed between the
round's play session and the round's merges, and neither the testers (finished)
nor this audit (looking for wrong claims, not for stale ones) re-pinned
anything. `docs/AGENT_WORKFLOW.md` §4 already names this exact hazard — *"a
`file:line` into a document under active edit is the least durable citation
here"* — and it turns out to hold for a `file:line` into *code* under active
edit just as sharply, at a rate of 24% over one day.

**The sharpest single instance, and it is not flattering.** many prisons §1.1
ends by proposing the fix: *"`createPrison` could capture and save the outgoing
session before `startNew`, and then there would be nothing to warn about."* PR
#950 did precisely that, and merged **before** PR #953 put the record on `main`.
So the round's second-ranked destructive finding shipped as a live finding
hours after it had been fixed, in a note whose citation pointed at code that no
longer read that way. §7's stated weakness would not have caught it; a look at
the merge order would have.

**What would change this amendment's own mind.** Its method is a byte comparison
of a coordinate plus a reading of the claim around it. The claim was read beside
the code for touch-only §1-§7 and §9-§10, see my prison §1-§3, §5-§6 and §8-§9,
hour two §1-§3 and §8, the misplay §1 and §4-§9, and many prisons §1-§5 and §7 —
and **not** for the remaining sections, where only the coordinate was opened.
A record could still describe an unchanged line incorrectly in one of those, and
this pass would call it exact. Three such errors were found in the sections that
were read; the honest expectation is that a few more sit in the sections that
were not.
