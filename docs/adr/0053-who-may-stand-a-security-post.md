# ADR 0053: Who may stand a security post

## Status

**Proposed, 2026-08-28.** Not self-approved.

It closes issue #456, split out of #442, and it is implemented on this branch
under the owner's standing mandate (`AGENTS.md`, "The owner's standing mandate":
*decide after research rather than asking*). Nothing here touches the four
exclusions that mandate keeps: no server entry point, no `supabase/migrations/`,
no deploy configuration, and no player-visible promise the code does not keep —
the one sentence this change puts in front of a player is a refusal, and the
refusal is real.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), 0053 was the stated next free number on `main` at the time
of writing, and the stated next-free number is a ceiling rather than a
reservation — an unmerged branch cannot be seen from
[the index](./README.md). If 0053 collides, renumber this file, its row in
`docs/adr/README.md`, and every citation of it in `src/`, `tests/` and `docs/`
(`grep -rn "0053" src/ tests/ docs/`).

- Related: issues #456, #442, #457, #409;
  [ADR 0025](./0025-guard-hiring-surface.md),
  [ADR 0036](./0036-a-derived-default-security-sector.md),
  [ADR 0048](./0048-what-a-sectors-occupants-are.md),
  [`docs/SECURITY.md`](../SECURITY.md), [`docs/INCIDENTS.md`](../INCIDENTS.md)

## Context

### What the code did, verified on `bb3a01e`

`HireStaff` refused exactly one thing — an id the staff-role registry does not
declare. `StaffHireRefusalReason` was
`'unknown-role' | 'insufficient-funds' | 'roster-full'`
(`src/simulation/staff/hiring.ts:61` on `main`), and there was no department
check anywhere in the command. `GuardRoster.hire(staffRoleId: string, …)`
(`src/simulation/security/guard-roster.ts:75`) stored the id, and
`grep -n staffRoleId src/simulation/security/` found it read back in exactly one
other place — `deployment-system.ts:50` — and there only to resolve a
`RouteContext` for pathing permissions.

Three systems claimed staff for duty, all from the same unfiltered pool:

- `DeploymentSystem.assignUnassignedGuards` → `GuardRoster.unassignedGuardIds()`
- `IncidentResponseSystem.claimableResponders` → the same
- `SearchSystem.assignQueuedOrders` → the same

So the four `department` values in `src/content/staff-role-catalog.ts` decided
nothing at all. Every claim in issue #456 re-verified.

### What the issue did not say, and it changes the framing

**The rule already existed. It was in the renderer.**
`HIREABLE_STAFF_ROLE_IDS` in `src/main.ts` is `['staff-role.guard']`, and the
comment above it stated the whole situation in terms:

> `DeploymentSystem`, `PatrolSystem`, `IncidentResponseSystem` and
> `SearchSystem` all claim staff from `GuardRoster.unassignedGuardIds()` with no
> filter on role, so a nurse hired into that roster is sent to a patrol post by
> the next scheduled deployment tick. Offering the other seven would ship seven
> ways to put the wrong person on a wall. The *simulation* is deliberately given
> no whitelist … it grows the day a system reads a department or a permission.

That matters three ways. It means **a player could not reach the defect
today** — the Staff panel offers one role and there is no other producer of
`HireStaff` in `src/` — so #456's headline, *"a nurse, a cook and an
administrator are all riot police"*, is a true statement about the simulation
kernel and not about the shipped game. It means the gate that does exist sits in
the composition root, which is a gameplay rule living in the renderer and
therefore against `AGENTS.md` boundary 1 (*"Rendering is not simulation"*). And
it means the work is not "add a rule" but "move the rule to where it can be
enforced", after which the panel's whitelist is a content judgement rather than
a safety rail.

The two reachable ways to hit it are a **save written before this change** and a
**future producer** — a scenario, a second panel, a queued command in a restored
session. Both are real, and the first is the one no refusal can reach backwards
into.

### `requiredGuardCount` scaling does not ride here, because it already landed

Issue #442 scoped *"whether a sector's `requiredGuardCount` should scale with
population"* to this issue or its own, and #456 repeated it. **That framing
predates [ADR 0048](./0048-what-a-sectors-occupants-are.md), which answered it
yes.** `resolveOccupancyScaledGuardCount(scheduled, occupants)` in
`src/simulation/security/sector-staffing.ts` returns
`max(scheduled, ceil(occupants / 8))`, applied in
`DeploymentSystem.requiredGuardCountFor` — the single place a requirement is
read. Nothing is left of that half to decide, and this document does not reopen
it.

### The measurement

The fixture is the prison
`tests/integration/security-default-sector.test.ts` builds: one furnished cell,
one bed, three admissions, seed `0x456`. With nobody hired it riots at tick
4,000.

Five hires of `administrator`, `nurse`, `kitchen-staff`, `doctor` and `warden`
through the real command path, driven to 30,000 ticks:

| | before | after |
| --- | --- | --- |
| refusals | **0** | 5, all `hire.no-duty-for-role` |
| spent | 880 minor units | **0** |
| roster | 5, entity 0 `on-post` | empty |
| coverage | `required: 1, assigned: 1, shortage: 0` | `required: 1, assigned: 0, shortage: 1` |
| riots | 4, first at tick 11,100 | 6, first at tick 4,000 |
| outcome | **all 4 resolved, 16 responders dispatched, 0 injured** | all 6 lapsed, 0 dispatched, 18 injured |

The same measurement with the five put on the roster directly — which is what a
save written before this change restores to — gives the same six lapsed riots
and eighteen injuries, with all five staff `unassigned`.

**The "before" column is the finding, and it is worse than the issue's
headline.** A prison whose entire security force is a doctor, a nurse and a cook
did not merely stand a post: it delayed its first riot by 7,100 ticks and then
**contained every single one with nobody hurt**. The wrong-role hire was a fully
effective guard, and it was also cheaper in outcomes than the correct play,
because `staffingShortfall` is `shortage / required` and one body takes the term
to zero whoever the body is.

### What comparable management sims do, and the axis that decides it

Two families, and they are not two tastes about the same problem.

**Typed hires from an infinite pool.** In Prison Architect, patrols *"can have
guards, armed guards or dog handlers assigned"* while cooks are assigned to
kitchens and janitors to cleaning priorities — the deployment screen is
organised by staff type, and a cook is not a partial guard. Two Point Hospital
is the same shape one level down: a room states the staff type it needs, and
qualifications modulate performance *within* a type rather than admitting
another one. In both, staff are hired instantly from an unlimited supply at a
per-type price.

**Scarce individuals with alternative uses.** In RimWorld every pawn has skills
governing speed and success at most jobs, and *"dedicating a pawn to
specialization yields efficiency benefits compared to spreading their work
across multiple tasks"* — the interesting decision is not *can* this colonist
shoot, it is what they stop doing while they do. Dwarf Fortress's militia and
Football Manager's positional familiarity are the same mechanic: a scalar that
prices a *reassignment*.

The axis is **whether the staff member has an alternative use**. A scalar is
interesting exactly when assigning someone here means not having them there. It
is decoration when the roster is minted on demand at a price per type, because
then the player simply buys the right type.

Lockstate is squarely in the first family. `StaffHiringService.hire` mints a new
entity from an unbounded supply at `wageBand.minPerDay`, and there is no
assignment surface at all: no command in `src/simulation/protocol/commands.ts`
puts a *named* staff member on a post, and `DeploymentSystem` fills posts itself
from the lowest ids in the pool.

## Decision

### 1. A staff role may hold a security post when its department says so, and the department is authored data

`POST_ELIGIBLE_STAFF_DEPARTMENTS` in `src/content/staff-role-catalog.ts` is
`['security']`. `isPostEligibleStaffRole(role)` beside it is the predicate.
`staff-role.guard` and `staff-role.security-chief` are the two roles of eight
that answer true.

**In the catalogue, not in a system.** It is a statement about that file's own
vocabulary — which of the four declared departments is a *duty* department — and
`AGENTS.md` boundary 6 puts content definitions in data modules rather than in
condition chains inside a system. Adding a duty department is then a one-line
content edit with no code change, which is the property `DEFAULT_SECTOR_RISK_POLICY`
and `DEFAULT_SECTOR_PRISONERS_PER_GUARD` already have.

**Why the department and not a new authored field.** A `canHoldSecurityPost`
boolean per role is more expressive: it would let a `security` role be declared
post-ineligible — a CCTV operator, a records officer. No role in the catalogue
is that today. The field would bump `STAFF_ROLE_CATALOG_SCHEMA_VERSION` and
oblige every externally authored entry to carry it, in service of a distinction
nothing needs, and the department is already validated by a zod enum and already
means what the rule needs it to mean. The day a `security` role should not be
sent to a riot is the day to add it.

**Why not `permissions`.** `staff-role.warden` holds `'security-wing'`, so that
rule makes the warden a riot responder. And the field is documented in the
catalogue as `RouteContext.permissions` — where a role may *walk*, not what it
may *do*.

**Why not `baseSecurityClearance`.** It orders the roles
`warden 10 > security-chief 8 > administrator 6 = doctor 6 > guard 5`, which
ranks the administrator above the guard at guarding. Clearance is access, not
competence, and the catalogue says so.

### 2. A hire the prison has no duty for is refused, and the player is told why

`StaffHiringService.hire` gains a fourth refusal, `'no-duty-for-role'`, mapped to
the wire id `hire.no-duty-for-role` and to the authored sentence

> Nobody was hired — only security staff can hold a post, and this prison has no
> other work for that role.

It is a refusal rather than a hire that quietly never gets used, and the reason
is the money. `StaffHiringService` is the only way anybody reaches `GuardRoster`;
**nothing in `src/` removes a staff member from it** (`GuardReleaseService`
unassigns, it does not dismiss); and `PayrollSystem` bills every id on the roster
at every in-game day boundary. So a hire nothing can claim is an unrecoverable
standing cost for no effect, and no channel in the game would ever tell the
player. A refusal has one — `RefusalLog` → `simulation/status-counts` →
`src/ui/simulation-alerts.ts`, a resolved message key and never a raw dotted id,
which is what issue #409 asks of a refusal the player did not expect.

It is placed second in `hire`, immediately after the role resolves and before any
money moves, so the existing correctness argument in that method — *"there is no
ordering of these in which money leaves and nobody arrives"* — covers it with no
new reasoning.

`hire.no-duty-for-role` is namespaced against `hire.unknown-role` deliberately.
They are two different facts about a role id — the prison has never heard of it,
versus it has and there is nothing for it to do — and a player told the wrong one
goes looking for a spelling mistake.

### 3. The claim filter is one function, and `GuardRoster` is not narrowed

`claimableGuardIds(source, isEligible?)` in
`src/simulation/security/post-eligibility.ts` is what `DeploymentSystem`,
`IncidentResponseSystem` and `SearchSystem` each call where they used to call
`GuardRoster.unassignedGuardIds()`. One function for the same reason
[ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 3 gives for
`requiredGuardCountFor`: one place decides, so what deployment enforces, what a
response claims and what `getCoverageReport` publishes cannot disagree.

**`GuardRoster.unassignedGuardIds()` is deliberately left alone.** It is a store
query and it answers what its name says. Narrowing it would have got the same
"cannot disagree" property at the cost of making `projectStaff`'s
`totals.unassigned` — a headcount of that exact phase — quietly mean something
else. A prison whose roster holds a nurse and no guard should read *three staff,
three of them unassigned, and the sector unguarded*: two true facts, not one
narrowed one. The coverage readout ADR 0048 built therefore agrees with the new
rule for free, because `assigned` counts staff with a sector and an ineligible
staff member can never be given one.

**An id the registry does not declare is ineligible rather than an error.**
`resolveStaffRouteContext` throws for an unknown id because it has no
`RouteContext` to return; this has an answer and the safe one is *no*. The
reachable case is a save written against a catalogue that later dropped a role,
and refusing to post that staff member reads to a player as an uncovered sector,
which is true.

### 4. Nothing is added for the other six roles

They are not given jobs, they are not given a competence scalar, and they are not
made unhireable-and-invisible. They stay in the catalogue, they stay declared,
their department now decides something, and hiring one is refused with a sentence
that says why. Issue #456 put jobs for them out of scope and this document keeps
them there.

## What was rejected

### A competence scalar — anyone may stand a post, at reduced effectiveness

This is the option the issue calls *"more interesting"*, and it is the one I
expected to take. It loses on two independent grounds, and the first is
arithmetic rather than taste.

**It is a strictly dominated choice at the prices the catalogue authors.** For a
scalar to create a decision, hiring a non-guard for a post has to be *rational*
under some circumstance. The wage bands say it never is:

| role | `minPerDay` | vs a guard |
| --- | --- | --- |
| kitchen-staff | 60 | 0.75× |
| maintenance-worker | 70 | 0.88× |
| **guard** | **80** | — |
| nurse | 120 | 1.5× |
| administrator | 150 | 1.9× |
| security-chief | 200 | 2.5× |
| doctor | 250 | 3.1× |
| warden | 300 | 3.75× |

Five of the seven other roles cost *more* than a guard, so a scalar below 1 makes
them worse on both axes and nobody ever picks them. The two that are cheaper are
cheaper by 25% and 12%, so the scalar would have to be tuned above 0.75 and 0.88
respectively for them to be worth buying — at which point "a cook is four-fifths
of a riot policeman" is the game's position, and the department has stopped
meaning anything again. There is no value of the scalar that makes the choice
both interesting and defensible. The "desperate warden on the wall" the issue
imagines is not a desperate option; it is a 3.75× more expensive way to be worse.

**And the interesting version of it needs a job the other roles do not have.**
The scenario where a scalar is genuinely good is *"a riot has opened, my guards
are dead or busy, do I pull the nurses off the infirmary?"* — the opportunity
cost is the whole of the drama, and it is exactly the axis the research above
isolates. Lockstate has no infirmary duty, no kitchen duty and no maintenance
duty, so a nurse pulled onto the wall is pulled off *nothing*. There is no cost
to weigh and therefore no decision, only a worse number.

So the scalar is the right answer later and the wrong answer now, and this
document says when: **on the day any non-security role has a duty of its own.**
That is the same move ADR 0048 decision 1 makes about the nearest-post partition
— *"It is the right answer on the day a player can draw a sector, and it should
be revisited then"* — and it is recorded here for the same reason.

### A refusal the player can override, with the consequence visible

There is nothing to override. The player's only gesture is *hire*; no command in
`src/simulation/protocol/commands.ts` assigns a named staff member to a post,
and `DeploymentSystem.assignUnassignedGuards` picks from the pool itself. So the
override could only be a confirmation on a purchase — "hire this nurse anyway" —
which is a dialog, not a mechanic, and it would put the player one press away
from the permanent unrecoverable wage decision 2 exists to prevent.

It becomes a real option the day a player can place a specific person on a
specific post. It is not one while deployment is automatic.

### A whitelist of role *ids* rather than departments

`['staff-role.guard', 'staff-role.security-chief']` is shorter and needs no
predicate. It also has to be edited on every new role, silently omits one that is
forgotten, and reintroduces exactly the `HIREABLE_STAFF_ROLE_IDS` shape this
change is moving *out* of the composition root. A ninth role authored in the
security department should be eligible on the day it is authored.

## Consequences

### What a player sees

- Hiring anything but a guard is refused with a sentence, and no money moves.
  Today no panel offers anything but a guard, so this is reachable only from a
  save, a scenario or a future producer — and the sentence is what makes the
  future producer safe to write.
- A save that already carries a nurse on the roster now reports the shortage that
  prison honestly has. The Staff panel's coverage block goes from *Covered* to
  *Unguarded*, and its guard-shortage line names the hires that clear it. That is
  a **visible change to an existing save**, and it is the correct one: the prison
  was never guarded.
- The staff headcount does not change. Those staff are still hired, still paid
  and still listed; they are simply not guards.

### What it does not change

- **No persisted state, no `SAVE_SCHEMA_VERSION` bump, no migration, nothing in
  `supabase/migrations/`.** The rule is derived at read time from a
  `staffRoleId` the save already carries.
- **No RNG and no new stream.** Every answer is a pure function of content and
  roster state, so ADR 0038 decision 2's absent-stream rule is not engaged.
- **No iteration order moves.** `Array.prototype.filter` preserves order and
  `unassignedGuardIds()` is already ascending entity id, so the claimable pool is
  ascending entity id — the ordering all three claimants document relying on.
  Shown rather than asserted: two 30,000-tick runs of the measured prison
  produce byte-identical `hashFullRuntime` fingerprints —
  `62f2_4c82_5264_9c0b` twice through the command path and
  `425b_caea_c88e_eec1` twice through the roster, with the underscores added so
  that a fingerprint is not mistaken for a commit sha by
  `tests/foundation/documentation-commit-citation-contract.test.ts`.
- **`HIREABLE_STAFF_ROLE_IDS` is untouched.** The Staff panel still offers the
  guard alone. What changed is why: it is now a pricing and content judgement
  (#29's) rather than the only thing standing between a nurse and a wall.
  `staff-role.security-chief` is post-eligible, costs 200 a day against the
  guard's 80 and buys nothing the guard does not, so offering it is a decision
  about the shop rather than about safety.

### What it costs

One registry `Map` lookup per unassigned staff member per claim, on a collection
`docs/SECURITY.md` sizes at tens to low hundreds. It is a strictly smaller pass
than the `allGuardIds()` sort `unassignedGuardIds()` already performs to build
its own input, and it runs on the same cadences those three systems already run
on.

### What it costs elsewhere

- `tests/unit/simulation-refusals.test.ts` gains the fourth `hire.*` row; the
  exhaustive `Record` in `src/simulation/refusals/refusal-log.ts` is what forced
  it.
- `tests/foundation/unconsumed-content-contract.test.ts`'s justification for
  `staff-role.administrator` said this id *"needs a system that reads its
  department"*. One exists now, so the entry is rewritten rather than deleted:
  the gate measures single-quoted **id** literals, and a rule that reads a field
  leaves none, which is the honest limit of that measure.
- `docs/SECURITY.md` gains a "Who may stand a post" section; `docs/INCIDENTS.md`
  and `docs/CONTRABAND.md` each gain one sentence, because both described the
  claim pool as `unassignedGuardIds()` and it is no longer that.

### And the honest gap

**Six of eight roles are now legibly useless instead of illegibly harmful, and
that is an improvement rather than a solution.** A player who reads the catalogue
through the Staff panel sees eight departments' worth of a prison and can staff
one of them. Before this change the other six were hireable and secretly
interchangeable; after it they are refused with a reason. Neither is a prison
that needs a kitchen. The work that fixes it is a duty for `operations` and one
for `medical`, and each is its own issue.

This also **unblocks #457** rather than answering it. That issue asks whether the
`notified → responding → resolved` pipeline completes in a prison a player can
build, and warns that *"if a nurse can hold the post that dispatches responders,
'the pipeline completed' may be true and meaningless"*. It cannot any more: the
control run in `tests/integration/security-post-eligibility.test.ts` reaches
`resolved` with `respondersDispatched: 4` from five real `HireStaff` commands for
guards, and the same five as nurses dispatch nobody and let the riot lapse. #457
still owns the full-run numbers.

## Open questions

1. **What duty does `operations` get first, and does it change this list?** A
   maintenance worker repairing a broken utility node and a cook staffing a
   canteen are the two obvious ones, and neither is a security duty — so both
   would be a *second* eligibility list rather than an addition to this one. The
   shape of the second list is the real question: one list per duty, or a
   duty→departments map. Not decided here, because one list is not evidence for
   either shape.
2. **When the scalar arrives, does it replace this rule or sit under it?** The
   two readings differ: *any role may be claimed, at a competence weight, and
   `security` is 1.0* replaces it, while *only eligible roles may be claimed, and
   the eligible ones differ in competence* keeps it and grades within it. The
   second is what Two Point Hospital does and the first is what RimWorld does.
   The measurement that decides it is whether a player ever *wants* to send the
   wrong person, which needs the wrong person to have something else to do.
3. **Should `security-chief` be offered in the Staff panel?** It is eligible and
   it is not offered. Today it would be a strictly worse guard at 2.5× the price,
   which is an argument for giving the role something a guard cannot do
   (`'armory'` is the permission it uniquely holds) rather than for listing it.
4. **Does a released or reassigned staff member's eligibility need re-checking
   on restore?** Today no: `claimableGuardIds` re-derives on every claim, so a
   catalogue change between save and load takes effect on the next scheduled
   tick. A persisted eligibility flag would not have that property, which is a
   second reason not to add one.

## What would change my mind

**The weakest claim in this document is that the competence scalar is dominated,
because it rests entirely on `wageBand.minPerDay` — eight numbers that
`src/content/staff-role-catalog.ts` calls *"a wage/skill hook, not a real
economy"* and that issue #29 owns.** The argument is arithmetic and the
arithmetic is right, but it is arithmetic over placeholder content. If #29 reprices
the catalogue so that a role with no other duty is materially cheaper than a
guard — say a cook at 30 against a guard at 80 — then "two cooks at 0.5 for the
price of three-quarters of a guard" becomes a real trade and decision 1 should be
revisited immediately. **The structural argument does not depend on the prices
and is the one worth defending:** a scalar prices a reassignment, and there is
nothing to reassign from.

Two smaller things would also move me:

- **A duty for any non-security role landing before this is accepted.** It
  changes the answer, not the document — the scalar's precondition would be met
  and question 2 would need answering first.
- **An owner ruling that the six other roles should be hireable now, useless or
  not**, because a management game should let you build the organisation before
  the simulation rewards it. That is a defensible product position and it is the
  opposite of decision 2. If it is taken, the honest form is a hire that succeeds
  with a warning rather than a silent one, and the warning has no channel today —
  `RefusalLog` carries refusals, not caveats on accepted commands.
