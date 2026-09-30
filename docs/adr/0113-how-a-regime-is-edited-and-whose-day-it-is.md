# ADR 0113: How a regime is edited, and whose day it is

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0113, this file, its row and
> every citation of it get renumbered without argument, exactly as ADRs 0110,
> 0111 and 0112 each pre-committed.
>
> **The arithmetic, performed rather than trusted.** `docs/adr/README.md`'s own
> **Next free number** line reads 0113. Swept 2026-09-13 in the working
> worktree: `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`
> (**326 heads**), then `git ls-tree --name-only <head> -- docs/adr/` read out
> of every one of them. The highest four-digit prefix on any head is **0112**,
> and nothing at 0113 or above appears on any. 0113 is free.

## Status

**Accepted in full by the owner on 2026-09-14**, from a clickable option
labelled *"Przyjmij w całości, budujemy pierwszy plaster"* ("Accept it in full,
we build the first slice"). **The `Proposed` line below is kept rather than
replaced**, per `docs/AGENT_WORKFLOW.md` §4, because what this document proposed
before it was answered is what a later reader needs in order to judge the
answer.

**The provenance is the weaker kind and is disclosed as such**, exactly as the
2026-09-08, 2026-09-09 and 2026-09-10 entries in `AGENTS.md` disclose their own:
the label of an option this session wrote and the owner chose, not a sentence
they typed. The scope — per-group schedules rather than one global day — was
ruled the same way on 2026-09-13 and is recorded below.

**What the acceptance covers:** `classificationGroupId` as the axis, the
V5→V6 save section, the `EditRegimeBlock` command with the refusals this
document names, no new `PROJECTION_IDS` member, and the first slice as scoped
here. Implementation is tracked in
[#1167](https://github.com/woogitsu/lockstate/issues/1167).

**What the acceptance does NOT settle, and this document said so before it was
accepted:** the tick cost is **argued rather than measured**. The argument is
that the first slice keeps exactly the two groups that exist today, so the
per-group lookup is unchanged — but no benchmark was run, and this document
names `regime.production.schedule-lookup` as the scenario that would produce a
number. **The owner was offered a choice that made measuring it a precondition
and chose to build first**, so the measurement is owed during implementation
rather than before it, and an implementing agent that finds the cost material is
reporting a finding rather than contradicting a ruling.

---

**Proposed, 2026-09-13. Not self-approved.** *(The state of this document before
the acceptance above.)* The scope this document works
inside was settled by the owner, not by this document: the owner ruled, from a
clickable option this session wrote, that the Day-plan section must genuinely
edit the regime and that the model is per-group schedules rather than one
global day. That is recorded here as the *weaker* kind of provenance —
exactly as `AGENTS.md`'s 2026-09-08, -09 and -10 releases, and ADR 0112's four
non-verbatim rulings, disclose their own — because it is the label of an
option this session wrote and the owner chose, not a sentence they typed:

> **Ruled 2026-09-13:** *"Szerzej: własne harmonogramy per grupa osadzonych"*
> ("Wider: separate schedules per prisoner group.")

That ruling settles the **scope**: genuine editing, and a per-group model.
Everything below — which axis "group" names, where the edit lives in the
snapshot, the command's shape and refusals, and the smallest first slice — is
this document's proposal and the owner's to accept or reject. Nothing here has
been built; no code under `src/` has changed for this document.

## Context

### The finding that forced the ruling, verified rather than repeated

The stage 0 inventory — filed under `docs/research/` as issue #1156's
2026-09-13 walk of every HUD surface and where the five sections put it, in
progress in a sibling worktree at the time this document was drafted and not
yet present in this one, so it is cited by issue number rather than by a path
this checkout can resolve — reports that none of the simulation's commands
edits a regime.
Checked directly against `src/simulation/protocol/commands.ts` rather than
taken on the inventory's word: `simulationCommandSchema`'s discriminated union
(`commands.ts:731-748`) names exactly these seventeen members —

```
PlaceBuildOrder, CancelBuildOrder, ZoneRoom, UnzoneRoom, PurchaseMaterials,
CancelMaterialPurchase, SellMaterials, AdmitPrisoner, HireStaff, PlaceObject,
RemoveObject, RemoveWall, ReleaseGuardAssignment, DismissStaff, DismissAlert,
Undo, Redo
```

— and not one of the seventeen mentions a regime, a schedule, a classification
group or a day. `src/main.ts` is the only module that constructs any of these
seventeen: `grep -n "type: '" src/main.ts | sed -E "s/.*type: '([A-Za-z]+)'.*/\1/" | sort -u`
returns exactly this same set of seventeen literals, which confirms the
inventory's second half too. The inventory's claim holds.

### What "a regime" is today, and why editing it is a bigger question than it looks

`src/simulation/prisoners/regime.ts` declares `GENERAL_POPULATION_REGIME` and
`HIGH_RISK_REGIME` (`:104` and `:120`) as **hardcoded module-level constants**,
each an array of `RegimeBlock`s tiling `DAY_LENGTH_TICKS` (2,400) exactly once
(`assertGaplessSchedule`, `:40`). `DEFAULT_REGIME_SCHEDULES` (`:130`) is the
two of them in a fixed array, and it is asserted gapless at module load —
before any session, any save, any command exists.

That array reaches the running session through one path only. Both consumers
that need it — `PrisonerOperationsRuntime` (`prisoner-operations-runtime.ts:140,
455`) and `projectStatusStrip`'s source
(`status-strip-projection.ts:164, 807`) — declare an **optional constructor
option** `regimeSchedules?: readonly RegimeSchedule[]` that defaults to
`DEFAULT_REGIME_SCHEDULES` when omitted. Checked directly: `grep -rn
"DEFAULT_REGIME_SCHEDULES\|regimeSchedules" src/simulation/runtime/new-session.ts
src/simulation/runtime/restore-session.ts src/main.ts` returns **nothing** — no
production call site ever supplies a different value. So every session that
exists today, new or restored, runs the two hardcoded schedules, and
**`regimeSchedules` does not appear anywhere in `src/persistence/`** (`grep -rn
"regimeSchedules\|RegimeSchedule\b" src/persistence/*.ts` is empty). A regime
is not merely "not editable by command" — it is not part of the save at all.
Editing it is therefore not one command away from what exists; it is a new
piece of persisted state plus the command that writes it.

## 1. What a group is

### The axis that already exists, and why it is total

`CLASSIFICATION_GROUP_IDS = ['general-population', 'high-risk']`
(`src/simulation/prisoners/components.ts:5`) is a closed, two-member catalogue.
Every prisoner carries exactly one member of it, as a `Uint8Array` index
(`classificationGroupIndex`, `components.ts:88`), written by
`classificationGroupIdForTier` (`classification.ts:58-60`) — a **total**
function over `RiskTier` (`0 | 1 | 2 | 3`): `riskTier >= 3 ? 'high-risk' :
'general-population'`. `classifyPrisoner` (intake) and `reviewClassification`
(periodic review) are the only two writers of that index, and both call
`classificationGroupIdForTier` before returning. There is no code path that
leaves a prisoner's classification group unset, and none that could put a
prisoner in two — the value is a single `Uint8Array` slot, not a set.

This directly answers the question the brief poses about a prisoner who
belongs to none or to two: **under this axis, no regime read can see either
case.** "In two" is unreachable outright — the value is one `Uint8Array` slot.

**"In none" needs a sharper sentence than the one this document first carried,
and the difference is worth the paragraph.** That sentence claimed no code path
leaves the group unset, on the strength of `classificationGroupIdForTier` being
total over `RiskTier`. Total it is — `classification.ts:58-60` is a ternary over
a closed `0|1|2|3` domain — but classification runs at the `classification`
intake stage, and a prisoner in `queued` or `reception` has not reached it. What
their slot holds until then is the `Uint8Array`'s default `0`, which decodes to
`general-population`: **a default array value that happens to be a legal id, not
a decision anyone took.**

What makes that harmless is one line further out rather than the totality
argument: `ACTION_ELIGIBLE_INTAKE_STAGE_INDICES` (`action-system.ts:74-75`)
admits only `accommodation-assignment` and `completed`, so `findRegimeSchedule`
is never called for a prisoner still queued or in reception. **The conclusion
holds and its reason moved**, which is worth recording because the two reasons
fail differently: a stage gate is a line somebody could widen, and a totality
argument is not. If a future change lets an earlier stage take actions, the
default-zero slot becomes a silent assignment to `general-population`, and this
paragraph is the one to re-read.

`resolveActiveRegimeBlock`, `findRegimeSchedule` and `ActionSystem`'s two
regime reads (`action-system.ts:1306`, `:1353`) already key off this id. This
is not a new concept the ADR is inventing to justify a cheap answer — it is
the concept the running code already uses to decide whose schedule a prisoner
follows, and `HudRegimeBlockViewModel`'s `classificationGroupId` field
(`simulation-regime.ts`) already carries it out to the panel that shows the
regime blocks. **Recommendation: the group in "per-group schedules" is
`classificationGroupId`.** The edit surface is the two rows the schedule
already has, not a new partition.

### Two alternatives considered and rejected, with their costs

**Security sector ("wing").** `SecuritySectorDefinition`
(`src/simulation/security/sector.ts:48`) has no room-instance membership list
and no notion of "the prisoners inside it" beyond what
`SectorOccupantResolver` computes at read time from room residency
(`sector-occupancy.ts`). More decisively, ADR 0110 — read and verified rather
than taken on trust — established that **exactly one security sector exists in
any session a player can start**. Its §4 heading is
*"In every session a player can start there is exactly one sector, and the
repository already says so twice"*, and the sentence under it says the finding
is *"evidenced four ways rather than asserted"*, above a `VERIFIED, read:` list;
its evidence table records the run that produced it as *"two sites, neither
player-driven; zero sector commands"*.

> **The sentence quoted here in this document's first draft did not exist in
> ADR 0110.** It read *"VERIFIED four ways that exactly one sector exists in
> any session a player can start"*, which is two of the three fragments above
> stitched into one string and presented inside quotation marks. The claim it
> carried is true and ADR 0110 does support it; the quotation was manufactured.
> It is corrected in place and recorded here rather than silently replaced,
> because a fabricated quotation is the defect this repository is least able to
> detect by grep and most damaged by: `docs/AGENT_WORKFLOW.md` §4 says to cite
> prose by quoting it precisely because a quotation is the durable citation,
> and a quotation that was assembled is worse than the paraphrase it was
> dressed up to beat. A
"per-wing" schedule keyed to sector today would be a schedule of exactly one
row — it does not give the owner two schedules, it gives them the one they
just rejected, with sector-shaped plumbing bolted underneath it for a
multiplicity the game does not yet have.

**Accommodation / room assignment.** `PrisonerColdState` carries an
accommodation assignment, but it is written at the `accommodation-assignment`
intake stage, not at admission — a prisoner in an earlier intake stage has
none. Keying a schedule to accommodation would resurrect exactly the
"belongs to none" case classification's totality avoids, and would need a
second answer for it (which schedule governs a prisoner still in reception?)
that classification never has to give.

### What is deliberately *not* proposed here

Adding a third group (a natural next step: `RiskTier` already has an unused
middle value — `ClassificationEarlyWarningSystem`'s `EARLY_WARNING_TIER_CEILING`
names a `Medium` tier in its own comments, `classification.ts:221-249`, that
`classificationGroupIdForTier` still folds into `general-population`) is out of
scope for this ADR. Widening `CLASSIFICATION_GROUP_IDS` touches the eight files
that reference it (`components.ts`, `classification.ts`, `intake-system.ts`,
`prisoner-projection.ts`, `default-gangs.ts`, `simulation-message-keys.ts`,
`src/ui/hud/projection.ts`, `simulation-regime.ts`) and is a content/balance
decision (a new authored schedule, a new message key completeness row) this
ADR's scope does not ask the owner to make. What is proposed is **making the
two existing rows editable**, which touches none of those eight files' shape —
only what schedule is looked up under each existing id.

## 2. Where the schedule lives in the snapshot, and what it costs

### The shape

`SAVE_SCHEMA_VERSION` was 5 at this decision (`src/persistence/save-schema.ts:41`; now 8). This is a
new **required** section — not an optional field folded into an existing one
under ADR 0038 §1's "no version bump needed" rule, because absence here is
genuinely ambiguous: an old save has no recorded schedule at all, and there is
no single meaning "absent" could carry (unlike `masterSeed`'s "absent means
0", which holds because production could not yet write anything else). A
schedule that does not exist has to be manufactured by a migration, which is
exactly `docs/PERSISTENCE.md`'s line for when a version bump is required
rather than optional. **V5 → V6.**

Proposed payload addition, under `payload.simulation` beside the existing
`prisoners`/`operations`/`security` siblings:

```
regimeSchedules: [
  {
    classificationGroupId: string,   // one of CLASSIFICATION_GROUP_IDS
    blocks: [
      { startTickOfDay: number, endTickOfDay: number, allowedCategories: ActionCategory[] },
      ...
    ],
  },
  ...
],
```

Reusing `RegimeSchedule`'s own shape (`regime.ts:14-24`) rather than inventing
a parallel one — the same discipline `docs/PERSISTENCE.md` describes for
`payload` generally ("the existing per-subsystem snapshot contracts...
re-validated at the save boundary with Zod, not a new shape invented for this
issue"). The Zod schema is `.strict()` on both the schedule and block objects,
matching every other section; `allowedCategories` is `z.array(z.enum(ACTION_CATEGORIES)).min(1)`,
which refuses an unauthored category at decode time the same way
`buildOrderSchema`'s `definitionId` refuses an empty string — a shape problem,
not a business-rule refusal.

### What an old save migrates into

**Both existing groups' already-existing hardcoded schedules, verbatim, with
no invention and no ambiguity.** This is the answer to "every existing prison
has one implicit schedule, and the migration has to say which group owns it" —
and the honest correction to that framing is that there is not *one* implicit
schedule to assign an owner to. There are already **two**, one per existing
`classificationGroupId`, and every save written before this ADR was produced
by a session running exactly `GENERAL_POPULATION_REGIME` under
`'general-population'` and `HIGH_RISK_REGIME` under `'high-risk'` — because
that is the only pair `DEFAULT_REGIME_SCHEDULES` has ever been and the only
one any production call site has ever passed. `migrateSaveEnvelopeV5ToV6`
therefore writes:

```
regimeSchedules: [
  { classificationGroupId: 'general-population', blocks: GENERAL_POPULATION_REGIME.blocks },
  { classificationGroupId: 'high-risk',            blocks: HIGH_RISK_REGIME.blocks },
]
```

unconditionally, for every V5 input, mirroring the shape
`migrateSaveEnvelopeV4ToV5` already uses (`save-migrations.ts:336-361`):
destructure the old envelope, splice in the new section, recompute the
checksum over the full migrated payload
(`computeSaveChecksum(migratedPayload as JsonValue)`), stamp
`saveSchemaVersion: 6`. No field is guessed and no prisoner's history is
touched — this migration changes what future ticks read, not what already
happened. A new test under `tests/migrations/` (not yet written — this ADR
proposes it, it names no existing file) is what this needs, built the same
way `save-v4-to-v5.test.ts` is: decode a real V5 fixture,
migrate, and assert the two rows equal `GENERAL_POPULATION_REGIME.blocks` and
`HIGH_RISK_REGIME.blocks` by value.

### Cost

Two `RegimeSchedule` rows, ten blocks plus three blocks, each block three
small fields (two integers, a short string array of at most seven enum
members). Serialized, this is on the order of a few hundred bytes of JSON —
negligible against the payload sections `docs/PERSISTENCE.md`'s table already
lists (`prisoners`, `operations`, `security`, `contraband`, `incidents`). The
real cost of this decision is not the bytes; it is that a schedule now has to
be read from **the save** rather than from a build-time constant everywhere it
is consulted, which is exactly what section 3 and section 4 below have to get
right.

## 3. The command, in the protocol's own vocabulary

### One command, editing one block at a time

Adding `EditRegimeBlock` to `simulationCommandSchema`'s discriminated union
(`commands.ts:731`), following the same shape every command there already
uses — a `.strict()` Zod object, an `orderId`/similar identifier only where the
command can be queued and later cancelled (this one cannot be: like
`ZoneRoom`, it either applies at its tick or is refused, with no pending state
to cancel):

```ts
export const editRegimeBlockSchema = z.object({
  type: z.literal('EditRegimeBlock'),
  classificationGroupId: identifierSchema,
  startTickOfDay: z.number().int().min(0).max(DAY_LENGTH_TICKS - 1),
  allowedCategories: z.array(z.enum(ACTION_CATEGORIES)).min(1),
});
```

`startTickOfDay` identifies *which* block within the named group's schedule is
being edited — the same tick that block's own `startTickOfDay` carries — rather
than an index into an array, because an index is not stable across a save/load
round trip in the way a tick boundary is, and two agents editing the same
prison never have to agree on array order to agree on which block they mean.

The command only ever changes a block's `allowedCategories`; it never moves a
boundary. That is deliberate: `assertGaplessSchedule` (`regime.ts:40-52`)
proves gaplessness from the block *boundaries*, and a command that could move
a `startTickOfDay`/`endTickOfDay` would have to re-run that proof over the
whole schedule and reject a partial edit that broke it mid-flight — solvable,
but not the smallest slice, and section 7 returns to why leaving it out is not
a trap.

### Refusals, and the rule they answer to

`AGENTS.md`'s article 5 — a refusal must never read as a success — is
`REFUSAL_REASONS`'s own discipline (`protocol/types.ts:1350-1396`): every
command names its own refusal codes in `<command-prefix>.<reason>` form
(`zone.overlaps-existing-room`, `hire.unknown-role`, `dismiss.unknown-staff`).
Two refusals cover this command's failure modes, and no more are needed
because the schema already refuses everything shape-related:

- **`edit-regime-block.unknown-group`** — `classificationGroupId` decodes as
  a non-empty string (`identifierSchema`), but does not name a group the
  session actually has a schedule for. This is the existence-vs-shape split
  every other command in this file already draws (`HireStaff.staffRoleId` is
  `identifierSchema`, its catalogue miss is `hire.unknown-role`); a group id is
  not a closed enum at the schema boundary for the same reason a buildable id
  is not (`commands.ts`'s own comment on `placeBuildOrderSchema.definitionId`),
  because the session's own `regimeSchedules` array — not a build-time
  constant — is what defines which groups exist once this ADR lands.
- **`edit-regime-block.unknown-block`** — `startTickOfDay` names no block's
  own start in the named group's schedule. Silently snapping to the nearest
  block, or silently inserting a new boundary, would both be a refusal
  dressed as a success: the player asked to edit a specific block and a
  different one moved.

`allowedCategories.min(1)` at the schema is what keeps a block from becoming
one an idle prisoner can never act in at all — the same invariant ADR 0054
added `'free-association'` to guarantee (`regime.ts:64-103`), enforced here at
decode time rather than as a third refusal, because an empty array is a shape
defect (nothing in `ACTION_CATEGORIES` was named), not a business rule a
session-side check would need state to evaluate.

## 4. Determinism

**Command ordering is unaffected.** `EditRegimeBlock` is dispatched like every
other command, ordered by `(executeAtTick, sequence)` (`kernel.ts:170-236`);
it introduces no new ordering primitive.

**No new `SystemRegistration`.** The schedule is read, not stepped — nothing
in this ADR adds a per-tick system, so `Kernel`'s `(order, id)` sort
(`kernel.ts:114-117`) is untouched.

**The lookup that does need attention.** `findRegimeSchedule` (`regime.ts:194-200`)
is a linear `.find()` over `regimeSchedules`, called from `ActionSystem`'s two
regime reads per prisoner per reconsideration
(`action-system.ts:1306, 1353`). Today that array is
`DEFAULT_REGIME_SCHEDULES`, a two-element literal array whose order is fixed
by its own source (`regime.ts:130`) — not a `Map`, so
`docs/DETERMINISM.md`'s "every `Map`/`Set` enumeration... sorts or carries an
allow-list entry" rule does not currently bind it, because there is no
enumeration to order: `.find()` returns the first structural match regardless
of array order, and with two groups matched by id there is exactly one match
either way.

**What changes once the array is save-derived.** The migrated
`payload.simulation.regimeSchedules` is itself an array (not a `Map`), and it
must be *reconstructed* from the save in a fixed order rather than whatever
order `JSON.parse` or a `Map` iteration happened to produce, or two restores
of the same save could theoretically walk the array in different orders —
harmless for `.find()`'s result (which does not depend on order) but not
harmless for anything that serializes the array back out (the save
checksum, or a future projection that lists every group's schedule). The
concrete rule: **restore `regimeSchedules` in `CLASSIFICATION_GROUP_IDS`
declaration order**, the same closed-catalogue order every other
`classificationGroupId`-keyed structure in the codebase already uses
(`components.ts:5`'s array *is* the allow-list `docs/DETERMINISM.md` asks
for), rather than in whatever order the save happens to list the rows. This
costs nothing extra: `CLASSIFICATION_GROUP_IDS.map(id => saved.find(s =>
s.classificationGroupId === id))` is one linear scan at restore time, is
already how the whole prisoner-operations layer treats this catalogue, and
removes array order as a hidden fact the checksum could depend on.

## 5. Tick cost

**The kernel's own budget.** `state-machine.ts:379-380`: `const budget = 5; //
Handle up to 5 ticks per 15ms wake`, at the 50 ms `FixedStepClock` interval
`docs/DETERMINISM.md` documents. `ActionSystem`'s per-prisoner reconsideration
runs on its own schedule, not every tick (matching the 20-tick cadence
`PrisonerDischargeSystem` documents for the same reason,
`docs/PRISONER_OPERATIONS.md` §"The end of a sentence").

**What this ADR actually adds to that cost: nothing measurable, because the
group count does not change.** `findRegimeSchedule`'s linear scan is O(number
of groups); today that is O(2), and this ADR's slice 1 (section 7) keeps it at
exactly two groups — it makes the two existing rows *writable*, it does not
add a third. So the tick cost of *this* proposal, measured against the tick
cost of what runs today, is the cost of reading a schedule out of session
state that used to be a build-time constant, which is the same `.find()` over
the same two-element array either way. The number that would actually change
if the owner later widens the group axis (a third or fourth group, the "wings"
half of the ruling's own wording) is the one worth measuring ahead of that
decision, not this one.

**The scenario that would show it, named rather than asserted cheap.**
`benchmarks/scenarios/navigation-production.mjs` is the precedent to follow,
not `kernel-throughput.mjs`: the former is marked "DRIVES PRODUCTION CODE, NOT
A MODEL OF IT" and imports the real navigation modules through
`benchmarks/production-modules.mjs`, reporting a **counted-work metric**
(`SearchStats.expansions`) rather than wall-clock time, per
`docs/BENCHMARKING.md`'s standing refusal to gate on timing. A new scenario,
`regime.production.schedule-lookup`, would do the equivalent for this lookup:
import `src/simulation/prisoners/regime.ts` and `action-system.ts` through
`production-modules.mjs`, construct a `regimeSchedules` array of a swept size
(2, matching today; then 4, 8, 16 as a synthetic stress case the owner has not
asked for but that bounds the question before it is asked again), run a fixed
population through enough reconsideration cycles to make the count stable,
and report **comparisons performed inside `findRegimeSchedule`** — the exact
unit ADR 0007's `workBudgetPerTick` precedent already denominates a budget in,
per that scenario file's own justification for using expansions instead of a
clock. This scenario does not exist yet; naming it is what section 5 of the
brief asks for in place of asserting the cost is cheap, and building it is
listed as follow-up work in the Consequences section below, not claimed as
already measured here.

## 6. The projection

**No new projection id.** `hud/status-strip` (`protocol/types.ts:331`, first of
the 15-member `PROJECTION_IDS` tuple — counted directly:
`status-strip, build-queue, pending-deliveries, held-guards,
prisoner-population, prisoner-roster, prisoner-detail, room-list, room-detail,
staff, security, contraband, incidents, incident-detail, render-snapshot` is
fifteen) already carries a `regime` array with one entry **per group**, each
row already stamped with its own `classificationGroupId`
(`status-strip-projection.ts`, consumed by `regimeFromProjection`,
`simulation-regime.ts:151`). "Whose day it is showing" is therefore not a new
question this projection cannot answer — every row already answers it for its
own group, and the panel `RegimeReader.read()` builds from it
(`simulation-regime.ts`) already labels each block with
`deriveSimulationMessageKey('classification-group', group.classificationGroupId)`.

What is genuinely new is the *editing* affordance, and that is a UI-side
concern this ADR's protocol change does not have to solve: a Day-plan panel
showing two group rows side by side (rather than one collapsed block, which is
what a single global schedule would have shown) already states whose day each
row is, because the id is already on the row. The command in section 3 is
what makes editing a row change what the *next* `hud/status-strip` read
reports for that group; no change to the projection's shape, its schema, or
`PROJECTION_IDS` is required. If a future iteration adds a per-group
*editing* mode that needs to know which row is currently open for edit, that
is client-side UI state (which group's editor is expanded), not simulation
state — the same boundary `docs/HUD_PROJECTIONS.md` draws between "state" and
"a panel's own presentation choice."

## 7. What to build first, if accepted

**The smallest honest slice is the full model at the smallest scope: the two
existing groups, one command, no new group added.** This is not "a global
schedule with one group in a trench coat" — the trap the brief names — because
the two groups are not manufactured for this slice; they already exist, are
already independently consulted by `ActionSystem`, and already produce
materially different days (`GENERAL_POPULATION_REGIME`'s ten blocks against
`HIGH_RISK_REGIME`'s three, `regime.ts:104-128`). A player editing
`general-population`'s recreation block leaves `high-risk`'s schedule
untouched from slice 1 onward, which is exactly what "per-group" was ruled to
mean. The trap the ruling actually rejected — one editable day that both
groups share — is not reachable from this design at all, because there is no
code path in it that collapses the two rows into one.

What slice 1 deliberately defers: a third group (a balance/content decision
this ADR's scope excludes, section 1); moving a block boundary (deferred in
section 3, because it reopens the gaplessness proof mid-edit); and the
production-driven benchmark scenario named in section 5, which should exist
before — not instead of — a future group-count increase, since that increase
is the one place this design's cost stops being "the same two-element scan
that already runs today."

## Consequences

**If accepted:** `SAVE_SCHEMA_VERSION` becomes 6, with
`migrateSaveEnvelopeV5ToV6` and its own new test under `tests/migrations/` as
described in section 2; `EditRegimeBlock` is added to
`simulationCommandSchema` with the two refusals in section 3; `findRegimeSchedule`'s
caller becomes a save-restored array rather than the module constant, restored
in `CLASSIFICATION_GROUP_IDS` order per section 4; `benchmarks/scenarios/`
gains the production-driven scenario named in section 5 before any further
group-count increase is proposed; no change to `PROJECTION_IDS` or to
`hud/status-strip`'s schema is needed.

**If rejected in whole or in part:** the regime stays a build-time constant,
the Day-plan section stays read-only, and this document is marked not adopted
rather than deleted, per `docs/AGENT_WORKFLOW.md` §4.

**Touches no server entry point, no `wrangler.jsonc`, no `.github/workflows/`,
no `public/_headers` and no dashboard.** The one owner reservation this
proposal does touch is `supabase/migrations/` only insofar as a future cloud
sync of a V6 save would need `docs/CLOUD_SAVE.md`'s own schema to track the
new section — a question for whoever picks up implementation, not answered
here, and not itself a migration this document asks the owner to write.

## The weakest claim in this document

**That the tick cost is negligible.** Section 5 gives a real reason (the
group count is unchanged, so the same two-element linear scan runs either
way) but no measured number, because the benchmark scenario that would
produce one does not exist yet — naming it is not the same as running it.
What would change my mind: if `findRegimeSchedule` turns out to be called far
more often than `ActionSystem`'s documented reconsideration cadence (for
instance, from a hot path this document did not find), or if a future group
count widens past a handful before the scenario in section 5 is ever built
and run against it.

## References

- [ADR 0032](./0032-incident-consequences-and-classification-review.md) and
  [ADR 0090](./0090-medium-as-a-warning-not-a-skipped-step.md) — the tier/group
  axis this document reuses, and the unused `Medium` tier this document
  declines to promote to a group
- [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md) —
  the terminal-category invariant `allowedCategories.min(1)` protects
- [ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md) — the override
  mechanism (`PrisonerRegimeOverrideResolver`) this document leaves untouched
- [ADR 0110](./0110-what-security-sector-a-room-is-in.md) — the finding that
  exactly one security sector exists in any startable session, which is why
  "wing" is rejected as this document's group axis
- `docs/DETERMINISM.md`, `docs/PERSISTENCE.md`, `docs/PRISONER_OPERATIONS.md`,
  `docs/HUD_PROJECTIONS.md`, `docs/BENCHMARKING.md` — read in full before this
  document was drafted
- [issue #1156](https://github.com/matmaxalez/lockstate/issues/1156) — the
  stage 0 inventory whose finding this document verifies and answers
