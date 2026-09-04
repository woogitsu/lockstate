# What does the game acknowledge? — 2026-09-04

**The verdict in one line: twenty event types, not eighteen — and the taxonomy
the brief offered is refuted by exactly one member while the claim underneath
it survives intact.**

A census, not a playtest. Every number below was read out of source in a
worktree cut from `origin/main` at v0.0.465 (`4c00eaba`), and every `file:line`
was opened. **Nothing was played for this record**, so the strongest tier
anything here carries is **VERIFIED, read** — the one claim that would need a
run is named in §6 and is not made.

Two claims were put to this pass and both were falsifiable, which is why they
were worth auditing rather than agreeing with:

- A direction pass: *every one of the game's event types is bad news, an undo,
  or a recovery — so nothing a player does right is ever acknowledged*, at
  **eighteen** event types.
- A playtest pass: *nothing in the game ever states what the player is trying
  to achieve*, evidenced by **0** matches for `goal|objective|milestone|unlock`
  in the locale file and **62** hits for
  `milestone|objective|progression|reputation` in `src/simulation/`, six of them
  the word *reputation*.

Three of those five figures are wrong. The substantive halves of both claims
are right.

---

## 1. VERIFIED, read — the census: twenty types, and the authoritative registry is not where the brief looked

The registry is `SIMULATION_EVENT_TYPES` in
`src/simulation/protocol/types.ts:1675-1696` — a closed `as const` array from
which `SimulationEventType` is derived at `:1698`. It is authoritative rather
than one of several lists, and mechanically so:

- **The sentences are keyed off it exhaustively.** `EVENT_PRESENTATION` in
  `src/ui/simulation-events.ts:300-344` is typed
  `Record<SimulationEventType, …>`, so a member with no sentence does not
  compile.
- **The census is driven off it by a test rather than off a hand-written
  list.** `tests/unit/ui-simulation-events.test.ts:132` iterates
  `SIMULATION_EVENT_TYPES` itself, under a comment saying why: *"so an event
  type added to the union and forgotten here fails rather than going
  unchecked."*
- `src/simulation/events/event-log.ts` is the **producer**, not the registry:
  fourteen `record*` methods emit the twenty types, several of them branching
  (`recordIncidentOpened` switches over `IncidentType`,
  `recordBuildOrderCancelled` over `BuildOrderLifecycleState`).

Counted mechanically off the source rather than by eye:

```
$ node -e "…match(/SIMULATION_EVENT_TYPES = \[([\s\S]*?)\] as const;/)…"
20
```

### The table

`band` is `EVENT_PRESENTATION`'s `severity` — the value
`SEVERITY_EVICTION_ORDER` (`src/ui/hud/view-model.ts:436`) ranks for eviction
and, since ADR 0084 decision 4, the value `admitToEventBand`
(`src/ui/hud/event-band-dwell.ts:202`) arbitrates the band with. Sentences are
quoted verbatim from `src/content/default-locale-en.ts`.

| # | type | band | the sentence it renders | class |
| --- | --- | --- | --- | --- |
| 1 | `construction.order-cancelled` | info | *The order was cancelled — the money it cost is refunded.* | **undo** |
| 2 | `construction.order-cancelled-underway` | warning | *The order was cancelled. Anything already spent past the point of no return stays spent.* | **undo** |
| 3 | `construction.redone` | info | *The last change to the build queue was redone.* | **undo** |
| 4 | `construction.undone` | info | *The last change to the build queue was undone.* | **undo** |
| 5 | `construction.undone-spend-destroyed` | warning | *The last change to the build queue was undone — anything already spent past the point of no return stays spent.* | **undo** |
| 6 | `contraband.discovered` | warning | *Contraband found: {item}.* | **bad news** |
| 7 | `economy.construction-refused` | warning | *Construction halted — the treasury cannot fund the build queue right now.* | **bad news** |
| 8 | `economy.deliveries-refused` | warning | *Deliveries refused — the treasury cannot cover a purchase right now.* | **bad news** |
| 9 | `economy.delivery-cancelled` | info | *The delivery was cancelled — {total} back.* | **undo** |
| 10 | `economy.wages-unpaid` | warning | *Payday went unpaid — your staff are owed {total}.* | **bad news** |
| 11 | `incidents.all-clear` | info | *The prison is under control again — no incident is still open.* | **recovery** |
| 12 | `incidents.all-clear-after-lapse` | warning | *No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt.* | **recovery** |
| 13 | `incidents.assault-opened` | warning | *A fight has broken out between two prisoners.* | **bad news** |
| 14 | `incidents.escape-attempt-opened` | danger | *A prisoner is trying to break out.* | **bad news** |
| 15 | `incidents.escape-succeeded` | danger | *{name} broke out — no guard reached them in time.* | **bad news** |
| 16 | `incidents.gang-retaliation-opened` | danger | *Two gangs are settling a score.* | **bad news** — and unreachable, §3 |
| 17 | `incidents.riot-opened` | danger | *A riot has broken out — {count} prisoners have stopped taking orders.* | **bad news** |
| 18 | `objects.removed-spend-destroyed` | warning | *The object was removed — the money it cost does not come back.* | **undo** |
| 19 | `prisoners.discharged` | info | *{count} released — their sentences are served.* | **neither — see §2** |
| 20 | `prisoners.relocated` | info | *{name} had nowhere to sleep and moved to {room}.* | **bad news** |

**Totals: 9 bad news, 6 undo, 2 recovery, 1 that fits none of the four labels,
0 acknowledgements.** Every band value in the table is `info`, `warning` or
`danger`; there is no fourth tone in `HudSeverity` for a good thing to wear.

### Where "eighteen" came from, and it was true for five hours

The figure was not invented. Counting the registry at every commit that touched
`src/simulation/protocol/types.ts`:

| members | commit | subject |
| --- | --- | --- |
| 18 | `acbd2ec2`, 2026-09-04 06:15 | *feat(incidents): say which of the two endings an incident had (#914)* |
| 19 | `889ff5f9`, 2026-09-04 11:16 | *fix(construction): an undo says what it destroyed (#927)* |
| 20 | `d9770e61`, 2026-09-04 16:08 | *fix(objects): removing a standing object says the money is gone (#945)* |

**Eighteen was the true count for five hours on the morning of the day the
brief was written, and both commits that falsified it added a member this
census classifies as an undo or bad news.** That is the more interesting half:
the count moved twice in one day and the *shape* did not move at all. This is
`docs/AGENT_WORKFLOW.md` §4's rule about tallies rotting first, observed inside
a single day.

---

## 2. VERIFIED, read — the taxonomy is refuted by one member, and the claim underneath it is not

`prisoners.discharged` — *"{count} released — their sentences are served."* —
is not bad news, is not an undo and is not a recovery. It is the only member of
the twenty that reports something going right, and the direction pass's
trichotomy does not hold over it.

**It is nevertheless not an acknowledgement of anything the player did**, and
this is the part that is worth more than the refutation, because it is the
claim the trichotomy was standing in for.

The gate is a clock and a stage, and nothing else.
`PrisonerDischargeSystem.isSentenceComplete`
(`src/simulation/prisoners/discharge-system.ts:165-169`) asks two questions:
is the intake stage sentence-bearing, and is `tick >= sentenceEndTick`. The
sentence-bearing set is at `:46`:

```ts
const SENTENCE_BEARING_STAGES: readonly IntakeStage[] = ['accommodation-assignment', 'completed', 'failed'];
```

`'accommodation-assignment'` is in it — and that is the stage a prisoner with
nowhere to sleep stands at. It renders as the literal text `Cell Assignment`
(`src/content/simulation-message-keys.ts:236`), which is exactly what the
twenty-four unhoused prisoners of
`docs/research/2026-09-04-can-this-prison-fail.md` act A were reading against
their names for ten in-game days. And `releasePrisoner`
(`src/simulation/prisoners/release.ts:192-218`) requires no room, no bed and no
guard: it cancels a path request, releases the entity from whatever registries
hold it, and destroys it.

**So the game's one good sentence fires for a prison that houses nobody, feeds
nobody and guards nobody, on a timer the player cannot influence.** It is not
an acknowledgement; it is the passage of time reported.

### The near miss, and it is worth naming separately

`incidents.all-clear` is the one member of the twenty whose *truth* is
conditional on the player having done something right, and it says nothing
about it. Since #914 it fires only on the `'resolved'` terminal transition —
`reportAllClearIfCalm(tick, escapeAnnounced, endedByLapse)` at
`src/simulation/incidents/response-system.ts:310-318` routes `endedByLapse` to
`incidents.all-clear-after-lapse` instead — and
`docs/research/2026-09-04-does-anyone-answer-an-incident.md` measured what
decides which: with six guards, **15 of 15** incidents ended `'resolved'` with
zero injuries; with none, **19 of 19** ended `'lapsed'` with 114
prisoner-injuries. Hiring guards is what earns sentence 11 rather than sentence
12.

The sentence it earns is *"The prison is under control again — no incident is
still open."* **It describes an absence.** The guards who produced it are not in
it, and a player who reads it has no way to know their staffing is what put the
prison on that branch rather than the other one. That is a shipped, true
sentence one clause short of being the acknowledgement this pass went looking
for — and lengthening it is not this record's business (§5).

---

## 3. VERIFIED, read — one of the twenty cannot fire, and the code says so itself

`incidents.gang-retaliation-opened` has no producer.
`IncidentTriggerSystem.tryOpenRetaliation`
(`src/simulation/incidents/trigger-system.ts:523`) begins
`this.gangs.gangsClaiming(sectorId)` and iterates
`this.gangs.allGrudges()`; both are empty for the life of every session,
because **nothing in `src/` ever registers a gang**:

```
$ grep -rn "addMember(" --include=*.ts src/
src/simulation/incidents/gangs.ts:37:  public addMember(gangId: string, entityId: EntityId): void {
src/simulation/incidents/gangs.ts:124:    for (const [entityId, gangId] of snapshot.members) this.addMember(gangId, entityId);
```

The only caller is `loadSnapshot`, which can only replay definitions a
`register` put there in the first place; `register` has no caller in `src/` at
all, and `adjustReputation` has callers only under `tests/`. The trigger
system's own class comment states it, at `:225-226`: *"`'gang-retaliation'`
still has no producer of its own — it needs `GangRegistry` entries nothing in
`src/` writes."*

**So the reachable census is nineteen, not twenty**, and the honest reading of
the direction pass's claim is over nineteen sentences a player can actually
meet. This changes none of §1's proportions materially — the unreachable member
is bad news — but a census that reported twenty without saying so would be
overstating what is on screen.

---

## 4. MEASURED — both greps, re-run, with the actual output

These two are **MEASURED** rather than VERIFIED-read, because a grep is a
measurement of the tree and its output is pasted rather than described.

### Grep 1 — the locale file: the brief's figure is exactly right

```
$ grep -Ein 'goal|objective|milestone|unlock' src/content/default-locale-en.ts
$ grep -Eic 'goal|objective|milestone|unlock' src/content/default-locale-en.ts
0
```

**Zero, case-insensitively, over the whole file.** Not one line, not one
comment. Confirmed.

And the `docs/AGENT_WORKFLOW.md` §4 trap for "this string does not exist"
claims — a derived string invisible to the search that would disprove it — does
not rescue anything here. The census file the locale merges is
`src/content/simulation-message-keys.ts`, and it is 0 there too:

```
$ grep -Eic 'goal|objective|milestone|unlock' src/content/simulation-message-keys.ts
0
```

### Grep 2 — `src/simulation/`: the brief's figure is not reproducible

```
$ grep -rEi 'milestone|objective|progression|reputation' src/simulation/ | wc -l
15
$ grep -rEio 'milestone|objective|progression|reputation' src/simulation/ | wc -l
22
$ grep -rEioh 'milestone|objective|progression|reputation' src/simulation/ | tr 'A-Z' 'a-z' | sort | uniq -c
     22 reputation
```

**Fifteen matching lines, twenty-two occurrences, and every single one is the
word `reputation`.** `milestone`, `objective` and `progression` do not appear in
`src/simulation/` at all — which makes the absence *stronger* than the brief
claimed, not weaker.

**62 is not reproducible under any scope tried.** For the record, so the figure
can be traced rather than merely rejected:

| scope | lines | occurrences |
| --- | --- | --- |
| `src/simulation/` | 15 | 22 |
| `src/` | 28 | 38 |
| whole worktree | 73 | 84 |

Adding `goal` to the alternation changes `src/simulation/` not at all (15). The
nearest figure to 62 is 73 for the whole tree, which is a different question.

**"Six of them are reputation" is wrong in the direction that helps the
argument: all twenty-two are.** And the substantive half — *a gang model
nothing ever registers a gang into* — is **exactly right**, and §3 above is the
proof, including the consequence the playtest pass did not reach: it costs the
game one of its twenty event types.

Where the fifteen lines sit: `src/simulation/incidents/gangs.ts` (11),
`src/simulation/presentation/prisoner-projection.ts` (3, all the projection
carrying a gang's reputation to the HUD), and
`src/simulation/prisoners/discharge-system.ts:81` — a comment, and a fitting
one, noting that a discharge has no *"ceremony, an inspection consequence or a
reputation effect — those are #31"*.

---

## 5. VERIFIED, read — three places where the simulation already knows something good happened and publishes nothing

The bar for this section is the brief's, and it is the right one: **provable,
not plausible.** A candidate qualifies only if the good transition is already
computed, or the good fact already in hand, at a line that can be opened — not
if a new system would have to be written to notice it.

**No sentence is authored here.** `AGENTS.md` reservation 4's 2026-09-04
release makes the choice of words ours, and expressly does not release the
requirement that a sentence be true; this record is a census, so for each site
it states **what a sentence there would have to prove** and stops.

### C1 — the insolvency rung the prison climbs back over, `src/simulation/economy/insolvency-rung-system.ts:159-167`

This is the strongest of the three, because the edge is not merely knowable —
it is **already computed, in an `if`/`else` whose other half publishes**:

```ts
      if (crossed) {
        this.standing.add(rung);
        // The seeding pass (see class comment) establishes the baseline
        // silently; only a transition discovered on a *later* call is a real
        // crossing.
        if (this.seeded) this.events.recordInsolvencyRungCrossed(rung, context.tick);
      } else {
        this.standing.delete(rung);
      }
```

The `else` at `:165` is reached on exactly one condition — `crossed === false`
and `wasStanding === true`, guaranteed by the `if (crossed === wasStanding)
continue;` at `:158`. That is the tick a prison stops being unable to buy
materials, or stops being unable to fund its build queue. The class holds a
`SimulationEventLog` already (`:148`), used one line above. **One branch says
the money ran out; the other says nothing.**

Three facts make this more than an asymmetry:

- **The down-crossing exists because a player was not told.** #767, closed
  2026-09-02, was found by playing a payroll tick that crossed two rungs at
  once while the alerts log read *"No active alerts"*; the owner's ruling on it
  widened ADR 0087 decision 2 into *"a persistent indicator … plus a one-off
  notice at the moment of crossing, so a player who was looking elsewhere gets
  a nudge."* #767's own text says the condition *"stays true until the balance
  recovers"* — and describes no notice for the recovery.
- **The persistent indicator half was never built.** ADR 0087 decision 2's
  standing conditions include `treasury.deliveries-refused` and
  `treasury.construction-refused`, and #930 (open, filed today) establishes
  that `statusCountsSchema.conditions` is computed, emitted and specially
  diffed and **read by nothing** under `src/ui/`. Re-measured here rather than
  taken from the issue, and it still holds — the one hit is a comment:

  ```
  $ grep -rn "\.conditions\b" src/ui/ src/main.ts
  src/ui/simulation-events.ts:926:    // `statusCountsSchema.conditions` exist to keep answering after this
  ```

  (#930 cites that comment at `:870`; it is `:926` at `4c00eaba`, which is the
  ordinary drift `docs/AGENT_WORKFLOW.md` §4 warns about and not a
  contradiction.) So the state a player is in is not on screen either.
- **Therefore nothing at all marks the recovery.** No event, and no condition
  readout that could stop showing. A player whose deliveries start working
  again learns it by pressing Buy and not being refused.

**What a sentence here would have to prove:** that at this tick a purchase
under that spending class would be accepted. `Treasury.canAfford` compares
against the spending class's own floor and this branch has just established the
balance is above it, so the claim is available at the line — but it is a claim
about *one* class, and the loop runs per rung. A sentence saying "you can buy
again" while the construction rung still stands would be exactly the false
promise reservation 4 protects.

### C2 — the room a player just designated, `src/simulation/runtime/session-commands.ts:194-216`

The `ZoneRoom` handler's success branch holds `outcome.kind === 'zoned'` and,
with it, the whole `RoomInstance` (`ZoneRoomAccepted` at
`src/simulation/rooms/zoning.ts:247-264`). What it does with that is **withdraw
two standing refusals** and return:

```ts
        refusals.supersede(zoneSupersessionKey(simCommand.roomId, simCommand.x, simCommand.y, simCommand.width, simCommand.height));
        …
        refusals.supersede(zoneAreaSupersessionKey(simCommand.x, simCommand.y, simCommand.width, simCommand.height));
```

Its own comment calls the rectangle *"a fact the world just confirmed"*. The
`SimulationEventLog` is in lexical scope — `events: SimulationEventLog` is a
parameter of the enclosing `createSessionCommandHandler` at `:153`, and the same
function calls `events.recordDeliveryCancelled` at `:539` — so nothing needs
wiring. **The player's only feedback for designating a room is red text
disappearing.**

That the failure speaks and the success does not is the exact asymmetry #749
already ruled on for construction: five of the twenty types exist because the
owner decided a carried-out instruction should say so. Zoning is a
carried-out instruction and was not in that five.

**On the brief's lead (a), which is half right and the half matters.** The lead
came from `src/simulation/economy/income.ts:387-392`, which reads: *"`room.yard`
requires no object at all … so zoning 8x8 of owned ground turns `recreation`
from unmet to served and returns 40 a prisoner a day for nothing."* Checked:

- **The object claim is true.** `room.yard` at
  `src/content/room-catalog.ts:138-141` authors `outdoors` and
  `minimum-size` (8×8, 64 tiles) and no `object` requirement — the only room in
  the catalogue that authors none. And `action.yard-recreation`
  (`src/simulation/prisoners/actions.ts:165-166`) carries no
  `requiredObjectCapability`, where its sibling
  `action.common-room-recreation` requires `'recreation'`. So an accepted
  8×8 zoning produces a room that is complete on the tick it is created.
- **The "unmet to served" claim is a compression, and a sentence built on it
  would be false.** `unmetNeedCount`
  (`src/simulation/economy/income.ts:443-449`) reads a per-prisoner *need
  level* against `STATE_INCOME_UNMET_NEED_LEVEL = 51` (`:318`). Zoning the yard
  does not move that level; it makes an action available that raises it at
  `needEffectsPerTick: { recreation: 3 }` over a `minDurationTicks: 100`
  minimum, once a prisoner walks there and performs it.
- **The "returns 40 a prisoner a day" claim is currently false in play.**
  `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0` (`:401`), the owner's
  suspension of 2026-09-03 re-affirmed on 2026-09-04. At zero there is nothing
  withheld to return.

**What a sentence here would have to prove:** the narrow claim, not the lead's.
That this rectangle is now a room of this type, and — for the one room type
where it is true — that it needs nothing further placed in it. Proving the
second requires reading the definition's `requirements` for an `object` member
rather than asserting it, which is #934 §3a's rule about deriving teaching from
the catalogue rather than restating it.

### C3 — the prisoner who finally got a bed, `src/simulation/prisoners/intake-system.ts:563-571`

`IntakeSystem.update`'s `'accommodation-assignment'` branch ends:

```ts
        if (instance === undefined) {
          this.accommodationBacklogTicks += 1;
          continue; // stay in accommodation-assignment; retried next scheduled tick
        }

        this.roomInstances.assign(instance.instanceId, entityId);
        this.coldState.setAccommodation(entityId, instance.instanceId);
        this.records.intakeStage[index] = intakeStageIndex('completed');
        this.completedCount += 1;
```

That is the tick a named prisoner who had nowhere to sleep stops waiting. It is
the transition #937 identifies as the rule the whole game turns on — state
income is per *occupied place*-day — and it is the single event a player most
needs to see, because it is the one that converts a press into revenue. The
entity, the instance and the tick are all in hand at `:568-571`.

**And the mirror image already speaks.** `prisoners.relocated` — *"{name} had
nowhere to sleep and moved to {room}."* — is published when a bed *removal*
forces a resident out (`src/simulation/events/resident-relocation-notice.ts:117`,
ADR 0076 decision A(i)), and its own module docblock says why: relocation
shipped silent, and *"a requirement the player must discover is a defect"*. The
argument is identical in the opposite direction and has not been applied.

**This is the weakest of the three on cost, and it is stated rather than
buried.** Unlike C1 and C2, `IntakeSystem` holds no `SimulationEventLog` — its
constructor (`:217-257`) takes the store, the query, records, cold state, the
room registry, a policy, RNG stream names, and optional identity and contraband
ports. So this site needs a dependency threaded, not just a call. The good
transition is still *computed* there, which is what the brief asked for.

**What a sentence here would have to prove:** that this prisoner now has a
place, and that the place is one the state pays for. Those are two different
facts — #933 §4 is the record of how easily they are conflated — because
residency capacity comes from an object declaring `'sleep-surface'`
(`src/simulation/objects/room-capacity.ts:25`) while a *valid* room comes from
the catalogue's requirement list. A sentence asserting the second from the
first would be the defect #933 exists for.

### Lead (b), `staffUnassigned`, checked and declined

Re-measured and the brief's second-hand fact holds exactly:

```
$ grep -rn "staffUnassigned" src/ui/
(no output)
```

It is computed at `src/simulation/presentation/status-strip-projection.ts:783-787`,
emitted at `:867`, declared on the protocol at
`src/simulation/protocol/types.ts:716`, and has no reader under `src/ui/`.
#870 owns this and describes it correctly.

**It is not an acknowledgement site, and that is why it is not C4.** An
unassigned guard is a wage being paid for nothing — the finding
`docs/research/2026-09-04-can-this-prison-fail.md` §2 measured at sixty of them
with no reachable dismiss control. The number's value is as bad news, which is
what #870 says (it is *"exactly the number the Security panel needs"* for the
coverage block). Reading it as good news would require inverting it —
`staffUnassigned === 0` with staff above zero — and that inversion is a level
with no edge detection anywhere, so it fails the provability bar this section
is held to. **The brief's lead is right about the orphan and wrong about it
being an acknowledgement candidate.**

---

## 6. What this record does *not* claim

- **That no acknowledgement reaches a player by some route other than the
  events channel.** What was censused is `SIMULATION_EVENT_TYPES` and the
  twenty sentences keyed off it. A panel, a badge or a chip could congratulate
  a player without any of it passing through this registry — the derived-string
  trap in `docs/AGENT_WORKFLOW.md` §4 is exactly this shape, and grep over the
  locale file would not see it. **This is the weakest claim here.** What would
  settle it: a text-node sweep of the assembled page across a session in which
  something goes right — a first bed placed, a yard zoned, an incident
  contained — which is a playtest and not a grep. Grep 1's zero (§4) bounds it
  for four specific words and for nothing else.
- **That C1, C2 or C3 would improve the game.** Each is established as a site
  where a true claim is available and nothing is published. Whether a notice
  there is worth its collision cost on a band with one line and a 600 ms dwell
  floor (`EVENT_BAND_DWELL_FLOOR_MS`, `src/ui/hud/event-band-dwell.ts`) is a
  design question this census did not price, and three more `info` rows compete
  for the same eight-row list (`MAX_EVENT_ALERT_ROWS`).
- **That `prisoners.discharged` never coincides with good play.** §2 shows it
  fires for a prison that did nothing; it does not show that a well-run prison's
  discharges are uninformative. The claim is about the *gate*, which is a clock,
  not about the population that reaches it.
- **That the eighteen-member registry the direction pass counted was the one it
  read.** The commit table in §1 shows eighteen was true that morning, which is
  the most likely explanation and is not proof. Nothing in the brief named a
  commit.
- **Anything about how any of this feels.** Nothing was played. Every §5 site
  is a source reading.

---

## Reproduction

Every command in this record runs read-only from a checkout of `4c00eaba`:

```
grep -Eic 'goal|objective|milestone|unlock' src/content/default-locale-en.ts
grep -rEi  'milestone|objective|progression|reputation' src/simulation/ | wc -l
grep -rEio 'milestone|objective|progression|reputation' src/simulation/ | wc -l
grep -rn   'staffUnassigned' src/ui/
node -e "const s=require('fs').readFileSync('src/simulation/protocol/types.ts','utf8');
  const m=s.match(/SIMULATION_EVENT_TYPES = \[([\s\S]*?)\] as const;/);
  console.log([...m[1].matchAll(/'([^']+)'/g)].length);"
```

The commit table in §1 was produced by walking
`git log --format=%h -25 -- src/simulation/protocol/types.ts` and counting the
registry's members in each revision, which is how the five-hour window was
found rather than guessed.
