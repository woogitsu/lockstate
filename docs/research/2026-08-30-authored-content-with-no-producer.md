# Authored content with no producer. Measured on `cd2c7c5`, v0.0.236

**Date:** 2026-08-30
**Tree:** `cd2c7c5` (`chore(release): v0.0.236`), branch `agent/642-dead-content`
**Question put to this record:**
[#642](https://github.com/matmaxalez/lockstate/issues/642) — `gang-retaliation`
is authored, wired and can never fire, because it needs `GangRegistry` entries
nothing in `src/` creates. The issue declines to say which of two things that
is, and says so explicitly: *"whoever picks this up should settle that first,
because the two answers point opposite ways."*

- **A producer is missing** → build it; the incident becomes reachable.
- **Gangs were removed** → delete the incident, the registry and the trigger
  branch.

**Answer: a producer is missing. Gangs were never removed, and there is no
design change to find.** Both halves — the `IncidentType` member and the
registry it reads — arrived in **one commit**, `31c51ef`, on 2026-08-23, and
that commit's own message says the registry was left empty on purpose. Nothing
has ever populated it, on any branch, in any commit.

**No file under `src/` was modified.** Deleting the incident and building a
gang subsystem are both the owner's call under `AGENTS.md`, and this record is
the deliverable.

---

## 0. Tiers, and how to read this record

Following `docs/research/README.md`:

- **VERIFIED** — the file was opened at the cited line and the line is quoted,
  or the command was run in this worktree and its output pasted.
- **DERIVED** — a conclusion drawn from VERIFIED facts, stated so the step can
  be checked separately from the facts.
- **UNKNOWN** — could not be established.

Every `file:line` below was opened. Line numbers are against `cd2c7c5`; per
`docs/AGENT_WORKFLOW.md` §4, code is cited by `file:line` because grep checks
it, and the load-bearing ones are quoted so the quote survives the line moving.

---

## 1. The issue's own citation, opened — VERIFIED, and it is off by one layer

#642 cites `src/simulation/incidents/trigger-system.ts:211-214` as the place
that *"gates the `gang-retaliation` incident on entries in `GangRegistry`"*.
Those four lines are **the class docblock**, not the gate:

```
211  * three producers would let whichever fired first silence the other two.
212  * `'gang-retaliation'` still has no producer of its own -- it needs
213  * `GangRegistry` entries nothing in `src/` writes -- and that is the one member
214  * of the union ADR 0061 did not reach.
```

This does not weaken the issue — it strengthens it. **The finding was already
written into the code, by the author of the code, as a known gap.** The issue
found the sentence that admits it and read it as the gate.

The actual gate is `tryOpenRetaliation`, at
`src/simulation/incidents/trigger-system.ts:510`:

```ts
  private tryOpenRetaliation(sectorId: string, tick: number): void {
    const claimants = this.gangs.gangsClaiming(sectorId);
    for (const offendedGangId of claimants) {
      for (const [offended, offending] of this.gangs.allGrudges()) {
```

Both loops are over `GangRegistry` contents. With no gang defined, `claimants`
is empty and the outer loop body never runs; the incident is constructed at
`:522` (`type: 'gang-retaliation',`) and that line is unreachable.

The same correction applies to the issue's second citation, and there it is a
plain off-by-one: `hud.build.note` is keyed at `src/ui/hud/messages.ts:**157**`
(`buildNote: 'hud.build.note',`), not `:156`, which is `buildSubmit`. The
locale entry at `src/content/default-locale-en.ts:519` is exactly where the
issue says.

---

## 2. Settling #642: the two halves arrived together — VERIFIED

`git log -S` on each half, over all refs:

```
$ git log --oneline -S 'GangRegistry' --all -- src/ | tail -1
31c51ef Build incident pipeline for violence, escapes, riots, gangs and response (#28)

$ git log --oneline -S "gang-retaliation" --all | tail -1
31c51ef Build incident pipeline for violence, escapes, riots, gangs and response (#28)
```

`31c51ef`, authored 2026-08-23, is the **earliest** commit touching either
string, and it is the same commit for both. `git log --all --diff-filter=D --
src/simulation/incidents/gangs.ts` returns nothing: the file has never been
deleted on any branch.

So the two halves did not arrive apart, and neither was left behind by the
other's removal. That eliminates the second shape on its own.

### 2.1 The commit says why, in its own message — VERIFIED

`31c51ef`'s message describes the gang model and then states the wiring:

> `GangRegistry` + `resolveRetaliationRisk`: lightweight membership/territory/
> reputation/directional grudges, deterministically ordered throughout,
> feeding the existing trigger path. Acted-on grudges are cleared.

> Wired into createNewSimulationRuntime **with no fabricated content (asserted
> directly)**; docs/INCIDENTS.md covers the full design.

Emphasis added. The empty registry is not an oversight the commit failed to
notice — it is a property the commit **asserts**, and the assertion is still
green today at `tests/unit/new-session-runtime.test.ts:123`:

```ts
test('new-session runtime starts with no fabricated incident, gang or contraband content', () => {
```
```ts
  expect(runtime.gangs.all()).toEqual([]);
```

`src/simulation/runtime/new-session.ts:843` carries the same convention as a
comment beside the construction:

```
  // Issue #28's incident pipeline: no gangs, no tunnels and no incidents until
  // a session/scenario registers them -- same "no fabricated default content"
  // convention as everything above.
```

### 2.2 Issue #28 scoped the model in and the producer out — VERIFIED

[#28](https://github.com/matmaxalez/lockstate/issues/28) is the issue `31c51ef`
closes. Its **In scope** list contains *"Lightweight gang membership/territory/
reputation/retaliation model"* — the model. Its **Dependencies** list names
*"Issue #39 traits/relationships for richer social outcomes; base model must
function before it."* Its acceptance criterion is about *scoring*, not about
population: *"Gang membership/territory/retaliation alters risk/action scoring
without nondeterministic iteration"* — which the trigger path does satisfy,
against gangs a test supplies.

[#39](https://github.com/matmaxalez/lockstate/issues/39) is **open** and
unstarted. Its own In scope list contains *"Modifier integration with utility
AI, staff job performance/training, gang/informant/incident and rehabilitation
systems"*, and its acceptance criteria contain *"Gang/informant/mentorship/
rivalry hooks can use the relationship contract."*

**DERIVED.** The thing that decides *who is in which gang and who wronged whom*
was never in #28's scope. It was deferred to #39 in #28's own dependency list,
on 2026-08-22, before a line of `31c51ef` was written. #39 has not been picked
up.

### 2.3 ADR 0061 reached the other three and said so — VERIFIED

[ADR 0061](../adr/0061-what-the-prison-produces-on-its-own.md) is the decision
that gave `'assault'` and `'escape-attempt'` producers, and it names the
remainder in decision 5 at `docs/adr/0061-what-the-prison-produces-on-its-own.md:377`:

> 5. **`'gang-retaliation'` still has no producer**, and is now the only member
>    of the union without one. It needs `GangRegistry` entries nothing in `src/`
>    writes, which is a relationship model (#39) rather than a trigger.

The three `IncidentLog.open` call sites that do exist are all in
`trigger-system.ts` — `type: 'escape-attempt'` at `:357`, `type: 'assault'` at
`:426`, `type: 'riot'` at `:497` — beside the unreachable `:522`.

### 2.4 What this settles, and what it does not

**Settled (VERIFIED, no ambiguity):** `gang-retaliation` is shape **A**. The
registry and the incident are the delivered half of #28; the producer is
#39's, and #39 is open. There is no design change that dropped gangs, no
commit that removed a producer, and no branch that ever had one.

**Not settled, and not this record's to settle:** *what a gang is* — how a
prisoner joins one, what creates a grudge, whether a gang survives its
members' release. #28 put final gang diplomacy out of scope and #39 has not
been designed. That is an ADR, and `AGENTS.md` forbids self-approving one.

---

## 3. The sweep: other authored content with no producer

The class asked for is **content that exists and has nothing to bring it into
being** — distinct from the inventory carried by branch
`agent/632-unreachable-thresholds` (PR #643), *What a classification can
reach*, which is about **values no input can reach** through arithmetic that
does run. Nothing here overlaps it: no threshold, range or balance constant
appears below.

That record is deliberately named rather than linked. It is not on `main` at
`cd2c7c5`, and `tests/foundation/documentation-links-contract.test.ts` refuses
a rooted path to a file that is not on disk — correctly, since a pointer to a
file that is not there is the defect that test exists for. Once the branch
merges, the link is `./2026-08-30-what-a-classification-can-reach.md`.

### 3.1 Method

Three passes, all run in this worktree:

1. **Locale keys with no reader.** All 387 keys in `default-locale-en.ts`
   grepped for as string literals across `src/`, then — because a key is
   normally referenced through a map field, not literally — all 184
   `HUD_MESSAGE_KEY` fields grepped for as `.field` across `src/`.
2. **Enum members with no producer.** All 42 groups in
   `SIMULATION_ENUM_GROUPS` (`src/content/simulation-message-keys.ts:105`),
   every member checked for a construction site outside its declaring module,
   the message-key module, the locale and the projection catalogue.
3. **Registries with no writer.** Every `new X(...)` in
   `createNewSimulationRuntime`, resolved to its class, every public mutator
   (`add*`, `register*`, `introduce*`, `record*`, `open*`, `begin*`, `start*`,
   `set*Owned`, …) checked for a caller anywhere in `src/`.

Pass 2 returned **nothing new** — that is a real result and worth stating.
`incident-type` is the only enum in the catalogue with a member lacking a
producer, and that member is `gang-retaliation`. Passes 1 and 3 found the
items below.

### 3.2 Inventory

Shapes, as #642 defines them:

- **A — producer missing.** The content was authored; the thing that would
  create it was never written.
- **B — consumer removed.** The content was reachable once; the code that read
  or rendered it was deleted and the content stayed.

| # | Item | `file:line` | Shape | Producer's status |
| --- | --- | --- | --- | --- |
| 1 | `'gang-retaliation'` + `GangRegistry` | `src/simulation/incidents/incident.ts:6`; gate `src/simulation/incidents/trigger-system.ts:510`, constructed `:522`; `src/simulation/incidents/gangs.ts:37` (`addMember`), `:86` (`addGrudge`); constructed empty `src/simulation/runtime/new-session.ts:458` | **A** | Deferred to [#39](https://github.com/matmaxalez/lockstate/issues/39) by [#28](https://github.com/matmaxalez/lockstate/issues/28)'s dependency list. Open. |
| 2 | `TunnelRegistry` | `src/simulation/incidents/escape.ts:19`, `start` at `:22`, `advance` at `:27`; constructed empty `src/simulation/runtime/new-session.ts:855` | **A** | None named. `src/simulation/incidents/flashpoint.ts:213` states it: *"`TunnelRegistry` has no producer."* |
| 3 | `resolveEscapeOpportunity` | `src/simulation/incidents/escape.ts:76` | **A** | No caller in `src/`. Superseded rather than forgotten: ADR 0061's escape producer (`trigger-system.ts:357`) reads `PrisonerFlashpointSampler` instead, for the reason `flashpoint.ts:209-212` gives — the derived sector has no doors, so this function *"scores 0 for every prison in this repository"*. |
| 4 | `summarizeIncidents` | `src/simulation/incidents/incident-summary.ts:50` | **A** | No caller in `src/`. Its own docblock (`:7-14`) records that its file-mate `toIncidentAlert` was **deleted** in #555 for the same absence. |
| 5 | **Both utility networks** | `src/simulation/operations/utility-network.ts:40` (`addNode`), `:47` (`connect`), `:57` (`setFailed`), `:101` (`evaluate`); constructed `src/simulation/runtime/new-session.ts:657-658` | **A** | **No caller in `src/` for any of the four**, and none in any commit on any branch — `git log --all -S '.addNode(' -- src/` returns nothing. Snapshotted (`session-systems.ts:586-587`) and restored (`:819-820`), permanently empty. |
| 6 | **Parcels and the land-purchase economy** | `src/simulation/world/sparse-world.ts:521` (`registerParcel`), `:550` (`setParcelOwned`), `:621` (`canPurchaseParcel`), `:630` (`getParcelPrice`); hooks `src/simulation/world/parcel.ts:142`, `:167` | **A** | No caller in `src/` for any of the four methods, except `registerParcel` from `SparseWorld.fromSnapshot` at `:763`. Already stated at `src/simulation/world/tile-ownership.ts:17-19`: *"the only `registerParcel` call site there is `SparseWorld.fromSnapshot` re-registering what a save carried."* `git log --all -S 'setParcelOwned' -- src/` names only `a71c955`, the commit that declared it. |
| 7 | `'medical-supply'` capability | declared `src/content/object-catalog.ts:111` on `object.medicine-cabinet` | **A** | Zero occurrences anywhere else in `src/`. The player can build the cabinet; the capability gates nothing. |
| 8 | `hud.build.note` | `src/content/default-locale-en.ts:519`, keyed `src/ui/hud/messages.ts:157` | **B** | Its renderer was **deleted**: `67e366e` (2026-08-23, #74) removed the only call site, `children: [submit.element, eyebrowText(t(HUD_MESSAGE_KEY.buildNote), 'hud-build__note')]`. |

**Item 8 is the shape #642 guessed for item 1, and it is the only one that is.**
The issue put the two findings side by side as *"the same class"*; they are the
same *class* — authored content with nothing bringing it to the player — but
the opposite *shape*. That is worth having established, because the remedies
differ: a producer that was never written is a design question, and a renderer
that was deleted is a deletion someone did not finish.

### 3.3 One group that looks like this and is not — VERIFIED

Four object capabilities — `'item-storage'`, `'delivery-access'`,
`'waste-disposal'`, `'utility-control'` — are consumed by nothing. They are
**not** reported above, because
`src/simulation/construction/definition.ts:588-598` already records them as a
deliberate, argued position:

> **Four of the five capabilities here are gated by nothing**, and that is
> this group's honest summary rather than a defect in it. […] The systems that
> would consume them are a security-deployment system, #99's salvage
> destination, ADR 0017's procurement route, and a maintenance job system --
> none of which exists. A room a player can finish and see reported as
> complete is what this phase owes them; the behaviour is owed by those
> systems.

That passage names five capabilities and calls four of them ungated; the fifth,
`'surveillance'`, does have consumers. `'medical-supply'` (item 7) is **not**
in that list — it belongs to the medical group, not the security/logistics/
utility group the passage is about — which is why it is reported and these are
not.

### 3.4 The mechanism behind items 1, 2, 3 and 4 — DERIVED

All four say some version of *"until a session or scenario registers them"*.
`docs/research/README.md` already carries the finding, added 2026-08-26 from
the failure-modes record:

> **"Until a session/scenario registers them" defers to a caller that has never
> been written.** There is no scenario type, class or module under `src/` at
> all.

**That is still true on `cd2c7c5`**, re-checked here rather than taken:
`find src -iname "*scenario*"` returns nothing, and no `class Scenario`,
`interface Scenario` or `type Scenario` exists in `src/`. The word appears only
in prose.

ADR 0061 is the precedent for what happens when the deferral is abandoned: for
contraband it stopped waiting for a scenario and derived a producer from real
state instead. `ContrabandRegistry.introduce` — which ADR 0061 §2 records as
having *"no caller in `src/`"* — now has two, at
`src/simulation/contraband/introduction.ts:241` and
`src/simulation/prisoners/intake-system.ts:502`. **Items 1–4 are what that pass
did not reach**, and items 5 and 6 are the same deferral in `operations/` and
`world/`, which no pass has reached at all.

---

## 4. What this record does not propose

It proposes nothing, deliberately. Every route out of item 1 is one of the four
things `AGENTS.md` keeps for the owner, or needs an ADR this record may not
self-approve:

- **Building a gang producer** is a new simulation subsystem and needs a
  decision about what a gang is first (#39, open, undesigned).
- **Deleting the incident, the registry and the branch** removes live-looking
  content, which #642 itself says is not to be picked inside implementation
  code.

There is a **third option this record raises without recommending**, because
the repository has already taken it once and the precedent is item 4's own
neighbour: `toIncidentAlert` was deleted in #555 after it was established that
it had never had a caller. If the owner's answer to item 1 is "later, not
never", the honest intermediate is neither building nor deleting — it is that
*something a player is told exists should not count as shipped*. That is a
product question, and the copy would be the owner's.

Items 5 and 6 are larger than #642 and are handed over rather than folded in:
two utility networks and a land-purchase economy are in the save format and in
nobody's issue. They should get issues of their own.

---

## 5. What could not be established — UNKNOWN

- **Whether a gang producer was ever designed and discarded before `31c51ef`.**
  Absence in git is absence from git. Design conversation that never reached a
  commit or an issue is not readable from this repository, and
  `docs/AGENT_WORKFLOW.md` §3 says to say so rather than to infer it.
- **What items 5 and 6 cost.** Both are dead weight in the snapshot format and
  in the typechecked surface; neither has been measured, and no claim is made
  that either is a defect. Following `docs/AGENT_WORKFLOW.md` §3 — *"a
  measurement is not a diagnosis"* — this record states the absence and stops.

---

## 6. My weakest claim

**The weakest claim in this record is §3's completeness — that the inventory in
§3.2 is the whole of this class, rather than the part three greps could see.**

The settled answer in §2 is not the weak part: it rests on one commit hash, one
commit message, two issue bodies and a test that still runs, and any of those
would refute it if it were wrong. The sweep is weaker, and the reason is
mechanical. All three passes look for a **name** — a literal, a field access, a
method call. Content reached through a computed key, a dynamic dispatch, an
index into an array, or a name my regexes did not shape correctly is invisible
to all three. Pass 2 in particular produced a large false-positive list that I
filtered by hand, and a hand filter can drop a true positive as easily as a
false one.

**Three things would change my mind:**

1. **A producer reached indirectly.** If anything populates `GangRegistry`,
   `TunnelRegistry` or either `UtilityNetwork` through a path that does not
   name the method — a snapshot fixture treated as default content, a
   command handler that spreads an object into a registry — then item 1's
   "never" is wrong and so is the whole shape-A finding. I looked for
   `loadSnapshot` callers specifically and found only the restore path
   (`session-systems.ts:865`, `:819-820`), which is why I believe it; I did
   not exhaustively trace every object spread in `src/`.
2. **A ninth item found by a different instrument.** The right instrument is
   not grep — it is a reachability contract of the kind this repository
   already builds (`tests/foundation/message-kind-reachability-contract.test.ts`,
   `projection-reachability-contract.test.ts`,
   `fault-code-reachability-contract.test.ts`,
   `content-validation-reachability-contract.test.ts`). Four such gates exist
   and none of them covers registry population. If someone writes that gate,
   its first run is the real inventory and this table is a draft of it.
3. **The owner saying gangs were dropped in conversation.** §2 is an argument
   from git and from two issue bodies. If the design change happened and was
   never written down, git cannot see it, and the owner's word would overturn
   §2 outright.

On item 1 specifically I would need (1) to be wrong to be wrong, and I think
(1) is unlikely — the code, the commit message, the test, the ADR and the
docblock all say the same thing independently. On §3.2 as a *complete* list I
would not be surprised to be shown a ninth item.
