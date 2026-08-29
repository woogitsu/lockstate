# ADR 0073: Who orders a contraband search

> **0073 was assigned centrally**, by the integrator, before this draft existed —
> the practice `docs/AGENT_WORKFLOW.md` records and the one ADRs 0064 and 0069
> followed. The branch sweep was **performed rather than asserted**, which is the
> distinction this index's history gained today: `max + 1` off `main` is 0070, and
> 0070, 0071 and 0072 are all held on unmerged branches a worktree cannot see —
> 0070 by `agent/533-dismiss-staff`, 0071 by `agent/532-kitchen-and-yard`, 0072
> reserved for the events-persistence decision. Earlier today the integrator told
> an agent that sweep had been run when only `main` had been read, and a second
> 0070 was one commit from landing. So this number is **not** `max + 1`, and that
> is deliberate: 0073 is the first free number above every held one. Recompute at
> commit time and you will get 0070; take 0073 anyway.
>
> 0073 is the new maximum, so it moves the **Next free number** line to 0074.
> 0070, 0071 and 0072 will each land *below* that maximum and will not move it
> again — the same arithmetic 0059 and 0061 demonstrated.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It answers [issue #552](https://github.com/matmaxalez/lockstate/issues/552),
which reports that the status strip's **Contraband** figure can never move in a
player's game. The decision this document asks for is a **gameplay direction**,
not an implementation detail, which is why it is proposed rather than taken:
`AGENTS.md`'s standing mandate keeps any *new player-visible promise* on the
owner's side, and every option below is one.

## Context

### What the code has

The search machinery is **complete and carefully built.** `SearchSystem`
(`src/simulation/contraband/search-system.ts`) has all of:

- a queue that holds an order until enough unassigned guards exist, so a search
  *consumes staffing and time* rather than resolving instantly;
- real travel, through the real `NavigationSystem`, then `dwellTicksPerTarget`
  spent at each target;
- detection through `resolveDetectionProbability` — a pure function of
  `baseDetectionProbability`, the category's concealment, and an intelligence
  bonus — drawn against a **named RNG stream**;
- confiscation records naming the guard who found each item;
- snapshot/restore, with `activeJobsInCanonicalOrder` sorting by order id
  precisely so a save/restore round trip cannot re-order the detection draws and
  silently change what a search finds (ADR 0009).

`SearchPolicyDefinition` (`src/simulation/contraband/search-policy.ts`) carries
six tuning fields per scope, and `SearchScope` is the four issue #27 names:
`'person' | 'cell' | 'sector' | 'delivery'`.

### What is missing, and it is exactly two things

**1. There are no policies.** `src/simulation/runtime/new-session.ts:749` is

```ts
const searchPolicies: SearchPolicyDefinition[] = [];
```

Nothing in `src/` pushes to it; only the restore path copies a save's own, itself
empty. `SearchSystem.findPolicy` throws
`No search policy defined for scope "…"` on an empty list, so the first search
ever ordered would throw rather than run.

**2. Nothing orders a search.** `SearchSystem.submitOrder` has **no caller
anywhere in `src/`.** Every other `submitOrder` in the tree belongs to
`ConstructionSystem` or `ObjectPlacementService`. There is no search control in
the HUD either.

### The consequence a player sees

Contraband **is** introduced — 10% per admission at risk tier 0, 20% at tier 1
(`src/simulation/contraband/introduction.ts:99`). Over twelve admissions one or
two carriers would be expected.

The strip's figure is not how much contraband exists;
`src/simulation/presentation/status-strip-projection.ts:471` sets
`contrabandDiscovered` from `searchSystem.getMetrics().itemsDiscovered`, and its
own comment says *"Cumulative items found by searches this session."* Searches
never happen, so the number is structurally pinned at 0. Measured in play: twelve
admissions, sixteen in-game days, zero guards, `"Contraband":"0"` on every sample
from t+20 s to t+400 s.

### A correction to issue #552, made before it could become an assumption

#552 suggests there is *"already an `'on-search'` deployment phase waiting for
one"*. **That is wrong and is withdrawn here.** `'on-search'` is a
`DeploymentPhase` a guard is *in while searching* — an effect the search system
produces (`deployment-system.ts`, `security-projection.ts:167`) — not a schedule
slot that triggers a search. There is **no** existing scheduling hook. Every
option below therefore needs new wiring; none of them is "connect the thing that
is already there".

## Decision

**Both parts below are proposed; the second depends on the first.**

### Part 1 — four default search policies, always

Ship a `DEFAULT_SEARCH_POLICIES` for the four scopes from `new-session.ts`, the
same place `DeploymentSchedule` comes from and the place
`SearchPolicyDefinition`'s own docblock names (*"Session/scenario-provided data,
not a Zod content catalog"*).

This is **not** optional under any of the options below, and it is worth doing
even if the owner rejects everything else: an empty policy list makes a
documented public method throw on every path that reaches it. That is a latent
crash, not a balance question.

### Part 2 — who orders one. Three options, and a recommendation.

**Option A — a standing guard duty.** Guards on post search their own sector on
a cadence. No new UI, no new copy, no panel height — which matters, because
`.hud-rooms` had **0px** of spare height at 900×600 and the last block added to a
HUD panel put it 54px outside its own box.

*Against:* it makes `intelligenceConfidenceBonus` nearly decorative. That field
scales detection by *"the strongest matching intelligence record's confidence for
the target being searched"*, which only pays off if something chooses **which**
target to search. A blanket sweep searches everything anyway.

**Option B — the player orders a targeted search.** A control in the Security
tab: search this cell, this person, or sweep this sector. The queue's
"waits for unassigned guards" behaviour becomes a real staffing decision the
player makes, and intelligence becomes what tells them where to look.

*Against:* new copy, a new control, and a new command across the worker boundary.
It is the largest of the three.

**Option C — both.** A low-rate standing duty so contraband is findable without
the player knowing to look, plus targeted orders for when they do.

**Recommended: A first, then B — which is C reached in two shippable steps.**

The reasoning is about what each step buys per unit of risk. **A alone closes
#552**: the counter moves, contraband becomes findable, and the whole
detection/confiscation/intelligence machine runs in a real game for the first
time — with no player-visible promise beyond a number that starts working. That
is the cheapest possible way to find out whether the tuning is any good, and the
tuning is six numbers per scope that nobody has ever watched run.

**B should not be built before A has been played**, because B's whole value is
letting the player spend guards deliberately, and nobody yet knows what a search
costs in practice — how long a sector sweep ties up a guard, how often detection
succeeds at the shipped concealment values, whether a prison with one guard can
afford one at all. Those are measurements A produces and B needs.

## Consequences

- The Contraband figure starts moving, so #552's headline symptom closes under
  Part 1 plus Option A.
- Guards acquire a second call on their time. `DEFAULT_SECTOR_RISK_POLICY`
  weights `staffingShortfallWeight` at 0.3, so a guard away searching is a guard
  not suppressing riot pressure. **This is a real balance coupling and it is
  stated rather than discovered**: the measured difference between one guard and
  none in an eight-prisoner prison is 0.4824 against 0.7979 on a 0.65 threshold.
  A search cadence tuned too high turns "hire one guard" into "hire one guard who
  is never there".
- The four policies enter the save through the existing
  `save-schema.ts:797` array, which already carries them. **No format change and
  no migration** — a restored prison keeps the policies it was saved with, which
  is also how a future re-tuning reaches only new prisons.
- Nothing here widens the reachable contraband set. Drugs need risk tier 2 and
  weapons tier 3, and `src/main.ts` pins `priorIncidents: 0`, so tiers `[0,1]`
  and therefore currency, phone and tool remain the whole reachable catalogue.
  That is a separate question and this document does not touch it.

## Options considered and not taken

**Leave it.** The strip would go on showing a number that cannot change. #552's
own framing is right that this is worse than showing nothing: a figure pinned at
0 reads as "your prison is clean", which is a claim the code cannot support.

**Remove the Contraband figure from the strip instead.** Honest, and cheaper than
any option above. Rejected because the machinery behind it is finished and good —
removing the readout would be deleting the only sign of a subsystem that works,
rather than the subsystem that does not.

**Search on admission only.** Narrow, needs no policy for three of four scopes,
and would make intake the one place contraband is caught. Rejected because it
makes concealment and intelligence dead weight and turns a system with four
scopes into one with one.
