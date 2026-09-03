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

**The errand works when a player watches it, and the roster says "Errand"** —
four reproductions, 114 to 126 ticks each, both legs walked. **It also survives
a save and reload taken mid-walk with the goods in hand, and costs 380 ticks
doing it rather than the 40 ADR 0093 decision 5 predicts**, because a restore
turns an in-flight action back into a selection and the work block had ended by
the time the carrier was reconsidered (Finding 9).

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

### Reproduced four times, with the same interval

Runs 4, 6 and 7 built the same prison from scratch and ran the same watch.
**Selection to `completed` was 114 ticks in run 3, 114 in run 4 (7773 → 7887),
118 in run 6 (7869 → 7987) and 126 in run 7 (7841 → 7967)** — and run 4's
*second* errand, sampled faster because the capture loop reads no DOM, gives the
fullest walk in this record:

| tick | prisoner tile | action / phase | job state / leg |
| --- | --- | --- | --- |
| 8013 | (12,14) | `action.free-association` / idle | `available` / pickup |
| 8024 | (12,14) | `action.carry` / travelling | `assigned` / pickup |
| 8047 | (11,16) | `action.carry` / travelling | `assigned` / pickup |
| 8053 | (10,14) | `action.carry` / travelling | `assigned` / pickup |
| 8059 | (8,14) | `action.carry` / performing | `assigned` / pickup |
| 8082 | (8,14) | `action.carry` / travelling | `assigned` / **dropoff** |
| 8105 | (10,14) | `action.carry` / travelling | `assigned` / dropoff |
| 8111 | (11,16) | `action.carry` / travelling | `assigned` / dropoff |
| 8116 | (13,16) | `action.carry` / travelling | `assigned` / dropoff |
| 8122 | (14,14) | `action.carry` / performing | `assigned` / dropoff |
| 8144 | (14,14) | `action.carry` / idle | **`completed`** / dropoff |

Selection 8024 → `completed` 8144 is **120 ticks**, and the path dips to row 16
to cross each door and comes back up to the anchor: (12,14) → (11,16) → (10,14)
→ (8,14), then (8,14) → (10,14) → (11,16) → (13,16) → (14,14). Nine
intermediate tiles, one action.

## Finding 1b — a carry job's `state` never becomes `travelling` or `performing`

**Read off that table, then verified in the source.** The only states a job can
hold in this build are `available`, `assigned`, `completed`, `failed` and
`cancelled`: `JobBoard` assigns `'assigned'` (`job.ts:189`), `'cancelled'`
(`:242`) and, through `endJob`, `'completed'` or `'failed'` (`:203`), and
`submitCarryItem` mints `'available'` (`:146`). Nothing anywhere writes
`'reserved'`, `'travelling'` or `'performing'`.

That is correct under ADR 0093 and is a consequence nothing wrote down: the
phase belongs to the *prisoner* now
(`CurrentActionComponent.actionPhase`), because a carry is an action, so
`JobLifecycleState` is wider than its writer by three members. Two costs, both
small and both reported rather than fixed:

- **`JobBoard.loadSnapshot` normalises a restored `'travelling'` job back to
  `'assigned'` and says why: *"so `JobSystem.beginLeg` re-requests routing on
  the next scheduled tick"*.** `JobSystem.beginLeg` does not exist; the
  equivalent is `ActionSystem.beginCarryLeg`, reached through the prisoner's own
  reselection. The normalisation itself is still needed — a save written by the
  pre-ADR-0093 build can carry `'travelling'` — but no save this build writes
  can, so the branch is now purely a migration path and its comment names a
  deleted symbol. **A `'performing'` job in such a save is not normalised**, and
  I did not establish whether that leaks: `CarryJobExecutor.reconcileRestoredJobs`
  fails and compensates any active job whose `assignedWorkerId` is not an
  eligible carrier this session, which should cover it, and I did not construct
  the save to prove it. **UNKNOWN, and named as the one thing here worth a
  test.**
- **`src/content/simulation-message-keys.ts`'s `job-state` namespace authors a
  label for all eight**, including `Travelling` and `Working` for states that
  cannot occur. Nothing renders the namespace today, so no player sees it.

A third, in the same class and found the same way:
`src/simulation/incidents/trigger-system.ts` cites *"the same decoupling
`JobSystem`'s `JobWorkerAdapter` (#25) … use"* in the present tense, and
neither the system nor the adapter exists.

## Finding 2 — the label is "Errand", and it is on screen

The owner's ruling landed. `src/content/simulation-message-keys.ts:204` reads
`'action.carry': 'Errand'`, marked in that file as a draft for the owner's
review in the same form `action.kitchen-work`'s `'Kitchen Duty'` has carried
since #532. `git log -S` puts it on `main` in `cd41a1d6`, the commit that
accepted ADR 0093 (#863).

**And the owner has since settled it as more than a draft.** `docs/adr/STATUS-QUEUE.md`
at its v0.0.407 re-anchor (merged into `main` as `b995be09`, after this branch
was cut) says: *"The owner has since confirmed *Errand* as the label, which
settles that sentence and leaves two"*, naming the branch that carries the
ruling. So the file comment beside `'action.carry': 'Errand'` still reads as a
draft and the word itself is no longer awaiting a call. **The wrapper sentence
is a different question and is not covered by that ruling** — see the paragraph
on `Heading to Errand` below.

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

`.hud__refusal` was **not laid out** at every sample in every run, including
the samples taken with the clock paused — which is the refusal band showing
nothing, and it is the one instrument reading here that is a measurement of a
real selector (`src/ui/hud/hud.ts:1060`; three `app-shell.spec.ts` assertions
address it the same way).

**The alerts column was NOT read, and the instrument's own claim about it is
withdrawn.** Every run logged `.hud-alerts: ABSENT`, which is the probe naming
a selector that does not exist: the column is `.hud-alerts__list`
(`src/ui/hud/hud.ts:1482`). The instrument is corrected for future runs and this
paragraph does not rest on it — **what replaces it is a stronger claim read off
the source.** `SimulationEventLog` has **twelve** recorders — discharge,
resident relocated, escape succeeded, contraband discovered, unpaid wages,
insolvency rung crossed, incident opened, build order cancelled, construction
undone, construction redone, delivery cancelled, incidents all clear — and
**none of them is about a carry, a delivery landing in a bay, or a carrier
departing**; no file under `src/simulation/operations/`, no
`ActionSystem` carry path and no `ProcurementSystem` path holds a
`SimulationEventLog` at all. So there is no producer for such an alert, and the
column cannot be showing one whatever a DOM sample says.

The Build panel's `.hud-build__deliveries` block covers a *pending purchase* and
not a delivery that has landed and is waiting for a carrier — **read off
`src/ui/hud/build-panel.ts` ("what has been bought and has not arrived", #285,
#703) rather than sampled**, so that clause is an inference too.

And `PRISON_CONDITIONS` (`src/simulation/protocol/types.ts`) still holds four
members — `construction.unfunded`, `intake.no-place`,
`treasury.construction-refused`, `treasury.deliveries-refused` — none of which
is this. That is ADR 0093's change-list item 9, and its absence is deliberate:
the sentence it would need is one of the three the document owes the owner, and
a `PrisonCondition` member with no authored sentence behind it is the defect
`AGENTS.md`'s fourth exclusion exists for.

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

## Finding 9 — a restore turns an in-flight errand back into a selection

**Measured, run 7, and it corrects an ADR 0093 sentence and a bound.** The
instrument bought a second delivery, watched at 1x until the carrier was
mid-walk on the **drop-off** leg with the goods already withdrawn, paused,
pressed `Save now`, navigated the page for real, and loaded the save from the
save panel.

| tick | day-tick | prisoner | action / phase | job | bay | store | roster |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8181 | 981 | (8,14) | `action.carry` / travelling | `assigned` / dropoff | empty | 25 | **Heading to Errand** |
| *save taken here, clock paused* | | | | | | | |
| 8181 | 981 | (8,14) | `action.carry` / **idle** | `assigned` / dropoff | empty | 25 | **Errand** |
| 8214 | **1014** | (8,14) | **`action.free-association`** / travelling | `assigned` / dropoff | empty | 25 | **Heading to Association** |
| 8246 | 1046 | (12,14) | `action.free-association` / performing | `assigned` / dropoff | empty | 25 | Association |
| 8409 | 1209 | (12,14) | `action.eat-in-cell` / performing | `assigned` / dropoff | empty | 25 | Eating in Cell |
| 8521 | **1321** | (12,14) | **`action.carry`** / travelling | `assigned` / dropoff | empty | 25 | **Heading to Errand** |
| 8551 | 1351 | (14,15) | `action.carry` / travelling | `assigned` / dropoff | empty | 25 | Errand |
| 8561 | 1361 | (14,14) | `action.carry` / idle | **`completed`** | empty | **35** | Errand |

**Nothing is lost and conservation holds** — the store goes 25 → 35 in the end,
the job completes, and the second delivery's ten bricks arrive. That is the
good news and it is the larger half of the result.

**But the errand cost 380 ticks across the restore, against decision 5's
corrected bound of 40**, and the mechanism is not a slow restore: it is that a
restore turns an action that was *in flight* back into an action that has to be
*chosen*. `PrisonerOperationsRuntime.loadSnapshot` drops every traveller to
`idle` — which is correction 2 in ADR 0093's own "three things the landing
change found" — and the next reconsideration then runs `planIdleSelection`
under **the block that is running now**. The save landed at day-tick 981; the
work block ends at 1,000; and `action.carry` is *filtered out of `candidates`
entirely* when the active block does not allow `work`. So at day-tick 1014 the
prisoner picked free association and **walked back to the cell carrying the
delivery**, and resumed only when the second work block opened at 1,300 — 340
ticks of block boundary on top of the 40 the restore itself costs.

**The ADR sentence this corrects, quoted so a grep finds it.** ADR 0093's
*Consequences* say: *"**A carry outlasts its block.** Like every action, it is
not cut at a regime boundary; a prisoner who picked up at 1,795 finishes the
drop-off in the recreation block."* That is **true of a continuous run** — a
`travelling` or `performing` prisoner is not reconsidered, so the boundary
cannot reach them — and **false across a restore**, because the restore makes
them idle and the boundary then decides. The document did not have to consider
the interaction, because decision 5's restore rule and the Consequences'
block-boundary claim were written about different things.

**What the player is shown while it happens: a prisoner walking to
"Association".** The goods are nowhere on screen — `PrisonerActionViewModel`
carries no item and no quantity, there is no detail panel (Finding 4), the bay
container reads empty and the storeroom has not been credited, so the ten
bricks a player paid for are in nobody's sight for 340 ticks. A build order
waiting on them waits with them.

**Two things about this I did not establish, and both would change how it should
be read:**

- **A save taken *outside* a work block.** `reconcileRestoredJobs` is called
  with `isEligibleCarrier = (workerId) => runtime.prisoners.entityStore.isAlive(workerId)`
  (`src/simulation/runtime/session-systems.ts:917`) — liveness only, not
  eligibility — so a live carrier's job is kept whatever the block, and I expect
  the same outcome with a longer wait. I did not run it. **UNKNOWN.**
- **Whether 380 is near the worst case.** ADR 0093's own figure for the
  analogous wait is **1,100 ticks** (end of the 1,300–1,800 block to the start
  of the next day's 500–1,000 block), and a save taken at day-tick 1,799 rather
  than 981 should cost about that. Not run.

## What was not reached

- **Save and reload mid-errand was reached on the fourth attempt, and the
  three misses are worth recording because each was the instrument and not the
  game.** Run 2 sampled at 4x and the whole errand fitted between two samples;
  run 3 bought the second delivery inside a work block and then fast-forwarded
  looking for the *edge* of the next one, so the errand ran and finished at 4x
  while the instrument was still fast-forwarding; runs 4 and 5 waited for the
  *job* to read `travelling` or `performing`, which a carry job never does
  (Finding 1b); run 6 read the previous errand's `completed` row, because
  `JobBoard` never prunes one and it was still the newest by `createdAtTick`.
  Run 7 is Finding 9.
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
