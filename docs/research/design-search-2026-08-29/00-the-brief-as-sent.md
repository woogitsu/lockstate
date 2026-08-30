# Design search brief: what else could Lockstate's economy and progression be?

**This is a prompt for an independent model. Everything it needs is in this file — it has no access to the repository.**

Hand it over as-is. It is written in English because every term of art below (`room.cell`, `state income`, `regime block`) is English in the codebase, and a translation layer between the brief and the answer is where precision goes to die.

---

## What you are being asked for

Lockstate is a browser prison-management simulation in the tradition of Prison Architect. It is pre-alpha: nobody plays it yet. The simulation is deep and correct; the *economy and progression* are thin, and we know it.

Recently we needed a second income line and put four researched options in front of the owner. The owner ignored all four and proposed a fifth we had not considered: **threshold grants** — cross 10 prisoners and receive a payment, cross 25 and receive a larger one, thresholds continuing indefinitely so a player can play toward a large prison. It is better than everything we offered, because our four all paid for *existing* while the owner's pays for *growth* — and an accepted architectural decision in this project had already rejected paying for existing, by name.

**That is the job. Find the ideas we did not have.**

Not a review. Not a list of what is missing — we have nine audit reports enumerating that and they were not useful for this. What is wanted is **mechanism design**: specific, implementable systems that would make this particular simulation interesting to play, given exactly what it already has and exactly what it has already decided.

The bar is the threshold grant: an idea that is obvious in hindsight, costs little to build, uses machinery that already exists, and changes what the player optimises.

---

## Ground rules, and they matter more than the ideas

1. **Use what exists.** This project keeps deleting features that were built because a counter needed to move. An idea that reuses a mechanism already in the tree beats a better idea that needs a new subsystem. Every section below tells you what is already built, including several complete mechanisms with no producer — those are the cheapest ideas available and they are listed for exactly that reason.
2. **Name the consequence.** Every accepted decision in this project carries the cost it accepted. An idea without a stated downside will be read as an idea whose downside was not found.
3. **Say what it makes the player optimise.** *"This changes what the player optimises"* is the sentence that killed a block grant here. If a mechanic does not change a decision the player makes, it is decoration.
4. **Do not propose a research tree unless you can say what it gates.** There is no research system. A tech tree that unlocks rooms which already exist is a lock on an open door.
5. **Range over depth.** Twenty specific ideas with one paragraph each is worth more than four essays. We will do the feasibility work.
6. **Contradict us.** If a decision recorded below is wrong, say so and say why. Several have already been overturned by evidence.

---

## The simulation, as it actually is

### Time

- Fixed step at **20 Hz**. One in-game day is **2,400 ticks** = 2 real minutes at 1×.
- Deterministic kernel: same state plus same commands gives the same result, always. Named RNG streams. This is load-bearing and is not up for negotiation.
- Sentences are drawn per prisoner. A short one is a few thousand ticks; the "long sentence" classification threshold is 200,000 ticks.

### Money

- Start: **25,000** minor units. `Treasury` currently refuses to go negative — that is about to change (see *Decided but unbuilt*).
- **The only income that exists**: the state pays **300 per prisoner-day, per occupied place**. Withheld **40 per unmet need**, so the schedule is 300 / 260 / 220 / 180 / 140 / 100 / **60 floor** for zero through six unmet needs.
- **The only recurring cost that exists**: staff wages, **80 per guard per day**, billed at the day boundary. Unpaid wages accrue as arrears that persist through saves.
- Two purchasable materials: **brick 40**, **wood plank 65**. Delivery arrives 100 ticks after purchase. A purchase can be cancelled before it lands, not after.
- Representative build costs: brick wall = 2 bricks; wooden door = 1 plank; **wooden bed = 1 plank**; brick toilet = 1 brick.

**Measured: a neglected twelve-prisoner prison earns about 150/day while three guards cost 240/day.** The loop closes, and it closes tightly.

### Prisoners

Six needs, all decaying: **hunger, hygiene, recreation, safety, sleep, bladder**.

**Three of the six cannot be satisfied inside a normal sentence** — hygiene needs 10,200 ticks of provision, recreation 13,600, safety 20,400 — which means a prisoner routinely leaves before the prison could have made them content. Nobody has decided whether that is a bug or the point.

A prisoner's day is a **regime**: named blocks over the 2,400-tick day, each permitting action categories. The categories are `sleep`, `meal`, `work`, `recreation`, `education`, `hygiene`, `free-association`. The default day is roughly: sleep 0–400, meal+hygiene 400–500, **work/education/free-association 500–1,000**, meal 1,200–1,300, **work/education/free-association 1,300–1,800**, meal 2,000–2,100, sleep 2,300–2,400. So there are **about 1,000 ticks a day of work/education time** — and `free-association` fulfils nothing, so any prisoner without a work room is idling through 40% of the day.

Prisoners are classified into risk tiers at admission. Classification review is scheduled globally and eligible per record, with the consequence that **eight of fifteen drawable sentence lengths can never be reviewed at all**.

### Rooms — eighteen exist, nine are reachable

A room is zoned as a rectangle, must be enclosed for most types, and derives its capacity from the objects standing in it (a bed gives residency; a stove gives food preparation).

**Nine rooms a prisoner can actually be routed into:** `cell`, `solitary-cell` (accommodation); `canteen`, `classroom`, `common-room`, `kitchen`, `laundry`, `shower-room`, `yard` (actions).

**Nine a player can build that do nothing at all:** `delivery-bay`, `garbage-room`, `holding-cell`, `infirmary`, `reception`, `security-office`, `staff-room`, `storage-room`, `utility-room`. Built at their authored minimums they cost **9,945 of the starting 25,000 — 40% of the treasury — and return nothing.**

They are not an arbitrary nine. **Every one but two sits in a room category no routed room shares**: `operations`, `medical`, `administration`, `logistics`, `utility`. Those categories describe work the *prison* does, not anything a *prisoner* needs. **That gap is probably the single largest design hole in the game and we have deliberately not filled it**, because every candidate action we could invent was either a clone of an existing room or required a system that does not exist.

**Twenty objects exist**: bed, bench, bookshelf, chair, desk, dining-table, fridge, loading-dock-door, medical-bed, medicine-cabinet, prep-counter, security-console, shower-head, sink, storage-rack, stove, toilet, utility-panel, washing-machine, waste-bin. Several have capabilities nothing reads: `surveillance`, `item-storage`, `delivery-access`, `waste-disposal`, `utility-control`, `medical-treatment`.

### Staff, security, incidents

- Guards are hired against a wage band and can be dismissed. Hiring charges one day up front.
- Security sectors have deployment, coverage and post assignment. The HUD reads `0 of 2 / Unguarded` → `1 of 2 / Understaffed` → `2 of 2 / Covered`.
- **Incidents are real and reachable**: assault, riot, escape attempt, gang retaliation. A small prison with no guards and more prisoners than beds produces an incident within five in-game days. **With full guard coverage it still riots every two in-game days.**
- **Guards never patrol.** The default security sector is derived and carries no patrol route, so the patrol system skips it. This is a deliberate consequence of an accepted decision, not an oversight.
- Contraband is introduced at admission (10–20% chance) and is now searchable — a sweep duty was added recently.
- **Nothing models prisoner health.** Incidents record an injured entity id and no injury state. `medical-treatment` has no reader. There is no medic, no treatment, no recovery.

### Construction and logistics

- Materials are purchased, delivered, then consumed by build orders. Orders queue, can be cancelled, and refund allocated materials.
- **A complete job system exists — job board, workers, containers, carry legs, reservations, pathfinding — and is fully tested end to end, on containers whose ids merely *look* like rooms.** No room instance is ever bound to a container, so no delivery ever physically travels. Purchased material teleports into a single global inventory.
- Pathfinding is hierarchical, budgeted and cached. Actors walk tile by tile.

### What a player can see

Tabs: Overview, Build, Security, Regime, plus a save panel. A status strip shows funds, prisoners, staff, rooms, incidents, contraband, day and clock. Alerts and a refusal band report why a command was refused. **The minimap is an empty placeholder.** There is no settings screen beyond an interface-scale control. Saves are local-only (IndexedDB); no accounts, no cloud.

---

## Decisions already made — treat these as constraints, not suggestions

Each is a recorded architectural decision. You may argue against one, but you must know you are doing it.

1. **The state pays per prisoner-day, accrued per occupied place.** Chosen over per-facility, per-prisoner-in-existence, and a scheduled block grant. Reason: it is the only one where *capacity* and *the ability to keep people in it safely* pay through the same line, so expansion and competence are not separate currencies. **A block grant was rejected by name** because it "pays for surviving to a date". Accepted consequence: **income scales with population, and so does trouble — so overcrowding must be punished elsewhere or the optimum is to pack the prison.** Nothing punishes overcrowding yet.
2. **Insolvency is a state, not a loss condition.** No game-over. Reason: "a loss condition ends the session, and a session that ends removes the interesting part, which is digging out." Accepted consequence: **degradation must be authored and surfaced, or insolvency is an invisible stall.** The degradation ladder is named — deliveries refused, then construction halted, then staff unpaid with morale and incident consequences — and **has never been built**.
3. **Money is the primary resource**, with grants and prison labour as secondary lines. **Neither secondary line exists.**
4. **Prices are provisional**, reserved to a later balance pass.
5. **A room with no objects to consume is bounded by its own ground**, so a yard's capacity comes from its floor area rather than from furniture.

### Decided but unbuilt, as of this brief

The owner has just ruled on four things, none yet implemented:

- **Threshold grants** — one-off per threshold, thresholds continuing indefinitely, **first threshold very low** so the payment arrives before a new player can strand themselves.
- **The degradation ladder**, with the balance now permitted to go negative.
- **Loans.** Because there is no bankruptcy and no floor, the loan is what keeps "insolvency is a state" honest — it is the way out, not a convenience.
- **Sell-back of materials at a loss.**

---

## The defects that shaped these decisions — because they show where the design is thin

- **A legal purchase can end the game.** 625 bricks at 40 spends exactly the starting 25,000. After delivery it cannot be refunded, nothing sells, nothing converts, and a bed needs a 65 plank. Cash 0 + planks 0 = no bed = no occupied place = no income, for ever. **And you reach the same state with no reckless press at all**: 616 bricks is 308 wall segments, an ordinary first build; add one guard and three days of wages and the treasury is at 40 and falling.
- **One plank can pay for three prisoners.** Remove a bed and the resident stays assigned and stays revenue-bearing while the room's capacity falls to zero; undo the completed build order and the plank comes back; furnish the next cell. Measured: 3 residents and 4,380 earned against a control's 1 and 1,460.
- **Nine of eighteen rooms do nothing**, as above.
- **`free-association` fulfils nothing**, so a prison without work rooms idles through its work blocks.

---

## Where the game is thin, in our own words

If you want the highest-value places to aim, these are ours:

1. **There is one income line and one cost line.** Everything else is a variation on "more prisoners".
2. **There is no reason to prefer one prisoner over another.** Risk tiers exist and are classified; almost nothing consumes them.
3. **Nothing punishes overcrowding**, which an accepted decision explicitly says must exist or the optimum is to pack the prison.
4. **There is no progression beyond scale.** No unlocks, no reputation, no external pressure, no goals, no failure short of a stall.
5. **Half the rooms and a third of the objects are decoration.**
6. **The prison has no relationship with anything outside itself** — no government, no inspection, no press, no families, no other prisons, no market.
7. **Nothing persists across a session.** Each prison starts identical.
8. **A complete logistics system is built and unused.**

---

## What to deliver

**A numbered list of concrete mechanisms.** For each, in a short paragraph or two:

- **The mechanic**, precisely enough to be implemented.
- **What it reuses** that already exists — name it from this brief.
- **What the player now optimises** that they did not before.
- **The cost it accepts.** Every mechanic has one.
- **Roughly what it takes to build**, in the terms above.

Then, separately:

- **The three you would build first, and the order**, with the reason being the order and not the ideas.
- **Anything in the "decided" list you think is wrong**, with your reason. We would rather be corrected now.
- **The idea you are least sure about but think is most interesting.** The threshold grant came from exactly that register.

### Bias the search this way

Prefer mechanics that make **an existing inert thing matter** — the nine dead rooms, the unused job system, unread risk tiers, `free-association`, the six needs three of which cannot be met, the capability-less objects, the never-patrolling guards, the absent health model.

Prefer mechanics that create **a second axis** to optimise against population, because population is currently the only one.

Prefer mechanics with a **visible feedback loop the player can read on a HUD that already exists**.

We are not looking for a Prison Architect clone's feature list. We are looking for what *this* simulation — deterministic, needs-driven, room-and-object-based, with a real job system nobody uses and a real incident system that fires every two days — is uniquely positioned to do that nothing else does.
