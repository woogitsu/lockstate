# ADR 0025: Where a player hires a guard, and what the hire costs

## Status

**Accepted, 2026-08-25.** The three things below are approved as written, and the
surface that shipped with this document (#302) is binding rather than merely
present.

The owner delegated the choice of surface, and this document is the record of
what was chosen under that delegation. This status is the owner saying so.

**This is 0025 and not 0024**, which was the next free number when it was
written. It moved because another unmerged branch had claimed 0024 for a
different document — since merged as
[ADR 0024](./0024-protocol-fault-recoverability.md) — and the repository's own
precedent, recorded in `docs/adr/README.md` for the kernel ADR, is to take the
lowest number free *without coordinating with unmerged or held work*. The index
carries the reason, and no citation of any other ADR moved.

What was signed off is three things, and they are separable:

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

**No wage figure is approved by this, because none is set here.** Decision 2
chooses which authored field is read and on what scale; what that field *holds*
stays with issue #29, exactly as
[ADR 0017](./0017-money-primary-resource-model.md) decision 5 requires. The
seven items in §*What this decision does not settle* are untouched by the
approval and stay open — payroll, where in a band an individual sits, dismissal
and refunds, undoability, which roles the surface offers, whether the panel
lists who is hired, and whether the arrival tile must be owned, in bounds or
reachable.

Were (1) reversed, the alternative it goes to is **alternative B**, a
disclosure on the Build panel in the shape #282 gave the buy control. That is
named here as the reversal target rather than as a discarded idea, because it
is the cheapest thing to build and the honest reason to refuse it is a
measurement somebody else already took, not a preference.

Were (2) reversed, the alternative is **no charge at all** —
alternative D — which is coherent, is one line smaller, and is refused because
[ADR 0017](./0017-money-primary-resource-model.md) decision 1 says every
meaningful decision costs money and a free guard is the clearest possible
counter-example to it.

### What the evidence rests on, stated because it bounds every claim below

Two kinds of claim appear here.

**Structural claims** — what a type is, what a method takes, what a test
asserts — were verified against this branch's `main` at v0.0.37, and every
`file:line` below resolves there unless the text says otherwise.

> **That second clause is false, and it is kept rather than deleted because it
> is what every reader below was told** (`docs/AGENT_WORKFLOW.md` §4: mark both
> directions). A global anchor pin does not date what is under it. This
> document's own anchors were re-aimed beneath that unchanged sentence on
> 2026-09-06 by `f0c7fe9c` — `icon.ts:68` to `:79`, `hud.ts:270` to `:322` —
> which is one of the seven commits `docs/adr/README.md`'s section *"A global
> anchor pin in an ADR is advisory, and does not date what is below it"*
> tabulates. **Read the sentence as a statement about the day it was written
> and nothing else.** Swept again on 2026-09-15: of the thirteen rooted
> `file:line` anchors below, **one** still resolved onto what its sentence
> names. The rest are re-aimed in place, and where the thing itself is gone the
> prose is corrected beside the original rather than over it.

**Layout claims** are inherited rather than newly measured, and that is stated
because it is the weaker half. The pixel budgets quoted in
[ADR 0022](./0022-room-zoning-surface.md) and in `src/ui/hud/hud.css` were
measured on a local merge of #282 and #283, both of which have since landed.
This ADR takes two things from them — the Build panel's always-visible headroom
at 900×600, and the horizontal overflow a third button in
`.hud-build__actions` causes — and does not re-measure them.

**The headroom figure this paragraph used to state, 3.9px, is withdrawn rather
than replaced.** It was attributed to ADR 0022 and `src/ui/hud/hud.css`, and
neither records it: `3.9` appears in no other ADR, in no `.css` file and nowhere
in `src/`. What those two sources actually record at 900×600 is **7.81px** —
`hud.css` says *"the always-visible budget for a new block is 7.81px — the
corrected figure, measured to 0.05px after #174's second half"*, and ADR 0022's
table and amendment carry 7.8, 7.81 and 7.9 for the fold gap, against a
superseded 11.8–12.2. So this was not a stale number; it was one nobody can
source, and picking a replacement would be inventing a measurement rather than
inheriting one, which is exactly what this paragraph says it is not doing. No
figure is stated in its place because **this document's argument does not turn
on it** — see decision 1 below, whose point is that the Build panel and this
panel are never laid out together, so the budget is not a constraint on this
surface at any value.

**Correction, 2026-08-30: the last clause of that sentence is false, and the
class it belongs to is what to take from this.** `'M15.8 16.1h3.9'`
(verbatim in `src/ui/primitives/icon.ts`) — the fourth stroke of the
`ui-scale` glyph, SVG path data and nothing whatever
to do with a headroom figure. **Converted from a line citation
(`icon.ts:68`, then re-anchored to `:79`) to this quotation, 2026-09-06, per
`docs/AGENT_WORKFLOW.md` §4: this exact string is what the paragraph's whole
argument rests on, and a quotation fails the moment the string does, where a
line number would have kept resolving to whatever the string had become.**
It arrived at `2a00f98` (#579, v0.0.212) on
2026-08-29 with the interface-scale control; `git show
cfab558:src/ui/primitives/icon.ts` returns no `3.9` at all, and `git log -S
'h3.9' -- src/ui/primitives/icon.ts` names that one commit.

**The sentence is kept above rather than reworded**, for the reason that makes
this worth more than a re-grep. It makes three absence claims. Two are bounded
by something — *no other ADR*, *no `.css` file* — and hold: the four `.css`
files under `src/ui/` record no such figure (still four, counted again here),
and no other ADR records one. **The third is bounded by nothing.** *"Nowhere in
`src/`"* is not a claim about a headroom budget at all; it is a claim about a
two-character sequence, and character sequences recur — in a path command, a
version fragment, a coordinate. Re-wording it to exclude `icon.ts` would produce
a clause that breaks again the next time anybody draws a glyph, so it is not
re-worded.

**And the bounded halves were never grep-clean either, which is the sharper
half of the finding.** ADR 0022 line 588 reads *"÷ 12.2 is 23.9"* — a different
number, and a raw `grep '3\.9' docs/adr/` has always returned it. That line
entered at `84e1c61` on 2026-08-25, **two days before this withdrawal paragraph
was written at `b573000`**. So the sentence was never the output of the grep it
invites, in any of its three clauses: it was always the result of someone
reading the hits and judging them, which is the right thing to have done. What
the unbounded clause changed was only that the misreading became available to a
reader who counts instead.

**None of this touches the argument.** The figure stays withdrawn, no
replacement is invented, and decision 1's point — that the Build panel and this
panel are never laid out together, so the budget constrains this surface at no
value — is untouched by whether some file somewhere contains those two
characters. Recorded because `docs/adr/STATUS-QUEUE.md` §6 caught the
falsification at the v0.0.215 re-anchor and handed the fix here explicitly, and
because #579 falsified three documented claims in one change; the other two,
in `docs/INPUT.md`, were corrected in #607.

*A guess at where it came from, offered as a guess:* `hud.css` continues,
*"Roughly 4px of whichever it was had never been space at all: it was the
catalogue laying its own gutter over the map block's hairline"*, and
11.8 − 7.81 = 3.99. A figure for the space that turned out **not** to exist reads
very like a figure for the space that does. Nothing confirms that reading, and
it is recorded only so the next reader does not spend the same hour on it. What it *adds* is
structural and needs no measurement: the Security tab renders no panel at all
today, so a panel put there competes with nothing.

## Context

### The consumer is finished, four systems are waiting on it, and nothing in the application can reach it

`GuardRoster.hire` (`src/simulation/security/guard-roster.ts:89`; the anchor
read `:75`) is complete.
It spawns an entity in the roster's own `EntityStore`, mints an actor name
through the ADR 0015 seam when the session supplied one, and writes a
`GuardRecord` at `'unassigned'`. It is snapshotted (`:249-250`, `getSnapshot`),
restored (`:278`, `loadSnapshot`) — the anchors read `:178` and `:192`, were
re-aimed to `:240` and `:269` when this branch was written, and **both had gone
stale a second time** by the time it merged `origin/main` on 2026-09-16:
`:240` is `allGuardIds()` and `:269` is a bare ` *` inside a docblock —
and its restore path already reasons about a guard caught mid-travel.

**It has zero callers anywhere in `src/`.** Every call in the repository is in
`tests/`.

> **Not since this ADR's own surface shipped** (#302, and the Status block
> above says so). `GuardRoster.hire` is called from
> `src/simulation/staff/hiring.ts:221`, which
> `src/simulation/runtime/session-commands.ts:725` reaches on a `HireStaff`
> command. This paragraph and the *Consequences* bullet *"`GuardRoster.hire`
> gains its first production caller"* have therefore disagreed with each other
> inside one file for as long as the implementation has existed; the Context is
> the half that is history and is kept, dated, because the decision was taken
> against it.

That single gap starves four systems that are built, scheduled and
tested:

- `DeploymentSystem` walks `unassignedGuardIds()` to fill a sector's required
  headcount (`src/simulation/security/deployment-system.ts:194`).
- `PatrolSystem` walks `allGuardIds()` and starts a loop for each guard on post
  (`src/simulation/security/patrol-system.ts:73`).
- `IncidentResponseSystem` claims responders from `unassignedGuardIds()`
  (`src/simulation/incidents/response-system.ts:535`).
- `SearchSystem` claims a searcher the same way
  (`src/simulation/contraband/search-system.ts:295`).

> **Three of those four no longer call `unassignedGuardIds()` at all**, and the
> anchors above are the re-aimed ones rather than the originals (`:108`, `:72`,
> `:124`, `:150`, every one of which now lands in a docblock). Since
> [ADR 0053](./0053-who-may-stand-a-security-post.md) `DeploymentSystem` and
> `IncidentResponseSystem` call `claimableGuardIds` and `SearchSystem` calls
> `claimableSearchGuardIds`, both in `src/simulation/security/post-eligibility.ts`.
> `PatrolSystem` still walks `allGuardIds()`. What the bullets are being cited
> for here — that four built systems had no staff to iterate — is unaffected;
> what has changed is the method name, and decision 5 below turns on it.

All four iterate an empty collection in every session a player can start. The
status strip's `Staff` count is therefore structurally zero
(`src/simulation/presentation/status-strip-projection.ts:798-803`, `let staff =
0; … for (const entityId of source.staff.allGuardIds()) { staff += 1;`; the
anchor read `:163`, was re-aimed to `:782-787` when this branch was written, and
**that went stale a second time** before it merged `origin/main` on 2026-09-16 —
`:782-787` counts *rooms*, not staff, which is the kind of near-miss that reads
as correct to anyone who does not open it), which is the
same class of claim `src/ui/hud/projection.ts` warns about for a money counter
with no economy — and the whole staff projection
(`src/simulation/presentation/staff-projection.ts`), roster rows, per-role
counts, per-phase counts, coverage and all, is reachable only from a test.

`src/content/staff-role-catalog.ts` is in the same position from the other
end. Eight roles, each with a `nameKey` that resolves in the bundled catalogue
(`src/content/default-locale-en.ts:105-112`; the anchor read `:66-73`), a department, a clearance, a
permission list and a `wageBand`. **Nothing outside `src/content/` reads any of
it**; `tests/foundation/unconsumed-content-contract.test.ts` records five of
the eight ids as having no consumer anywhere at all.

### What a producer is, structurally, and the two constraints on it

The HUD may not import the simulation. That is `AGENTS.md` boundary 1 in its
strongest form for `src/ui/hud/**`, and `tests/unit/ui-hud-messages.test.ts`
asserts it by scanning for the import. So the HUD cannot build a command: it
emits a `HudIntent` (`src/ui/hud/hud.ts:365`; the anchor read `:322`, itself
the 2026-09-06 re-aim of `:270`) and `src/main.ts` turns it into
one, in the `onIntent` switch. The two most recent producers took exactly that
route and are the pattern this follows —
`case 'place-build-order'` and `case 'purchase-materials'` in `src/main.ts`.

Text never crosses either boundary
([ADR 0011](./0011-localization-architecture.md)): every rendered string is a
message key, and a stable content id may never reach the player. The staff-role
catalogue is unusually well placed for that, exactly as the room catalogue was
for ADR 0022 — all eight roles carry a real `nameKey` and all eight
`staff-role.*.name` keys ship in the default catalogue, so the producer needs
no id→key mapping table of the kind `BUILDABLE_LABEL_KEY` (`src/main.ts:766`;
the anchor read `:269`) exists to supply.

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

> **There is no `security` tab any more, and this paragraph is left as it stood
> rather than re-aimed onto whatever now sits at that line** (`docs/AGENT_WORKFLOW.md`
> §4). `HUD_TAB_IDS` is `['overview', 'build', 'zones', 'manage', 'day-plan']`
> (`src/ui/hud/hud-state.ts:77`), five members, and the Staff panel this
> decision placed is mounted on `manage`:
> `staffPanel.setVisible(state.activeTab === 'manage')` (`src/ui/hud/hud.ts:2611`;
> the anchor read `:2506`, a bare `*/`. [ADR 0022](./0022-room-zoning-surface.md)'s
> copy of this same claim was re-aimed to `:2558` and this one was not — the same
> sentence cited twice, corrected once. **Both now read `:2611`**: #1279 inserted
> the alerts fold's `placeAlertsFold` and its `onTierChange` wiring above this
> call on 2026-09-17, so `:2558` died the day after it was written and both
> copies were re-aimed together this time).
> What moved it is [ADR 0112](./0112-what-the-2026-09-13-identity-delivery-decides.md)
> decision 3, ruled by the owner on 2026-09-13 and merged as `919d6b15` on
> 2026-09-14 — whose own text names the rename in this direction: *"Moving staff
> from Security to Manage is a UI grouping the delivery explicitly marks as a
> naming proposal rather than a module move."* **Decision 1 itself is not
> reversed by that**: the gesture is still a press on a Staff panel occupying a
> rail slot that was otherwise empty, and it is still the only panel in that
> slot on its tab. Only the tab's id and label moved. The count *"four
> members"*, the list of ids and *"three of them render no panel at all"* are
> the sentences that stopped being true, which is the shape §4 says rots first.

So the surface costs no tab, no catalogue row and no always-visible pixel in
any panel that already exists. It is a second panel in the same slot, shown
under the same rule, hidden whenever the Build panel is shown. **The two are
never laid out at the same time**, which is what makes the Build panel's height
budget at 900×600 — whatever its value; see *Layout claims* above, where the
figure this sentence used to quote is withdrawn as unsourceable — simply
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
`'EntityStore capacity exhausted'` (`src/simulation/entity/entity-store.ts:138`;
the anchor read `:102`, then `:118`),
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
tick.

> **The filter now exists, so the premise of this paragraph is gone and the
> paragraph is kept rather than rewritten** (`docs/AGENT_WORKFLOW.md` §4).
> [ADR 0053](./0053-who-may-stand-a-security-post.md) put the role test between
> the roster and the claimants:
> `source.unassignedGuardIds().filter((entityId) => isEligible(source.getStaffRoleId(entityId)))`
> is the whole of `claimableGuardIds`
> (`src/simulation/security/post-eligibility.ts:103-108`), and
> `DeploymentSystem`, `IncidentResponseSystem` and `SearchSystem` call it or its
> search-pool sibling in place of `unassignedGuardIds()`. A nurse hired into the
> roster is **not** sent to a patrol post today. **The decision this paragraph
> supports is unaffected and the reasoning under it is not**: the surface still
> offers one role, but *"offering the other seven roles would ship seven ways to
> put the wrong person on a wall"* is no longer the reason, and the deliberate
> half below — *"the gap between those two is recorded here rather than closed
> by a check"* — records a gap that a later ADR closed with exactly such a
> check. Offering the other seven roles would therefore ship seven ways to put the
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

> **The slot this refuses to spend was spent, twice over, and the bar is not
> five tabs of the four it was measured against.** ADR 0022's own amendment
> took the fifth slot for the Rooms tab in #312, and ADR 0112 decision 3 then
> replaced the whole set with `overview`, `build`, `zones`, `manage`,
> `day-plan`. So *"an existing tab is empty and named for exactly this
> department"* describes a tab bar that no longer exists, and the arithmetic
> above is history. The *conclusion* is untouched — the Staff panel still costs
> no tab, because it shares `manage` — and that is why the paragraph is kept
> rather than re-derived against today's bar, which nobody has measured.

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
  (`docs/PERSISTENCE.md:1310` for `economy` and `:1307` for `security`, the two
  rows of the section-ownership table; the anchor read `:555`, was re-aimed to
  `:1291`/`:1294` when this branch was written, and **both went stale a second
  time** before it merged `origin/main` on 2026-09-16, landing mid-sentence in a
  paragraph about a partial save). A prison saved with hired guards restores with
  them today, and did before this.
- **Nothing here is enforced by a test.** This is a decision about a surface,
  and no gate can assert that hiring is a Security-tab panel rather than a
  Build-panel disclosure. What the implementation owes is listed above; the
  choice itself is held by this document and by the index row that reports its
  status.
