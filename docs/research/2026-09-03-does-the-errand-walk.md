# 2026-09-03 — does the errand walk when a player watches it?

**Played on `playtest/the-errand-walks`, cut from a fresh `origin/main` at
v0.0.412 (`5a2756d1`).** Three runs of
`tests/browser/playtest-2026-09-03-the-errand-walks.playtest.ts`, which is the
instrument and is not a CI gate (`tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`).

Every figure below is **VERIFIED** — obtained from a run and pasted — unless it
is labelled otherwise. Where a claim is an inference from reading the code
rather than from a run, it says so.

## The question

[ADR 0093](../adr/0093-a-carry-is-an-action.md) was accepted by the owner on
2026-09-03 and the mechanic landed the same morning: `JobSystem` deleted,
`action.carry` appended to `DEFAULT_ACTIONS`,
`src/simulation/operations/carry-executor.ts` and `delivery-route.ts` new.
`tests/foundation/job-production-contract.test.ts` already gates it at the
kernel level, through `Kernel.submitCommand`. **Nobody had ever seen the errand
happen through the user interface**, and a playtest that morning was cut off
before its watch window. That is the whole of what this record answers.

## The answer, in one line

**The errand works when a player watches it, and the roster says "Errand".**

## The prison, and how it was built

Three rooms in one row sharing their vertical walls, with two internal doors,
placed so that (16,16) — `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, the tile an
admitted prisoner arrives on — is inside the storeroom:

```
         x=8        x=12   x=14      x=17
  y=14   +----------+------+---------+
         |   BAY    | CELL |  STORE  |
  y=16   |        [door] [door]  *   |   * = (16,16), the arrival tile
         |   4x4    | 2x4  |   3x4   |
  y=17   |          |      |         |
  y=18   +----------+------+---------+
```

Every order was placed through the **Build panel's typed route**
(`.hud-build__coordinates`: two number fields, an edge chooser, a Place
button), not by dragging on the canvas, because a wall drag that passes under a
HUD island is silently truncated (issue #878) and a drag-built prison has to be
verified before anything measured inside it means anything. **34 typed orders
produced exactly 34 commands** in all three runs — 32 `wall-brick`, 2
`door-wooden`. Zoning went through the Rooms panel's typed route
(`.hud-rooms__coord-{x,y,width,height}` → `Use these tiles` → `Designate`) and
**all three rooms were accepted on the first attempt** in runs 2 and 3.

The cell was zoned, furnished and populated **before** the bay and the
storeroom were furnished, which is the order that dissolves the bootstrap trap
the landing change recorded: a furnished bay with no carrier strands every
delivery in it, and the bed that would make a carrier is a build order waiting
on those bricks.

## Finding 1 — the errand walks, and here is every tick of it

Run 3, clock at **1x** for the watch window, sampled with no artificial delay
(about one sample every one or two ticks). `store` is `Container.quantityOf`
for `item.brick` in `construction-materials`; `bay` is
`container:room.delivery-bay:8:14`, as `[quantity, reserved]`.

| tick | day-tick | prisoner tile | action / phase | job state / leg | bay | store | **what the roster said** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7396 | 196 | — | — | *(raised)* | 10, 0 | 15 | — |
| 7779 | 579 | (12,14) | `action.sleep` / idle | `available` / pickup | 10, 0 | 15 | **Heading to Errand** |
| 7790 | 590 | (12,14) | `action.carry` / travelling | `assigned` / pickup | 10, **10** | 15 | **Heading to Errand** |
| 7810 | 610 | **(10,16)** | `action.carry` / travelling | `assigned` / pickup | 10, 10 | 15 | **Heading to Errand** |
| 7820 | 620 | **(8,14)** | `action.carry` / **performing** | `assigned` / pickup | 10, 10 | 15 | **Errand** |
| 7841 | 641 | (8,14) | `action.carry` / travelling | `assigned` / **dropoff** | **empty** | 15 | **Heading to Errand** |
| 7873 | 673 | **(12,16)** | `action.carry` / travelling | `assigned` / dropoff | empty | 15 | **Heading to Errand** |
| 7883 | 683 | **(14,14)** | `action.carry` / performing | `assigned` / dropoff | empty | 15 | **Errand** |
| 7904 | 704 | (14,14) | `action.carry` / idle | **`completed`** / dropoff | empty | **25** | **Errand** |

Read off that table, and each is a separate claim ADR 0093 makes:

- **The producer works.** A `PurchaseMaterials` press through the Build panel's
  buy control landed 10 `item.brick` in `container:room.delivery-bay:8:14` —
  a container derived from the room instance id and registered on first use —
  and `DeliveryBayCarryRoute` raised `delivery.<orderId>.7396` with source
  (8,14) and destination (14,14), the two rooms' anchor tiles.
- **The prisoner visibly walks both legs, and they go in opposite
  directions.** Pickup: (12,14) → (10,16) → (8,14). Drop-off: (8,14) → (12,16)
  → (14,14). Six distinct tiles across two journeys inside one action.
- **The stock is reserved at selection, not at arrival.** The bay reads
  `[10, 10]` from tick 7790 — the tick the carry was selected and the prisoner
  was still standing in the cell — and empties at pickup. That is ADR 0093
  decision 1's departure from ADR 0029 decision 2, observed.
- **The materials arrive in the storeroom.** `construction-materials` goes
  15 → 25 on the drop-off tick, and the bay container is left empty.
- **The dwell is at each end, not the action's life.** `performing` at 7820
  (pickup) and again at 7883 (drop-off), with a `travelling` phase in between —
  one action, two journeys, two dwells.
- **The whole errand cost 114 ticks** from selection (7790) to completion
  (7904), of which 51 were the pickup leg and its dwell.

## Finding 2 — the label is "Errand", and it is on screen

The owner's ruling landed. `src/content/simulation-message-keys.ts:204` reads
`'action.carry': 'Errand'`, marked in that file as a draft for the owner's
review in the same form `action.kitchen-work`'s `'Kitchen Duty'` has carried
since #532. `git log -S` puts it on `main` in `cd41a1d6`, the commit that
accepted ADR 0093 (#863).

**Correcting a record in this directory:**
`docs/research/2026-09-03-what-the-owner-still-owes.md` says *"Not landed. PR
#863 is open. `action.carry` does not exist in `src/`; `DEFAULT_ACTIONS` still
ends at `action.kitchen-work`."* That was true at v0.0.403 (`f948b8e2`), which
is the commit that record measured; #863 has since merged. Per that directory's
own rule a record here is not edited to match current `main` — this paragraph
is the newer record saying so.

**On screen the label appears in exactly one place**, and only in one of its two
forms at a time:

- Performing: **`Errand`**.
- Travelling: **`Heading to Errand`** — `hud.regime.roster-heading`,
  `'Heading to {activity}'`, applied because `PrisonerRosterRowViewModel`'s
  `travelling` flag is `actionId !== undefined && actionPhase === 'travelling'`
  (`src/ui/simulation-prisoner-roster.ts`).

**"Heading to Errand" is a sentence, and whether it is the right one is the
owner's.** It is reported and not touched. The panel's own comment beside
`formatPrisonerActivity` argues that *"'Heading to Idle' is not a sentence"* and
that the wrapper exists *"because only the walk is about a place the prisoner is
not yet"* — and a carry is the one action in the catalogue whose target is not a
place. Four of the nine samples above read `Heading to Errand`, so it is what a
player sees for most of the errand.

## Finding 3 — a delivery waits in the bay and nothing says so

Measured three times, and it is exactly the standing condition ADR 0093
decision 2 requires and item 9 of its change list deliberately did not build:

| run | job raised | carry selected | ticks the delivery sat `available` | what the player was shown |
| --- | --- | --- | --- | --- |
| 2 | 7234 | ~7790 (est.) | **~466** | roster: `Sleeping` |
| 3 | 7396 | 7790 | **394** | roster: `Sleeping` |
| 3 (second) | 8027 | not captured | — | roster: `Heading to Errand` |

`.hud__refusal` was **not laid out** and `.hud-alerts` was **absent** at every
sample in every run, including the samples taken with the clock paused. The
Build panel's `.hud-build__deliveries` block covers a *pending purchase*, not a
delivery that has landed and is waiting for a carrier, so it says nothing about
this either. `PRISON_CONDITIONS`
(`src/simulation/protocol/types.ts`) still holds four members —
`construction.unfunded`, `intake.no-place`, `treasury.construction-refused`,
`treasury.deliveries-refused` — and none of them is this.

**That is the feature working as designed and as documented**, and the cost is
the one ADR 0093 states: the wait is real and unexplained. 394 ticks is the
short case; the document's own bound for the long case is 1,100.

## Finding 4 — there is no detail panel for the sentence to appear in

The brief asked what the detail panel says. **The shipped HUD has none.**
`hud/prisoner-detail` has a projection route and no reader in `src/ui/` or
`src/rendering/`, recorded in
`tests/foundation/projection-reachability-contract.test.ts`'s
`UNPAINTED_PROJECTION_IDS` and blocked on the selection model
`tests/foundation/unconsumed-action-contract.test.ts`'s
`AWAITING_CONSUMER['selection.primary']` describes. So `PrisonerActionViewModel`
— which carries `actionId`, `category`, `phase`, `phaseStartedAtTick`,
`needFulfilledLastTick` and an optional `targetRoomInstanceId`, and carries **no
item and no quantity** — reaches no screen at all.

**One sentence in the landing change's own record is wrong about this**, and it
matters because it describes a player-visible surface. `docs/adr/STATUS-QUEUE.md`
says of the label: *"the roster and the detail panel will say *Errand* until the
owner says otherwise"*, and of the third owed sentence: *"Nothing was added, so
the panel currently says what it says for any action."* There is no panel. The
label is on screen in the roster and nowhere else, and ADR 0093's third owed
sentence has nowhere to be said even once the owner writes it. Reported rather
than edited: that document is under active edit and the sentence is quoted so a
grep finds it.

## Finding 5 — at 4x the entire mechanic fits between two samples

Run 2 watched the same prison at 4x and **saw nothing**: it caught tick 7897
with the job already `completed`, never observed an intermediate tile, and the
roster sample taken at that moment read `Association` — the action the prisoner
had already moved on to.

The arithmetic, and it is not a property of the instrument alone:
`FixedStepClock`'s `stepMilliseconds` is 50, so 4x is **80 ticks a wall-clock
second**, and the whole errand is 114 ticks — **1.4 seconds**. A player watching
at 4x sees a prisoner leave a cell and reappear in a storeroom inside a second
and a half, with the roster cell changing twice in that time. Whether that is
worth a ruling is the owner's; it is recorded because "the mechanic is
observable" turned out to depend on the clock speed, and every playtest of it
before this one ran at 4x.

## Finding 6 — four in-tree statements assert the feature does not exist

Found while reading, then verified by opening each one. The landing change
updated `docs/OPERATIONS.md`, ADR 0059's two sentences, `docs/PERSISTENCE.md`,
`docs/DETERMINISM.md`, `tests/foundation/unconsumed-content-contract.test.ts`
and `tests/foundation/job-production-contract.test.ts` — carefully, in both
directions — and left these four:

1. **`src/simulation/economy/procurement.ts`, the file header.** *"The physical
   route in the middle — `room.delivery-bay`, a carry job, a construction site
   with a location — is **not** here … so there is no bay to deliver to."* The
   route is in this class: `update` calls
   `this.carryRoute?.landAndRaiseCarry(...)` about 380 lines below that
   sentence, and the `carryRoute` constructor parameter is the middle arrow the
   header says is absent.
2. **`src/simulation/runtime/new-session.ts`.** *"**Directly, and that is
   scaffolding.** … No session instantiates that room … so there is no bay to
   deliver to, and inventing one would mean deciding where a new prison's bay
   sits and when a carry job is raised."* `DeliveryBayCarryRoute` is
   constructed in this same function, and this record's runs zoned and
   furnished a bay from the shipped panels three times.
3. **`tests/foundation/room-routing-contract.test.ts`, `UNROUTED`.**
   `room.delivery-bay`: *"`object.loading-dock-door`'s `delivery-access`
   capability has no reader."* `room.storage-room`: *"no container is bound to
   a room instance. `object.storage-rack`'s `item-storage` capability has no
   reader."* All three clauses are false. Both rooms are still correctly *in*
   the list — no prisoner is routed *into* either, because `action.carry`'s
   target is `{ kind: 'job-board' }` and the carrier walks to a tile — so the
   gate passes and only the reasons rot, which is what that file's own rule
   about reasons is meant to prevent.
4. **`tests/foundation/content-vocabulary-contract.test.ts`,
   `UNGATED_BY_ANY_ACTION`.** `delivery-access` *"names ADR 0017's procurement
   route as the system that would consume it"*; `item-storage` *"names #99's
   salvage destination as what would consume it"*. `delivery-route.ts`'s own
   header points **at these two entries** and says *"This is that system"* —
   so the landing change read them and did not correct them.

All four are prose. They are fixed on this branch in a separate commit, both
directions marked, with no behaviour change.

## Finding 7 — a prisoner sealed out of their own cell starves in silence

Run 1's layout was mine and wrong: the block sat at y=10..13 and its only two
doors were internal, so (16,16) was outside a fully sealed perimeter. The prison
built correctly, both rooms zoned and furnished, the delivery landed, and the
board raised the carry at tick 18855. Then:

- The prisoner stood on **(16,16) for 12,000 ticks and never moved once**,
  cycling `action.sleep`, `action.eat-in-cell`, `action.use-toilet` and
  `action.free-association` through `travelling` and straight back to `idle`.
- `action.carry` was selected, and the job went to `failed` with
  `failReason: 'unreachable'` — the navigation vocabulary passed through
  verbatim (`RouteFailureReason`, `src/simulation/navigation/route.ts`). The 10
  bricks stayed in the bay.
- Hunger fell to **0 and stayed at 0 for roughly 10,000 ticks** (tick ~20,720
  to the end of the run at 30,736).
- What the player was shown: the roster row cycling ordinary activities
  (`Heading to Sleeping`, `Eating in Cell`, `Using Toilet`) and a worst-need
  column reading `Hunger` / `Minimal`. The refusal band was not laid out and
  `.hud-alerts` was absent throughout. **Nothing anywhere said the prisoner
  could not reach anything.**

This is not an ADR 0093 defect — the errand failed for the same reason
everything else did — and it is recorded because a player who walls a prison
wrong gets one signal (a need bar at the floor) for a cause that has nothing to
do with needs. **It is a measurement, not a diagnosis**: what I did not
establish is whether any surface is *meant* to report an unroutable
accommodation, or what it would cost to add one.

## Finding 8 — hunger in a work block, and why the recorded hole did not bite

The build recorded a hole: a work block allows no `meal` category
(`GENERAL_POPULATION_REGIME`'s two work blocks allow `work`, `education`,
`free-association`), so a prisoner whose hunger has fallen below
`STATE_INCOME_UNMET_NEED_LEVEL` (51 of 255) is routed off the errand by the
owner's amendment of 2026-09-02 and can only reach `action.kitchen-work` at
`hunger: 1` a tick, against `action.eat-meal`'s 4.

**In these prisons it never fired, and the reason is worth stating.**
`relievesAnUnmetNeed` (`src/simulation/prisoners/action-system.ts:232`) gates
the rank-0 promotion on the prisoner's *best providable* candidate having a
positive effect on a need that is below the threshold. This prison has no
kitchen, no laundry and no classroom, so inside a work block the only
providable candidates are `action.carry` and `action.free-association`
(`needEffectsPerTick: {}`) — neither relieves anything — and the errand keeps
rank 0 at any hunger level. Observed: hunger 40,800 of 65,025 at the paused
reading after the first errand, falling monotonically, with the errand taken
regardless.

So the hole needs a **furnished kitchen** to reach, and that is the prison this
pass did not build. **Not measured**, and the shape of the measurement is
named instead: build a `room.kitchen` with a stove and a prep counter beside
the bay, let hunger cross 51, and read whether the roster says `Kitchen Duty`
while a delivery waits. What a player would be shown either way is nothing:
there is no sentence anywhere about a prisoner skipping an errand, and ADR
0093's amendment says explicitly that whether one exists is the owner's.

## What was not reached

- **Save and reload mid-errand.** Run 2 missed the live carry because it
  sampled at 4x; run 3 missed it because it bought the second delivery inside a
  work block and then fast-forwarded looking for the *edge* of the next one, so
  the prisoner took and finished the errand at 4x while the instrument was
  still fast-forwarding. The instrument now buys and watches the second errand
  entirely at 1x. ADR 0093 decision 5's corrected bound — **two reconsideration
  cycles, 40 ticks** — is therefore still only measured headlessly, by
  `tests/determinism/job-performing-restart-bound.test.ts`, and what a *player*
  sees across a mid-errand reload is unobserved.
- **A contended errand.** One prisoner, one job. ADR 0093 decision 2's
  ordering — one job, six prisoners, the other five counted as *contended*
  substitutions — is unobserved in play.
- **A cancel or an un-zone under a live carrier** (ADR 0093 open question 2,
  ADR 0037 open question 1).

## Weakest claim

**That "Heading to Errand" is what most players will see most of the time**
rests on four of nine samples in a single run of a prison whose legs are four
and six tiles long. A prison whose bay and storeroom are twenty tiles apart
would be almost entirely `Heading to Errand`; one where they share a rectangle
would be almost entirely `Errand`. What would change my mind is a second
geometry, which is cheap to run and was not.

Second weakest: every measurement here is one prisoner in one prison on one
machine. The tick figures are deterministic given the same commands at the same
ticks, and a browser press does not arrive at a deterministic tick
(`DEFAULT_LEAD_TICKS` plus elapsed, 36–55 ticks measured on 2026-09-03), so the
*absolute* ticks above will not reproduce. The intervals should.
