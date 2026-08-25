# ADR 0025: Where a player hires a guard, and what the hire costs

## Status

**Proposed — pending human approval.** Not accepted.

The owner delegated the choice of surface, and this document is the record of
what was chosen under that delegation. It is not accepted until they say so.

**This is 0025 and not 0024**, which was the next free number when it was
written. It moved because another unmerged branch had claimed 0024 for a
different document, and the repository's own precedent — recorded in
`docs/adr/README.md` for the kernel ADR — is to take the lowest number free
*without coordinating with unmerged or held work*. The index carries the
reason, and no citation of any other ADR moved.

A reviewer is being asked to sign off on three things, and they are separable:

1. **The gesture is a press on a Staff panel occupying the rail slot of the
   existing, currently empty Security tab** — rather than a row in the Build
   catalogue, a fifth tab, or a gesture on the world.
2. **The hire costs money, once, at the tick the command executes**, and the
   figure is read from the role's own authored `wageBand.minPerDay` in
   `src/content/staff-role-catalog.ts`. **This ADR sets no number.** It says
   which authored field is read and on what scale; what that field should
   *hold* is content, and [ADR 0017](./0017-money-primary-resource-model.md)
   decision 5 puts pricing and balance out of scope for anything but issue #29.
3. **The surface offers exactly one role — `staff-role.guard` — and the
   simulation refuses any id the staff-role catalogue does not declare.** No
   further filtering: the command's vocabulary is the catalogue's, and the
   producer's is one row of it.

If (1) goes the other way, the alternative it goes to is **alternative B**, a
disclosure on the Build panel in the shape #282 gave the buy control. That is
named here as the reversal target rather than as a discarded idea, because it
is the cheapest thing to build and the honest reason to refuse it is a
measurement somebody else already took, not a preference.

If (2) goes the other way, the alternative is **no charge at all** —
alternative D — which is coherent, is one line smaller, and is refused because
[ADR 0017](./0017-money-primary-resource-model.md) decision 1 says every
meaningful decision costs money and a free guard is the clearest possible
counter-example to it.

### What the evidence rests on, stated because it bounds every claim below

Two kinds of claim appear here.

**Structural claims** — what a type is, what a method takes, what a test
asserts — were verified against this branch's `main` at v0.0.37, and every
`file:line` below resolves there unless the text says otherwise.

**Layout claims** are inherited rather than newly measured, and that is stated
because it is the weaker half. The pixel budgets quoted in
[ADR 0022](./0022-room-zoning-surface.md) and in `src/ui/hud/hud.css` were
measured on a local merge of #282 and #283, both of which have since landed.
This ADR takes two figures from them — the Build panel's 3.9px of always-visible
headroom at 900×600, and the horizontal overflow a third button in
`.hud-build__actions` causes — and does not re-measure them. What it *adds* is
structural and needs no measurement: the Security tab renders no panel at all
today, so a panel put there competes with nothing.

## Context

### The consumer is finished, four systems are waiting on it, and nothing in the application can reach it

`GuardRoster.hire` (`src/simulation/security/guard-roster.ts:75`) is complete.
It spawns an entity in the roster's own `EntityStore`, mints an actor name
through the ADR 0015 seam when the session supplied one, and writes a
`GuardRecord` at `'unassigned'`. It is snapshotted (`:178`), restored (`:192`),
and its restore path already reasons about a guard caught mid-travel.

**It has zero callers anywhere in `src/`.** Every call in the repository is in
`tests/`. That single gap starves four systems that are built, scheduled and
tested:

- `DeploymentSystem` walks `unassignedGuardIds()` to fill a sector's required
  headcount (`src/simulation/security/deployment-system.ts:108`).
- `PatrolSystem` walks `allGuardIds()` and starts a loop for each guard on post
  (`src/simulation/security/patrol-system.ts:72`).
- `IncidentResponseSystem` claims responders from `unassignedGuardIds()`
  (`src/simulation/incidents/response-system.ts:124`).
- `SearchSystem` claims a searcher the same way
  (`src/simulation/contraband/search-system.ts:150`).

All four iterate an empty collection in every session a player can start. The
status strip's `Staff` count is therefore structurally zero
(`src/simulation/presentation/status-strip-projection.ts:163`), which is the
same class of claim `src/ui/hud/projection.ts` warns about for a money counter
with no economy — and the whole staff projection
(`src/simulation/presentation/staff-projection.ts`), roster rows, per-role
counts, per-phase counts, coverage and all, is reachable only from a test.

`src/content/staff-role-catalog.ts` is in the same position from the other
end. Eight roles, each with a `nameKey` that resolves in the bundled catalogue
(`src/content/default-locale-en.ts:66-73`), a department, a clearance, a
permission list and a `wageBand`. **Nothing outside `src/content/` reads any of
it**; `tests/foundation/unconsumed-content-contract.test.ts` records five of
the eight ids as having no consumer anywhere at all.

### What a producer is, structurally, and the two constraints on it

The HUD may not import the simulation. That is `AGENTS.md` boundary 1 in its
strongest form for `src/ui/hud/**`, and `tests/unit/ui-hud-messages.test.ts`
asserts it by scanning for the import. So the HUD cannot build a command: it
emits a `HudIntent` (`src/ui/hud/hud.ts:153`) and `src/main.ts` turns it into
one, in the `onIntent` switch. The two most recent producers took exactly that
route and are the pattern this follows —
`case 'place-build-order'` and `case 'purchase-materials'` in `src/main.ts`.

Text never crosses either boundary
([ADR 0011](./0011-localization-architecture.md)): every rendered string is a
message key, and a stable content id may never reach the player. The staff-role
catalogue is unusually well placed for that, exactly as the room catalogue was
for ADR 0022 — all eight roles carry a real `nameKey` and all eight
`staff-role.*.name` keys ship in the default catalogue, so the producer needs
no id→key mapping table of the kind `BUILDABLE_LABEL_KEY` (`src/main.ts:269`)
exists to supply.

### A refusal already has somewhere to go, and this is the first surface built after it

#283 finished the route. A system that declines a command it was handed records
a `RefusalReason` on the session's `RefusalLog`
(`src/simulation/refusals/refusal-log.ts`), the worker publishes the most recent
one beside the status counts, and `hudAlertsFromWorkerMessage`
(`src/ui/simulation-alerts.ts`) turns it into the alerts list's one row. Nothing
about that route has to be built here; what a new command owes it is three
things — a wire id per refusal reason, an entry in an exhaustive `Record`, and a
sentence in the default catalogue.

#282 established the *other* half, and the two are deliberately on opposite
sides of one dispatch: the composition root checks affordability against the
balance the worker last published and **throws instead of submitting**, so the
refusal a player can actually provoke is answered on the control they pressed
rather than some ticks later. One press produces exactly one player-visible
message, from one side of `sender.submit` or the other, never both and never
neither.

### The money model this sits inside

[ADR 0017](./0017-money-primary-resource-model.md) is Accepted. Decision 1:
money is the primary resource and **every meaningful decision costs money**.
Decision 5: *this ADR decides no prices and no balance values*, and #29 owns
final pricing. Decision 3's income line and decision 8's insolvency ladder are
settled as answers and **unbuilt** — nothing credits the treasury on a schedule,
and `Treasury.spend` refuses rather than overdrawing
(`src/simulation/economy/treasury.ts`).

`docs/HUD_PROJECTIONS.md` gap 21 has said, since #96, that `wageBand` exists in
content and there is no payroll: *"no wage is ever debited"*. This ADR makes
that sentence false in exactly one narrow way and true in every other, which is
why decision 2 below is written as carefully as it is.

## Decision

### 1. The gesture is a press on a Staff panel, on the Security tab

`HUD_TAB_IDS` has had four members since #74 — `overview`, `build`, `security`,
`regime` (`src/ui/hud/hud-state.ts:14`) — and **three of them render no panel
at all.** `mountHud` builds exactly one panel for the rail's `.hud__side` slot
and shows it on one tab: `buildPanel.setVisible(state.activeTab === 'build')`.
Selecting Security today changes the tab bar's `aria-current`, sets
`data-active-tab`, hides the Build panel and puts nothing in its place.

So the surface costs no tab, no catalogue row and no always-visible pixel in
any panel that already exists. It is a second panel in the same slot, shown
under the same rule, hidden whenever the Build panel is shown. **The two are
never laid out at the same time**, which is what makes the Build panel's height
budget — the 3.9px at 900×600 that ADR 0022 and `hud.css` both record — simply
not a constraint on this surface.

The panel holds one list of hireable roles and one action. It is not a staff
*roster* panel: it lists what can be hired, not who has been. Listing the
people is a projection this tree already has (`projectStaff`) and a surface
this ADR does not design — see *What this decision does not settle*.

### 2. Hiring charges one day at the bottom of the role's authored wage band

Once, at the tick the command executes, from the same `Treasury` a purchase
spends from.

**Where the number comes from, and who owns it.** It is
`StaffRoleDefinition.wageBand.minPerDay`, read from the staff-role catalogue.
This ADR chooses *which authored field is read*; it does not choose the figure.
The catalogue's own comment on `wageBand` already says who does — *"A wage/skill
hook, not a real economy -- issue #29 owns pricing/payroll"* — and ADR 0017
decision 5 says the same thing one level up. If #29 decides a guard's band is
120–190 rather than 80–140, nothing here changes and no code moves.

`minPerDay` rather than the maximum or a point between them, for a reason that
is structural rather than a balance judgement: a band's floor is the one figure
in it that needs no second decision to read. A midpoint is arithmetic nobody
authored, and a maximum is the same choice made in the more expensive
direction. **A new hire is engaged at the bottom of their band**, and where in
the band an individual actually sits is a skill/negotiation model that does not
exist — recorded below as not settled.

**The scale is the treasury's minor units**, and that is a decision this ADR
takes because the catalogue does not state a unit at all. There is exactly one
money scale in this tree: `Treasury` counts integer minor units,
`ProcurableMaterial.unitPriceMinorUnits` is quoted in them, and the status
strip renders the balance in them with no currency named (#96 named none). A
second scale would be a conversion nobody has chosen, so the wage band's
integers are read as minor units unchanged.

**One charge, not a payroll.** This is an engagement charge at the moment of
hire. It is *not* ADR 0017 decision 3's recurring cost, it does not recur, and
it creates no schedule. That matters for more than tidiness: decision 8's
insolvency ladder is unreachable precisely because no recurring charge exists
that a player cannot decline, and a one-off charge that `Treasury.spend`
refuses rather than overdrawing keeps it unreachable. Nothing here makes a
negative balance possible.

### 3. The command is `HireStaff`, and it carries ids and numbers only

```
{ type: 'HireStaff', staffRoleId: string, x: int, y: int }
```

`staffRoleId` is the stable content id (`staff-role.guard`), never an instance
or a message key. `x`/`y` are the tile the hired staff member first stands on,
because `GuardRoster.hire(staffRoleId, originTile)` takes one and nothing in
the simulation can derive one — see decision 4.

`staffRoleId` and the coordinates are validated at the decode boundary by
`hireStaffSchema`, in the same `.strict()` discriminated union every other
command is in (`src/simulation/protocol/commands.ts`). The role id uses
`identifierSchema` for the reason `PurchaseMaterials.itemId` does: a malformed
id must be refused where the fix can sit next to its cause, not several layers
downstream.

The command reaches `StaffHiringService.hire` through
`src/simulation/runtime/session-commands.ts`, beside `ZoneRoom` and
`PurchaseMaterials` and for the same stated reason: a module named for
construction that also hires people is the shape a reader has to already know
about to find.

**Three refusals, and they are the three the service can produce:**

| Reason | When | Wire id |
| --- | --- | --- |
| `unknown-role` | `staffRoleId` names no row in the staff-role catalogue | `hire.unknown-role` |
| `insufficient-funds` | `Treasury.spend` refuses the wage | `hire.insufficient-funds` |
| `roster-full` | the roster is at the capacity its `EntityStore` was built with | `hire.roster-full` |

`roster-full` is a guard rather than a policy. `EntityStore.spawn()` **throws**
`'EntityStore capacity exhausted'` (`src/simulation/entity/entity-store.ts:102`),
and a throw out of the kernel's command handler is not a refusal — it is a
crashed tick. Checking the headcount against the capacity before spawning turns
a structural fault into the ordinary refusal the player is told about, which is
the reading `Treasury.spend` already takes of a purchase that cannot be
afforded.

Every refusal leaves the treasury, the roster and the entity store untouched.
The wage is spent only after the role resolves and the capacity check passes,
so there is no state in which money left and no one arrived.

### 4. Where a hired guard first stands is the composition root's, and it is a placeholder tied to an existing one

The producer sends the same origin tile the Build panel's numeric route starts
from — the middle of the one chunk a new session owns — and the two now read
one exported constant instead of two copies of `16`.

This is honestly a placeholder, and it is one only because a better answer does
not exist yet: there is no reception, no gate, no staff room and no
`room.delivery-bay` instance in any session a player can start
(`src/simulation/runtime/new-session.ts` registers no rooms, by the same "no
fabricated default content" convention every registry there follows). A
constant inside the *simulation* would be worse — it would make an arrival
point look like a rule — so it sits at the composition root, where
`buildCatalogue()`'s `origin` already sits with its reason written down.

The revisit trigger is stated rather than implied: **when a session can contain
a room a staff member belongs in, the arrival tile becomes that room's anchor,
and that is a change to the producer alone.** The command already carries a
tile, so nothing about the wire, the schema, the service or the save moves.

### 5. The surface offers one role, and the simulation refuses only an undeclared one

The panel lists `staff-role.guard` and nothing else. Not because the other
seven are wrong, but because of what would happen to them: **`DeploymentSystem`,
`PatrolSystem`, `IncidentResponseSystem` and `SearchSystem` all claim staff from
`GuardRoster.unassignedGuardIds()` with no filter on role.** A nurse hired
into that roster is sent to a patrol post by the next scheduled deployment
tick. Offering the other seven roles would therefore ship seven ways to put the
wrong person on a wall, which is worse than not offering them.

The *simulation* is not given a role whitelist, and that is the deliberate half.
`GuardRoster` has stored whatever `staffRoleId` it was handed since #26, and
`projectStaff`'s own comment says so — *"every role in
`src/content/staff-role-catalog.ts` is representable"*. Encoding "only guards
may be hired" in the command handler would be a new rule invented to make one
panel's shape true, and it would have to be unpicked by the first feature that
hires a cook. So the command accepts any **declared** role and the producer
offers one; the gap between those two is recorded here rather than closed by a
check.

### 6. No text crosses either boundary

The panel is handed, per role, a stable id, the role's own `nameKey` from the
catalogue, and the wage as an integer. It resolves the key at render time.
The three refusal reasons cross the worker boundary as ids from the closed
`REFUSAL_REASONS` enum and are mapped to `hud.alert.refusal.hire.*` keys by the
same exhaustive `Record` every other reason goes through, so a fourth refusal
reason fails to compile until somebody decides what the player is told.

## Alternatives considered

### A — a Staff panel on the Security tab. **Chosen.**

Recorded above. Its cost is a second panel module and a second `setVisible`
call; its benefit is that it competes with nothing, needs no measurement to
justify, and gives the three empty tabs their first inhabitant.

### B — a disclosure on the Build panel, in #282's shape. **Rejected, and named as the successor.**

The cheapest thing to build: the machinery is there, the pattern is proven, and
a disclosure costs no always-visible height until it is opened — which is
exactly the argument #282 made and measured.

It is rejected on two counts.

**The measured one.** The disclosure pattern's cost is not zero, it is *the
toggle*, and the toggle's row is full. ADR 0022 records the measurement: a
**third** button in `.hud-build__actions` keeps the row at 44.0px and overflows
the panel **horizontally by 37.9px**, clipped with no scrollbar, because
`.ui-panel` sets `overflow: hidden` and `.ui-panel.hud-build` overrides it on
the y axis only. It fits only at 375×812, where the panel is full width. So B
starts by needing a layout change to the one panel this repository has already
fixed twice for overflow (#143, #174).

**The structural one, which would survive B being made to fit.** The Build
panel is *about the thing you are placing*: the catalogue selects it, the arm
button places it, the buy control buys the material **that buildable is made
of**. A guard is not made of anything in that panel and is not placed by it.
Hanging hiring off the current selection would make the panel's own organising
idea false, and hanging it off nothing would make it a drawer.

**The revisit trigger.** B becomes right if the Security tab is given to
something else — a sector map, a lockdown control — and staffing has nowhere
better to be. Nothing in A forecloses B: the intent in decision 3 is unchanged
by which surface emits it.

### C — a fifth tab, "Staff". **Rejected on a measured constraint that is not this ADR's.**

ADR 0022 measured it: with a fifth tab injected, `.hud-tabs__inner` spans
x = 1.8…373.2 at 375×812 — 1.8px of margin per side — and a **sixth tab is
foreclosed** at that viewport. Spending the one remaining slot on hiring, when
an existing tab is empty and named for exactly this department, would be
spending the scarcest thing in the HUD to avoid writing a `setVisible` call.

### D — hire for free. **Rejected.**

Coherent, smaller, and the only alternative that touches decision 2 rather than
decision 1. It is refused because ADR 0017 decision 1 is Accepted and says
every meaningful decision costs money — and because the audit ADR 0017 quotes
names the failure mode directly: *"Without a constrained resource, building is
an editor, not a management decision."* A free guard makes staffing an editor.

The honest cost of refusing it is that a charge is a balance-adjacent act in a
repository that has deliberately made no balance decisions. Decision 2 is
written to pay that cost in the only currency available: the number is content,
the field is named, and the owner of the number is named with it.

### E — hire as a scenario/session setup call rather than a player command. **Rejected.**

`createNewSimulationRuntime` could hire a starting guard, which would move the
`Staff` count off zero and wake the four systems with no interface at all. It
is refused because it is not a surface: it would hand every prison the same
staff and give the player no way to change it, and #26's own convention —
stated four times in `new-session.ts` — is that a new session fabricates no
default content. It would also leave `GuardRoster.hire` with a caller and the
*player* with none, which is the defect renamed rather than fixed.

## What this decision does not settle

Left open deliberately. None of these has an answer in the tree, and inventing
one here would be the invented-consequence defect this repository spends the
most effort on.

1. **Payroll.** Nothing recurring is created. ADR 0017 decision 3's standing
   cost, decision 6's income line and decision 8's insolvency ladder are all
   exactly as unbuilt after this as before it, and `docs/HUD_PROJECTIONS.md`
   gap 21 keeps everything it says except the one clause this makes false.
2. **Where in the band an individual sits.** `wageBand` has two ends and this
   reads one. A hire whose wage depends on skill needs a skill model, and gap
   20 records that no staff entity carries a skill at all.
3. **Dismissal, and therefore any refund.** No command removes a staff member,
   `GuardRoster` has no destroy path, and #31 records that nothing in `src/`
   destroys an entity of any kind. A refund is not "the other half" of this —
   it is a second feature with its own decision about what a departing guard
   costs or returns.
4. **Whether a hire should be undoable.** `HireStaff` carries no
   `transactionId`. `ConstructionSystem.registerTransactionOrder` groups
   *construction* orders and hiring writes none, so there is nothing for undo
   to pop; whether the undo stack should grow a second kind of entry is the
   same open question ADR 0022 left for zoning, and it should be answered once
   for both.
5. **Which roles the surface should offer once a role means something.**
   Decision 5 offers one because six of the other seven are unreadable by any
   system and the eighth (`staff-role.security-chief`) would be treated as a
   guard. When a system reads a department or a permission, this list grows —
   and the growth is a change to the producer's projection, not to the command.
6. **Whether the panel should also list who is hired.** `projectStaff` produces
   rows, per-role counts, per-phase counts and coverage today, and none of it
   crosses the worker boundary: `simulation/status-counts` carries two staff
   *integers* and nothing else. Putting a roster on screen means putting a
   paged projection on a channel that currently carries eleven scalars, which
   is `docs/HUD_PROJECTIONS.md` contract 5's subject and not this ADR's.
7. **Whether the arrival tile must be owned, in bounds, or reachable.**
   `GuardRoster.hire` checks none of the three and the hiring service adds no
   check, so a `HireStaff` composed anywhere other than this producer can put a
   guard on a tile no chunk has materialised. Nothing reads a staff position as
   a constraint yet — `PatrolSystem` and `DeploymentSystem` both path *from*
   wherever the guard is — so a check here would be a rule with no reader.

## Consequences

- **`GuardRoster.hire` gains its first production caller**, and with it
  `DeploymentSystem`, `PatrolSystem`, `IncidentResponseSystem` and
  `SearchSystem` gain the input all four were written for. None of them is
  changed by this.

  **What that does not mean, stated because it is the easy over-claim.** Each
  of those four needs a *second* input this ADR does not supply, and each of
  those is its own gap: a `DeploymentSchedule` pushed into `securitySchedules`
  (empty in every new session), a sector for a patrol to loop around, an open
  incident, a contraband instance and a search policy. What this closes is that
  the staff side of all four stopped being the missing half; a guard hired
  today stands where they were hired and is claimed by nobody, which is
  honest rather than disappointing — it is the state the roster's `'unassigned'`
  phase exists to describe. It is also why `staffUnassigned` will read equal to
  `staff` until something registers a sector.
- **The status strip's `Staff` count stops being structurally zero**, in the
  same way #261's zoning step moved `Rooms`. `staffUnassigned` moves with it
  and stays equal to `staff` until a session has a sector, because
  `DeploymentSystem` assigns nobody when `securitySchedules` is empty — which
  it is in every new session.
- **`tests/foundation/unconsumed-command-contract.test.ts` must gain a
  `HireStaff` producer and move its counts in the same change.** Seven declared
  commands, five produced, two still awaiting a producer
  (`CancelBuildOrder`, `ZoneRoom`). The gate fails in both directions, so
  neither the list nor the count can be edited alone.
- **`tests/foundation/unconsumed-content-contract.test.ts`'s strict measure
  moves by exactly one.** `staff-role.guard` gains its first `src/` consumer,
  so `unconsumedBySrcOnly` goes 53 → 52. `unconsumedBySrcAndTests` does not
  move: the id already had test consumers, so it is in neither allowlist and
  no entry is added or deleted. The other seven role ids are untouched.
- **`docs/HUD_PROJECTIONS.md` gaps 19 and 21 must be corrected in the same
  change.** Gap 19 says there is no hiring system; gap 21 says no wage is ever
  debited and that nothing wage-related may be rendered as a live figure. All
  three clauses become false and the surrounding claims stay true — there is
  still no payroll, still no income, and the only thing that credits the
  treasury is still a cancelled purchase's refund.
- **The refusal channel gains three ids and no new mechanism.**
  `REFUSAL_REASONS` goes from fifteen members to eighteen, and
  `tests/unit/simulation-refusals.test.ts` moves from asserting three domain
  prefixes to four. The payload shape, the cadence and the alert row are
  untouched.
- **The save format does not change.** `StaffHiringService` holds no state of
  its own: the money is the treasury's, the staff are the roster's, and both
  are already in the `economy` and `security` sections
  (`docs/PERSISTENCE.md:555`). A prison saved with hired guards restores with
  them today, and did before this.
- **Nothing here is enforced by a test.** This is a decision about a surface,
  and no gate can assert that hiring is a Security-tab panel rather than a
  Build-panel disclosure. What the implementation owes is listed above; the
  choice itself is held by this document and by the index row that reports its
  status.
