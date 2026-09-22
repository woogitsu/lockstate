# What a neglected prison is told — which acknowledgements a failing prison can earn, and what is said when twenty-four walls go up

**Date:** 2026-09-16
**Tree played:** `origin/main` at **v0.0.640** (`e044a3e8`) in worktree
`/tmp/claude-0/wt-play2`, branch `agent/neglect-measurement`. **Nothing under
`src/` differs from that commit** — this branch adds one `*.playtest.ts`
instrument and this record. The status strip confirms the tree from inside the
running page in every act: acts 1–2 read `v0.0.640 · 778c988` and act 3
`v0.0.640 · d0ef350`, this branch's own instrument-only commits.

### Re-checked against `origin/main` on 2026-09-16, at `54adc87c` (v0.0.646)

This record was written on `e044a3e8` (v0.0.640) earlier the same day. **Nothing
measured then is edited away; both directions are marked** per
`docs/AGENT_WORKFLOW.md` §4 — the original reading keeps its commit and the
re-check is recorded beneath it with `54adc87c`.

- **Eight of the nine `file:line` citations are alive** at `54adc87c` and were
  opened again one at a time. **One is dead** —
  `src/simulation/protocol/types.ts:1866-1894` — and is re-pinned in §5 with the
  verbatim line at the new coordinate.
- **The two claims most exposed to §4's "an absence or a count rots first" were
  re-derived rather than re-read**, and both hold: `SIMULATION_EVENT_TYPES` has
  **six** `construction.*` members at `54adc87c` and **no member for a build
  finishing**.
- **§5's status line for ADR 0116 is overtaken**: the owner ruled it on
  2026-09-16. Marked in place. **And overtaken once more on 2026-09-17**, in
  the other half: the ruling reached `main` in `d1f3bf7c` (#1265), so the
  addendum's *"that file still opens its Status block Proposed"* is false as
  well. Both are marked at §5 rather than here.
- **§6's first bullet named an open question and left it open; it is closed
  here**, by opening the table it names.
- **ADR 0091 decision 2 was also ruled on 2026-09-16 (option F)** and bears on
  §6's `#894` bullet. Marked there.
- Everything else is a 2026-09-16 run on `e044a3e8` and is **not** re-run. A
  figure with no re-check line beneath it has not been re-measured.

### Re-checked again on 2026-09-18, at `eeda2e53` (v0.0.661) — the absence this record measured has been filled

Nothing above or below is edited away; this is a third layer on the same two
claims, marked rather than overwritten.

- **The headline absence is GONE, and it is the one thing this record most
  wanted watched.** #1284 merged ADR 0116's ruling into the code.
  `SIMULATION_EVENT_TYPES` now holds **seven** `construction.*` members, not
  six, and the seventh is `'construction.order-completed'` — **exactly the
  "member for a build finishing" §5 says does not exist.** §5's sentence stays
  as written because it is true of `e044a3e8` and `54adc87c`, which it names.
  **The name is worth carrying**: it is `construction.order-completed`, so a
  grep for `construction.completed` — the form the sibling cold-start record
  guessed — still comes back empty and reads as "still unbuilt".
- **The `SIMULATION_EVENT_TYPES` coordinate has moved a second time.** §5's
  2026-09-16 re-pin to `:1864`/`:1892` is dead at `eeda2e53`; the declaration
  `` export const SIMULATION_EVENT_TYPES = [ `` is at
  **`src/simulation/protocol/types.ts:1988`** and the array closes at
  **`:1920`**, `` ] as const; ``. That is two re-pins of one coordinate in
  three days, which is the measurement `docs/AGENT_WORKFLOW.md` §4 asks for
  when it says a `file:line` is the least durable citation here.
- **§6's *"exactly three `'log-only'` members"* is now FALSE — there are
  four**, and the fourth is `'construction.order-completed'`, routed
  `'log-only'` at `src/ui/simulation-events.ts:515-519` per ADR 0116 option 2.
  The three the block names are still three of the four, so **the explanation
  it gives for the band silence is unaffected**: `rooms.zoned` and
  `rooms.needs-cleared` are still `'log-only'` and `prisoners.housed` still
  `'band-and-log'`. Only the tally rotted, which is the sentence shape §4 says
  rots first.
- **The four `EVENT_PRESENTATION` coordinates in that block have moved by
  thirty-two lines**, the width of the block #1284 inserted above them:
  `:618` → **`:650`** (`rooms.needs-cleared`), `:619` → **`:651`**
  (`rooms.unzoned`), `:623` → **`:655`** (`rooms.zoned`), `:603-607` →
  **`:635-639`** (`prisoners.housed`). The block keeps its 2026-09-16 numbers
  because it is dated to `54adc87c` and they were right there; these are the
  readings at `eeda2e53`.
- **Still alive, re-opened one at a time:**
  `src/simulation/protocol/types.ts:1525` (`routeDecidedSince`),
  `src/ui/hud/hud.ts:1731`, and
  `docs/adr/0116-whether-a-finished-object-is-an-event.md:19`, which still
  opens *"Accepted, 2026-09-16, by the repository owner: option 2 — a"*.
- **What is NOT re-measured: everything the harness produced.** No act was
  re-run. What a neglected prison is told on `eeda2e53` — now that a finished
  wall has a log row — is unknown from this record, and the twenty-four-walls
  act in particular would very likely read differently.

---

## The question, and how it was refined

**As handed over:** *can a prison the player is neglecting earn the game's
acknowledgements, and what does the game say when a player does something large
and right?*

The doubt it comes from is named in
`2026-09-15-the-cold-start-on-five-sections.md` §8: `rooms.zoned` and
`prisoners.housed` are a player's own press and the payoff of one, *"what is
not established is whether either would fire in a prison the player is
neglecting, which is the test `prisoners.discharged` failed in the 2026-09-04
census"*. That census's §2 put the test plainly: the gate is *"a clock and a
stage, and nothing else"*, so the event *"fires for a prison that did
nothing"*.

**As refined, after reading the three producers and before any act was run**,
because "neglect" and "acknowledgement" both needed a definition a run could
hold:

> Of the three acknowledgements this tree has, which are gated on **a player's
> press** and which on **the prison's condition** — and can the press-gated ones
> be earned by a prison that is, at the same moment and by the game's own
> readouts, failing? And with the section held open so the diff is clean, what
> does the page gain when twenty-four ordered walls finish?

**The answer is a gradient rather than a yes or a no, and the brief's framing
survives for two of three.** `rooms.zoned` and `prisoners.housed` were both
earned, on this day, by a prison that then rioted twice with its only resident
at `Safety 0%` — §1. `rooms.needs-cleared` cannot be: its gate is the prison's
own shortfall reaching zero, and §3 shows what it costs to earn it. **And the
one thing I expected to find and did not is a false sentence** — §4. Both
acknowledgement strings state a narrow fact and their locale docblocks refuse,
in writing, to claim the wider one.

---

## Claim tiers

- **MEASURED** — produced by one of the acts below and quoted from its output.
- **VERIFIED, read** — a file in this repository was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **JUDGEMENT** — a claim about what a *player* would make of it. §7 names the
  weakest.

Nothing here is FROM MEMORY. Sentences are quoted from the laid-out page
(`innerText` of a named selector, through the harness's `panelText`, which
answers `"not laid out"` rather than empty for a hidden node); numbers like
`roomOccupants` and `treasuryMinorUnits` come from the worker's
`simulation/status-counts` through the tee. **The two channels are never mixed
in one claim**, and where the counts channel is stale it is said so: the worker
skips a counts publication equal to the last one, which
`playtest-harness.ts`'s `currentTick` docblock records and which is why every
tick quoted here comes from `simulation/clock-state`.

## Reproduction

`tests/browser/playtest-2026-09-16-neglect.playtest.ts`, one act at a time.
Nothing in CI collects it: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=45253 node_modules/.bin/playwright test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-16-neglect.playtest.ts -g "act 1"
```

| act | what it plays | result |
| --- | --- | --- |
| 1 | the neglected prison: a sealed doorless cell, one bed, no toilet, no guard, two admits, then four in-game days of nothing | `1 passed (4.8m)` |
| 2 | twenty-four walls finishing with the Build section never leaving the screen | `1 passed (1.8m)` |
| 3 | the same sealed cell, then repaired — door, then toilet — to see what the third acknowledgement costs | `1 passed (2.9m)`, then `1 passed (2.6m)` re-run past a day boundary |
| 1 (again) | act 1 repeated from a second container start, to see whether §1 is one sequence or a shape | `1 passed (3.8m)` |

**Five runs were obtained against a budget of about six.** Act 3 was run twice
and the first run is reported rather than discarded, because **its silence was
my own run's end and not the game's** (§3) — which is the shape
`docs/AGENT_WORKFLOW.md` §3 calls a truncated run, met in a playtest instead of
in CI.

**Presses were proved to land.** Every world gesture goes through the harness's
`press`/`drag`, which since #1017 compare what the page was last asked to place
against the `definitionId` on the command that came out, and throw on a
mismatch. No act threw.

**Git LFS is unprovisioned in this container, so no claim here rests on a
pixel.** `git lfs` is not a command here and every actor atlas fails to decode:
each act's console carries `World renderer: InvalidStateError: The source image
could not be decoded.` Every sentence quoted below is a DOM text node and every
number is from the worker. A reader wanting a claim about the drawn world needs
a different container.

---

## 1. MEASURED, act 1 — a prison neglected in every way the game can see earns two of the three acknowledgements

**What "neglected" means here, stated before the result, so it is a definition
and not a description of what happened.** The prison is a sealed 6×6 brick box
at tiles (12,12)–(17,17) — twenty-four wall segments and **no door**,
designated `Cell` — holding **one bed and no toilet**, with **no guard hired**,
and after the second admission **nothing is pressed again** for four in-game
days. Every one of those is a thing the game's own readouts complain about, at
the moment the acknowledgements arrive.

Both fired. Quoted off `.hud-alerts__list` at the end of the run, in the order
the column carries them:

> `Cell designated. Day 3` · `Info` · `Clear this alert`
> `Rafal Bakker has a place in Cell. Day 4` · `Info` · `Clear this alert`
> `A fight has broken out between two prisoners. Day 5` · `Warning` · `Clear this alert`
> `No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. 3× Day 7` · `Warning` · `Clear this alert`
> `A riot has broken out — 2 prisoners have stopped taking orders. 2× Day 7` · `Critical` · `Clear this alert`
> `Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.` · `Warning`

The 120 ms recorder dates each arrival within the run: the designation at
`+89707ms`, the housing at `+123056ms` (and on `.hud__event` at the same
sample: `"Rafal Bakker has a place in Cell."`), the fight at `+154054ms`, the
first riot at `+167126ms`, the last lapse at `+235091ms`.

**What the rest of the screen said about that same prison.** The status strip
after the four neglected days, at in-game `DAY 8`:

```
2 PRISONERS  1 with no bed / 0 HIGH RISK / 0 STAFF / 0 COVERAGE Unguarded /
1 ROOMS  1 not ready / 0 INCIDENTS Clear / 0 CONTRABAND / 23,885 FUNDS /
141 EARNED TODAY / DAY 8 / Through the day 65%
```

The Rooms panel, unchanged from the designation to the end of the run:

> `NOT READY` · `1 of 1` · `Cell at 12, 12 is missing` ·
> `a door — nobody can get in` · `1 × Toilet`

and the roster on the Schedule section:

> `PRISONERS 2 of 2` · `Rafal Bakker` `Medium` `Sleeping` `Safety 0%` ·
> `Adan Rossi` `Medium` `Idle` `Hunger 0%`

with the housed prisoner's own detail row:

> `Rafal Bakker` `Medium` / `Hunger 87%` `Sleep 100%` `Hygiene 6%`
> `Bladder 84%` `Safety 0%` `Recreation 29%` /
> `Sentence remaining (in-game days): 63`

**So the two `Info` rows a player reads first are, at that moment, sitting
above a `Critical` riot row, on a prison whose only resident is at `Safety 0%`
and whose cell the panel one section over says nobody can get into.**

**REASONED, and this is the whole of the finding:** the gate on each of the two
is the player's *press*, and nothing in either gate reads the prison's
condition.

- **`rooms.zoned`** is recorded at
  `src/simulation/runtime/session-commands.ts:320`, in the `DesignateRoom`
  branch, after `zone` returned an accepted outcome — and an accepted outcome
  asks for enclosure and a minimum size, not for a door, a bed or a toilet.
  **VERIFIED, read.**
- **`prisoners.housed`** is announced at
  `src/simulation/prisoners/intake-system.ts:658`, immediately after
  `RoomInstanceRegistry.assign` succeeds at `:649`. The questions asked on the
  way there are the room *type*, a free place, and the target's
  `requiredObjectCapability` (`:638-643`). **Access is not among them**: no
  branch on that path reads `RoomAccess`, so `'no-way-in'` — the state the
  Rooms panel was printing about this very room — cannot change the answer.
  **VERIFIED, read.**

### Repeated, and it is a shape rather than a sequence

Act 1 was run a second time from a fresh container start. **Every element of
the result repeated, with different names, different days and a different
prisoner drawn**; the alerts column at the end of the second run reads:

> `Cell designated. Day 2` · `Info` · `Clear this alert`
> `Malik Bakker has a place in Cell. Day 2` · `Info` · `Clear this alert`
> `A fight has broken out between two prisoners. Day 3` · `Warning` · `Clear this alert`
> `No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. 3× Day 6` · `Warning` · `Clear this alert`
> `A riot has broken out — 2 prisoners have stopped taking orders. 2× Day 6` · `Critical` · `Clear this alert`
> `Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.` · `Warning`

with the same strip badges (`1 with no bed`, `0 COVERAGE Unguarded`,
`1 ROOMS 1 not ready`), the same Rooms panel sentence, and the roster reading
`Malik Bakker / Medium / Sleeping / Safety 0%` and
`Omar Yilmaz / Medium / Idle / Hunger 0%`. The housed prisoner's detail:
`Hunger 84% / Sleep 100% / Hygiene 17% / Bladder 79% / Safety 0% /
Recreation 38%`. **Two runs, both with two acknowledgements above a `Critical`
riot row.** The treasury moved `22,805 → 24,185` over the same span.

**What is not established here.** Why the housed prisoner reads `Sleeping` with
`Sleep 100%` inside a room with no door: he is in it and asleep, and how he got
there is a question about locomotion this pass did not instrument and cannot
answer from a page with no art. That is worth naming because
[#933](https://github.com/woogitsu/lockstate/issues/933) §3 explicitly marks it
UNVERIFIED and says *"whoever takes this must settle that before writing any
instruction"* — **this run does not settle it**; it only shows the needs
readout for a doorless cell's resident is not uniformly zero, with `Sleep` at
`100%` and `Safety` at `0%` in the same column.

---

## 2. MEASURED, act 1 — and the neglected prison is paid

Treasury readings through the tee, beside the moment each was taken:

| moment | `treasuryMinorUnits` |
| --- | --- |
| after buying 50 bricks and 3 beds' worth of planks | `22,805` |
| two admissions, in-game `DAY 6` | `22,805` |
| four neglected days later, `DAY 8` | `23,885` |

with `EARNED TODAY 141` on the strip at the end and the Overview panel, sampled
a little later in the same act, reading `FUNDS 24,105 / EARNED TODAY 72 /
WAGES A DAY 0`.

**That is an observation, not a balance finding.** It is one prison, four days,
one run; `2026-08-29-what-a-day-actually-pays.md` is the record that took the
rate question seriously and this one does not re-take it. What it does show is
that nothing in the four days of neglect *cost* the prison anything the
treasury could see — there is no wage bill without a guard, and the riots did
not appear as a charge in any figure this pass sampled.

---

## 3. MEASURED, act 3 — the third acknowledgement is gated on the prison, and it arrives late

`rooms.needs-cleared` is the one acknowledgement of the three that a neglected
prison cannot earn, and act 3 is what it costs to earn it. Same sealed doorless
cell, same bed, and then: one north wall segment removed, a `door-wooden`
ordered on the edge it vacated, and a toilet placed last so the shortfall
reaches zero on the toilet and nowhere earlier. The Rooms panel's needs block
at each step:

| after | `.hud-rooms__needs` |
| --- | --- |
| the bed | `NOT READY / 1 of 1 / Cell at 12, 12 is missing / a door — nobody can get in / 1 × Toilet` |
| removing one wall segment | `NOT READY / 1 of 1 / Cell at 12, 12 is missing / 1 × Toilet` |
| the door built | `NOT READY / 1 of 1 / Cell at 12, 12 is missing / 1 × Toilet` |
| the toilet built | `.hud-rooms__needs: not laid out` — the block is gone |

and then, at the next once-a-day pass, on `.hud-alerts__list`:

> `Cell is no longer short anything the Rooms panel checks for — that is not a
> claim anyone can get in. Day 3` · `Info` · `Clear this alert`

**The first act 3 run reported this as a silence and was wrong, and the
correction is the reason both runs are in the table.** That run stopped at tick
`5,335`, some fifteen hundred ticks after the toilet finished, and nothing had
been said. **VERIFIED, read:** `RoomNeedsClearedNoticeSystem`'s schedule is
`{ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 }`
(`src/simulation/rooms/room-needs-cleared-notice.ts:139`), with
`DAY_LENGTH_TICKS = 2_400` (`src/simulation/prisoners/regime.ts:12`) — **once
an in-game day, on the day's last tick**. The next pass after that toilet was
tick `7,199`, and the run had ended. The second run waited for it: the shortfall
cleared at tick `7,103`, the band and the column said nothing at `+3s`, and the
sentence arrived in the column by tick `7,592`.

**So the acknowledgement for repairing a room is owed up to a full in-game day
after the press that earns it** — up to 2,400 ticks, which at `×4` is roughly
fifty seconds of a player's own time, and at `×1` is minutes. **JUDGEMENT:**
the player who places the last toilet gets nothing in the beat where they
placed it. **REASONED:** that cadence is deliberate and argued in the system's
own class comment (the *"Why once a day"* section it refers to), so this is a
consequence of a decision, not a defect; §6 does not file it as one.

**The three acknowledgements, and what each is gated on** — VERIFIED, read,
with each gate opened at the line cited:

| acknowledgement | gate | can a neglected prison earn it? |
| --- | --- | --- |
| `rooms.zoned` — *"{room} designated."* | the `DesignateRoom` command being accepted (`session-commands.ts:314`) | **yes, measured** |
| `prisoners.housed` — *"{name} has a place in {room}."* | `RoomInstanceRegistry.assign` succeeding (`intake-system.ts:649-658`) | **yes, measured** |
| `rooms.needs-cleared` — *"{room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in."* | `missingCapability + (access is 'no-way-in' or 'unreachable' ? 1 : 0)` reaching zero, read once a day (`room-needs-cleared-notice.ts:179`, `:139`) | **no** |

---

## 4. The thing I went looking for and did not find: neither sentence is false

The brief's most valuable outcome would have been a player-facing sentence that
is not true, which is `AGENTS.md`'s fourth reservation. **The hypothesis was
that `"{name} has a place in Cell."` is false of a prisoner in a room the panel
one section over calls `a door — nobody can get in`. It is not, and the refusal
to claim that was written down before I arrived.** **VERIFIED, read**, the
locale docblock above `'hud.alert.event.prisoners.housed'`
(`src/content/default-locale-en.ts`, the entry at `:1651`):

> "Has a place" is exactly that fact and no more: not that the room satisfies
> the catalog's full requirement list … not that it is reachable, not that it
> is permanent.

and the same for the designation, above `'hud.alert.event.rooms.zoned'`
(`:1706`):

> **Not that anybody can get in.** `ZoneRoomAccepted.enclosure` may read
> `'sealed'` for a room with no doorway at all … So no clause here implies the
> room will be *used*.
>
> **Not that it works.** … So no clause here promises *function*.

**So the finding is not that the game lies. It is narrower and it is about
what a player assembles from two true sentences**: the acknowledgement column
says the designation and the housing went right, and the panel that says the
room has no door and no toilet is on a different section. **JUDGEMENT:** each
sentence is defensible alone and the pair is congratulation; this is a
composition question and not a truth question, which is why it is reported here
rather than filed as reservation 4.

**One sentence was measured in a state that looks wrong and is documented as
right, and it is recorded so the next pass does not re-file it.** Removing a
**finished** wall from a designated cell — act 3, `RemoveWall` on a segment
built two in-game days earlier, with the build queue empty — put this on the
event band:

> `The order was cancelled. Anything already spent past the point of no return
> stays spent.`

There was no order. **VERIFIED, read:** the docblock above
`'hud.alert.event.construction.order-cancelled-underway'` covers exactly this
case and argues it true — the money did not come back and the materials were
destroyed, so *"`recordBuildOrderCancelled` now records it for `'completed'` as
well as for `'in-progress'`"*, under the owner's *"silence about a loss is the
worst option"*. **The clause after the full stop is true of a demolition. The
noun before it is the part a player reads as wrong**, and that is a wording
question inside a release the owner has already ruled on twice; it is reported,
not filed.

---

## 5. MEASURED, act 2 — twenty-four walls finish, and the page loses four sentences and gains a percentage

The 2026-09-15 pass measured this and stated its own limit: reaching the next
step meant changing section, so *"everything else in the diff is confounded"*.
Act 2 removes the confound by never leaving the Build section from the moment
the orders are laid to the moment the queue empties, and diffing **every
laid-out text node on the page** across that.

**GAINED (1):** `53%`
**LOST (4):** `24%`, `An order is queued now and built while the clock runs.`,
`Queued`, `6 waiting · 0 being built`

The two percentages are the day-progress readout, sampled at two moments. So,
with nothing else moving on the page:

**What the game does when twenty-four paid-for walls finish is delete the
block that was talking about them.** The queue readout, the word `Queued` and
the sentence explaining the queue all go; the event band stays hidden; the
alerts column gains nothing (its only row through the whole act is the probe
refusal `calibrate` leaves); and the status strip is byte-identical either side
apart from the clock.

The queue's own countdown, logged from inside the section:

```
+   0ms  "QUEUED / 6 waiting · 1 being built"
+ 351ms  "QUEUED / 5 waiting · 1 being built"
+1804ms  "QUEUED / 3 waiting · 1 being built"
+3330ms  "QUEUED / 1 waiting · 1 being built"
+4783ms  ".hud-build__queue: not laid out"
```

**VERIFIED, read — the silence is structural rather than a missed case.**
`SIMULATION_EVENT_TYPES` (`src/simulation/protocol/types.ts:1866-1894` —
**re-pinned 2026-09-16 at `54adc87c`: that coordinate is dead, `:1769` now reads
`` * sentence ended, a payday failed, a fight broke out -- and the heading above ``
inside an unrelated docblock. The declaration is at **`:1864`**,
`` export const SIMULATION_EVENT_TYPES = [ ``, and the array closes at `:1892`,
`` ] as const; ``**) holds
six `construction.*` members — `order-cancelled`,
`order-cancelled-underway`, `redone`, `undo-refused-newer-action`, `undone`,
`undone-spend-destroyed` — and **every one of them is a cancellation, an undo
or a refusal of an undo.** There is no member for a build finishing, so no
routing decision and no sentence could produce one.

**This is already described, and better, in a document I did not know about
when I ran the act.** ADR 0116, *"Whether a finished object is an event"*
(`docs/adr/0116-whether-a-finished-object-is-an-event.md`, **Proposed,
2026-09-15**, unbuilt), argues the same absence from the source: *"nothing on
this channel reports a build finishing, which is the one thing a player does
most and watches most closely"*, and frames it against article 6 of the
identity constitution — *"a player scrolling the alerts column back through an
hour of play can see every room they designated, every prisoner housed, every
payday missed, and not one of the forty walls they built."* **What act 2 adds
is the measurement that ADR does not have**: with the section held open, the
whole page's clean diff at completion is one text node gained and four lost,
so the absence is not merely an absence on the events channel — nothing
anywhere on the screen marks it.

> **Overtaken on 2026-09-16, and only the status line: the owner ruled ADR
> 0116.** The paragraph above is kept as written because *"Proposed,
> 2026-09-15, unbuilt"* is what that document said when this act was run. The
> ruling is **option 2** — a construction-completion event, graded `'info'`,
> routed `'log-only'`, and **counted rather than repeated**, so twenty-four
> segments finishing produce one row rather than twenty-four.
>
> **The measurement itself is untouched and was re-derived at `54adc87c`
> rather than assumed.** `SIMULATION_EVENT_TYPES` still holds exactly six
> `construction.*` members and still has no member for a build finishing, so
> act 2's *"nothing anywhere on the screen marks it"* is still true of the
> code on the day this was re-checked. What changed is that it is now a
> **decided and unbuilt** gap rather than an open question — and the routing
> the ruling chose, `'log-only'`, is the same routing §6 below establishes for
> the two acknowledgements that never reached the band. `docs/adr/0116-…md`
> in this tree still opens its Status block *"Proposed, 2026-09-15. Not
> self-approved, and it implements nothing."*; that file is another agent's
> surface and is not edited from here.
>
> **That last sentence stopped being true on 2026-09-17 and is kept rather than
> rewritten** (`docs/AGENT_WORKFLOW.md` §4, *mark both directions*). The
> branch holding the ruling merged as `d1f3bf7c` (#1265), and
> `docs/adr/0116-whether-a-finished-object-is-an-event.md:19` on `main` at
> `c9b4a7f7` now opens:
>
> > **Accepted, 2026-09-16, by the repository owner: option 2 — a
> > construction-completion event, graded `'info'`, routed `'log-only'`.**
>
> So the gap is decided **and recorded**, where on 2026-09-16 it was decided
> and unrecorded. **The measurement is unaffected and was re-derived at
> `c9b4a7f7` rather than carried over**: `SIMULATION_EVENT_TYPES` is still
> **27** members holding still exactly **six** `construction.*` ones —
> `order-cancelled`, `order-cancelled-underway`, `redone`,
> `undo-refused-newer-action`, `undone`, `undone-spend-destroyed` — and
> still no member for a build finishing. The ADR's `Status` moved; nothing
> under `src/` did, which is what the ruling's own text says of itself.

---

## 6. What else the runs produced, and what is already filed

- **The acknowledgements do not all reach the band.** Across acts 1 and 3 the
  120 ms recorder caught `prisoners.housed` on `.hud__event`
  (`"Rafal Bakker has a place in Cell."`, and `"Malik Bakker has a place in
  Cell."` in the repeat) and never caught either `rooms.zoned`
  or `rooms.needs-cleared` there — both appear only in the alerts column, in
  both runs of act 3 and in act 1. **Cause not established from a run**, and
  there is a candidate a reader should check rather than take from me:
  `EVENT_PRESENTATION.surfaces` (`src/ui/simulation-events.ts`) routes members
  per-member, and ADR 0116 §2 records that *"three members have since been
  routed `'log-only'`, each by a ruling"* with #1006 findings 3 and 5 named.
  That would make this the intended routing and not a defect; I did not open
  the table to confirm which three, and say so rather than assert it.

  > **Opened on 2026-09-16 at `54adc87c`, and the candidate is confirmed:
  > this is the intended routing and not a defect.** `EVENT_PRESENTATION` has
  > exactly **three** `'log-only'` members, and the run's two silent
  > acknowledgements are two of them:
  > `` 'rooms.needs-cleared': { labelKey: 'hud.alert.event.rooms.needs-cleared', severity: 'info', surfaces: 'log-only' }, ``
  > (`src/ui/simulation-events.ts:618`),
  > `` 'rooms.unzoned': … surfaces: 'log-only' }, `` (`:619`) and
  > `` 'rooms.zoned': { labelKey: 'hud.alert.event.rooms.zoned', severity: 'info', surfaces: 'log-only' }, ``
  > (`:623`). The third is `rooms.unzoned`, which no act here fired. The one
  > acknowledgement the recorder **did** catch on `.hud__event` is the one
  > routed otherwise: `` 'prisoners.housed': { … surfaces: 'band-and-log', }, ``
  > (`:603-607`). **So the observation is fully explained by the table and
  > nothing here is a defect** — three log-only, one band-and-log, and the
  > recorder saw exactly that. The comment above the pair states the reason in
  > place (`:613-617`): *"a player who just fixed or removed a room already
  > knows they did, so the confirmation belongs in the historical record …
  > rather than interrupting the band"*.
- **`#894`'s measurement reproduces again, on a third day.** The probe refusal
  from `calibrate`'s first press was still the last row of the alerts column at
  the end of act 1 — `DAY 8`, 4.8 minutes of play — with no `Day` stamp and no
  `Clear this alert`, under five rows that have both. The 2026-09-15 pass
  reproduced this twice on the same tree (v0.0.640, `e044a3e8`); this is a third and fourth independent
  reproduction on the same tree.

  > **Narrowed on 2026-09-16 by a ruling, not by a re-run.** The owner ruled
  > ADR 0091 decision 2 (option F) that day: *a decided outcome of the same
  > command route retires the refusal band*, carried on
  > `SimulationRefusal.routeDecidedSince`
  > (`src/simulation/protocol/types.ts:1525`,
  > `` routeDecidedSince: z.literal(true).optional(), ``) and acted on at
  > `src/ui/hud/hud.ts:1731`,
  > `` if (notice === undefined || notice.routeDecidedSince === true) { ``.
  > `calibrate`'s probe refusal is a `remove-wall.nothing-to-remove`, so on
  > `54adc87c` **any later removal the player makes retires it from the band**
  > — the docblock at `src/ui/hud/hud.ts:1302-1303` names this exact case,
  > *"A `remove-wall.nothing-to-remove` refusal is retired by the player's next
  > removal, whatever tile it names"*. **Act 1 makes no removal after
  > `calibrate`**, so the reading above is what act 1 would still produce;
  > **act 3 does**, so its probe refusal would not survive on today's tree.
  > This is read from the code and from the ruling; no act was re-run for it.
  > And the narrowing does not reach `#894`'s own subject, which is the alerts
  > **row**: option F retires the band and leaves the column entry standing,
  > which is the divergence it was bought for.
- **The riot is the sharpest thing the run produced and it is not this
  record's subject.** Two riots and three lapsed incidents in a two-prisoner
  prison with no guard, between in-game days 5 and 7. Whether that rate is
  right is a balance question and no act here measured it.
- **Searched and not found:** the GitHub issue search for a filed report of a
  build completion going unannounced returned nothing before the API rate limit
  cut the second query short, and the repository's own documents point to
  **#960** (the census claim, whose headline ADR 0116 §1 shows is history) and
  **ADR 0116** itself. **#960 was read on 2026-09-16 and is still open**, with
  its own §6 refutation criterion — *"a shipped event type that reports a
  success which the census missed … falsifiable by opening `types.ts`"* — met
  three times over by the three acknowledgements this record is about. Nothing
  was commented on it; that is somebody's call to make, not this pass's. The neglect question — an acknowledgement earned by a
  failing prison — I found nowhere, in issues or in `docs/`.

---

## 7. What this record does not claim

- **Nothing about anything drawn.** LFS is unprovisioned here; every actor
  atlas failed to decode in every act.
- **No cause for the riots, and no impact claim for any finding.** §1 says what
  was on screen and what the gates read; it does not say what either costs a
  player.
- **Nothing about the daily rate.** §2 is three treasury readings on one
  prison.
- **Two runs of act 1 and two of act 3; one run of act 2.** The wall diff in
  §5 is a single measurement, and its two snapshots straddle a repaint — the
  queue readout sampled beside the first snapshot says `6 waiting · 1 being
  built` while the snapshot's own node says `6 waiting · 0 being built`.
- **Nothing about the fourth reservation.** §4 is the negative result: I looked
  for a false player-facing sentence in the acknowledgement set and found two
  whose docblocks pre-emptively refuse the wider claim.

## 8. The weakest claim, and what would change my mind

**The weakest claim is §1's framing that this prison is "neglected" at all.**
It is a definition I chose — sealed, toiletless, unguarded, untouched for four
days — and a reader could fairly say that building a twenty-four-segment
perimeter, designating it and placing a bed is not neglect but a *bad build*,
which is a different thing. The finding survives that objection only in the
narrow form the gates give it: neither acknowledgement reads any condition of
the prison, so **no** amount of neglect after the press can withhold either.
**What would change my mind:** a prison built with less care than this one that
fails to earn them anyway — which would mean a gate I did not find. Opening
`session-commands.ts:314` and `intake-system.ts:649-658` is the ten-minute
check.

**The second weakest is §5's "nothing anywhere on the screen marks it".** It is
a claim about a text-node diff of one screen at one viewport (1440×900), and a
node that is present both before and after but *changes meaning* — a figure, a
badge — would not appear in it. **What would change my mind:** a chip or a
counter somewhere on the strip that moves on completion; the strip readings
either side are in the act's log and they are identical apart from the clock,
which is the strongest form of that check I could run.
