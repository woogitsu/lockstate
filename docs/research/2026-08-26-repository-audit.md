# 2026-08-26 — Multidisciplinary repository audit

Ten parallel read-only audits of `main` @ `fcecad2` (**v0.0.108**), one per
discipline, plus a lead verification pass that re-derived the highest-stakes
claims independently. **166 findings.** The per-discipline reports are in
[`./audit-2026-08-26/`](./audit-2026-08-26/) and every finding in them carries a
`file:line` anchor.

This record answers no single open decision, so it does not fit the frame the
[index](./README.md) describes. It is kept for the reason that frame exists: it
is dated evidence, it is read-only history, and it will become older rather than
wrong. Where it contradicts something the project believed, the contradiction is
written down.

## Evidence tiers

The [index](./README.md)'s tiers exist because confidently precise claims failed
disproportionately. This audit inherits them, mapped onto code:

- **CONFIRMED-EXECUTED** — reproduced by running the repository's own modules.
  Four disciplines did this: determinism, persistence and the bug hunt built
  probes outside the tree, and test-quality ran 16 real one-line mutations
  against the full 2,604-test suite.
- **CONFIRMED-READ** — the cited lines were opened and read, and the conclusion
  follows from them without an intermediate assumption.
- **SUSPECTED** — follows from the code but turns on behaviour outside the tree
  (a platform's semantics, a repository setting). Kept as its own tier rather
  than folded upward. Exactly one headline finding sits here and says so.
- **UNKNOWN** — could not be established. Listed in [§8](#8-what-this-audit-did-not-establish).

## Baseline, so findings are separable from container noise

`pnpm typecheck` clean. `pnpm test` **2,628 passed / 1 skipped, 233 files, 37s**.
Every finding below survives that green suite — which is the point of most of them.

Not provisioned here, and therefore excluded from findings by instruction: Git
LFS content (atlas PNGs are 131-byte pointer files, so `pnpm verify:assets` and
the browser image-decode test fail in this container by design), and no coverage
provider (so coverage claims below come from mutation testing and static
reachability, never from a line-coverage number).

## 0. Overtaken between the audit and this merge

The audit ran against `fcecad2` (v0.0.108). Before it merged, `main` advanced four
releases to **v0.0.112**, and two of those commits land directly on findings below.
Recorded here rather than edited into the findings, because the rule this directory
runs on is that *a record does not become wrong, it becomes older* — the findings
say what was true at `fcecad2`, and this section says what has moved since.

- **§2 action 1 (the anchor time-bomb) is resolved.** #401 re-anchored
  `STATUS-QUEUE.md` at v0.0.111 and corrected three claims the delta falsified. At
  v0.0.112 the gate now sits 1 release behind a budget of 10 instead of 10. The
  prediction held — the re-anchor was the work the audit said was owed — and the
  urgency is spent. **Everything in §9 about the process itself still stands**,
  including that the re-anchoring cost another commit of release budget.
- **PRD-01 / Theme B is half resolved, and the better half.** #398 and
  [ADR 0036](../adr/0036-a-derived-default-security-sector.md) added
  `applyDefaultSecuritySector`, called at `new-session.ts:545` and idempotent, which
  seeds **three** of the empty collections — `securitySectors`, `securitySchedules`
  and `incidentSectorIds`. ADR 0036 names the same closed loop this audit found, in
  the same terms, and fixes the exact half that mattered most: deployment, patrol,
  incident triggering and response are now reachable in a session a player can
  start, and the failure-modes record measures a riot firing at tick 15,600. **"No
  incident can ever fire" is overtaken and should not be quoted from this record.**
  ADR 0036 is also explicit that it was accepted by delegation without the owner
  reading it, which is itself §9's subject.
- **What PRD-01 still describes accurately.** Seven `until a session/scenario`
  deferrals remain at v0.0.112, and these stay empty in a new session:
  `searchPolicies` (`:473`), `gangs` (`:515`), `tunnels` (`:516`), `jobs` (`:418`),
  `electricity` and `water` (`:425-426`), and `containers`. So contraband search,
  gangs, tunnels, the job board and both utility networks are still unreachable by
  construction, and Theme B's *pattern* — a tier built ahead of the caller that
  would use it — is unchanged for them.
- **Not re-audited against v0.0.112.** Every other finding was verified at
  `fcecad2` and has not been re-checked against the four new releases. #398 touched
  `new-session.ts`, `session-systems.ts`, `sparse-world.ts` and
  `snapshot-restore-fidelity.test.ts`, so the determinism and persistence findings
  that live in those files are the ones most worth re-confirming before acting.

## 1. Headline verdict

**The engineering tier is unusually strong and the delivery tier is where the
risk is.** That is not a hedge — the two halves are separable, and they are:

The codebase does things most projects this size do not: a faithful `xoshiro128**`
with unbiased rejection sampling, integer-exact needs decay at `NEED_SCALE = 200`,
money as integer minor units with a provably-zero division remainder, 15 systems
with a total `(order, id)` execution sort, route invalidation that compares both
door verdict *and* traversal cost, transitive import-closure gates with vacuity
guards, a test suite that has already been mutation-tested against itself, and
one TODO in 56k LOC. Nine of these were checked specifically because they are the
places such claims usually turn out to be aspirational. They held.

Against that: **nine Critical findings**, and the three most consequential are not
in the simulation at all. One deletes every save a player has. One wedges the
command queue permanently and silently. One makes ~4,100 LOC of built, tested
simulation unreachable in any session a player can start.

**The project already knows the third one.** [`2026-08-26-failure-modes.md`](./2026-08-26-failure-modes.md)
states it precisely — *"'Until a session/scenario registers them' defers to a
caller that has never been written"*. That record is one day old and nothing has
acted on it. That gap between diagnosis and action is the most important pattern
in this audit, and [§3](#3-cross-cutting-themes) is mostly about it.

## 2. Do these five first

Ordered by (player harm or imminence) ÷ effort. Each is small.

| # | Action | Why now | Effort |
| --- | --- | --- | --- |
| 1 | **Move the `STATUS-QUEUE.md` anchor.** *(Done since — see [§0](#0-overtaken-between-the-audit-and-this-merge).)* | The **next merge to `main` turns `pnpm test` red with zero code change.** Anchor v0.0.98, ships v0.0.108, budget 10, assertion `<= 10` — passing at exactly the limit while `version.yml` bumps the patch on every merge. Found independently by two agents; arithmetic re-verified by the lead. | Hours (the test forbids raising the budget, so §§3-6 must be re-read) |
| 2 | **Stop restore failures from deleting saves** (PER-01). | A deterministic code bug currently destroys *all* retained generations, irreversibly. Reproduced 3 → 0 in one load. | Small — classify data-fault vs code-fault; never delete the last generation; quarantine instead of delete |
| 3 | **Fix the command-queue head test** (DET-05). | `kernel.ts:161` uses `!==` on a sorted head, so one past-tick command blocks *every* later command forever, silently. Player input just stops working. | One line, plus a decision on past-tick semantics |
| 4 | **Close the deploy gate** (SEC-01/OPS-02). | Two independent routes publish unreviewed code to the Worker serving public lockstate.io. Fix is two `if` clauses and one dispatch guard. | Small |
| 5 | **Seed a scenario** (PRD-01). | ~10 lines of seed data converts ~4,100 LOC of dormant simulation into playable content. Highest leverage in the audit. Needs an ADR. | Small change, real decision |

## 3. Cross-cutting themes

Four themes each surfaced from **multiple agents that could not see each other's
work**. They are the findings that matter, because each is one cause with many
symptoms — and fixing the symptom list one at a time would be the expensive way.

### Theme A — the pipeline is gated in the middle and open at both ends

For a same-repo pull request, CI is genuinely excellent and *all of it blocks*:
strict typecheck, 2,628 tests, a production build with generated-config
assertions, wrangler dry-runs plus a real workerd preview asserting all nine
ADR 0021 headers, 23 migrations with 287 pgTAP assertions, real-browser Chromium,
each with an explicit anti-vacuous-pass guard, `--frozen-lockfile` everywhere.
No agent found a way for a broken change to merge green through that path.

The holes are at the entry and the exit:

- **Entry** — a fork PR skips all three CI jobs (`ci.yml:28/156/283`, 3 jobs /
  3 guards) and skipped jobs satisfy required checks: fully green, zero gates.
- **Exit** — `deploy.yml:114` gates only on `workflow_run.conclusion`, never on
  `.event` or `.head_repository`, then checks out `workflow_run.head_sha`
  (`:131`) and deploys. Separately, `workflow_dispatch target=staging` publishes
  *any* branch with no verify and no approval (OPS-02). Both land on the Worker
  the repo's own comments say serves the public domain. The deploy path also has
  no LFS materialisation, so shipping real art depends on incidental
  self-hosted-runner workspace state (OPS-01) — and the guard for that already
  exists in `tooling/`, just not on this path.

Reached independently by the security and CI agents from opposite directions.

### Theme B — a large amount of built-but-unwired capability, with one root cause

Nine findings from four agents, none of which was filed as the same finding:
input remapping (UXA-03, no caller — so AGENTS.md boundary 10 is unmet),
localization (UXA-07, `main.ts:827` hard-codes the locale), `reducedMotion`/
`uiScale` (UXA-08, persisted and never read), `TopologyManager` (ARC-08, 447 LOC,
instantiated, never driven), nine of fifteen read models (ARC-09/PRD-02, no
reader — the project asserts this itself), the worker build-id handshake
(ARC-05, dead), the array-buffer transferable transport (PRF-14, unused),
auth (SEC-13, no code at all), clock backlog (PRF-10, exposed, unread).

These are one delivery pattern, not nine bugs: **the simulation and service tiers
are built ahead of the surface that would use them.** The root cause is PRD-01,
and the lead pass found it is stricter than "a seeding layer is missing":

> `new-session.ts:398-478` constructs `securitySchedules`, `searchPolicies`,
> `incidentSectorIds`, contraband, gangs, tunnels and both utility networks
> **empty**, under a convention stated five times — *"no fabricated default
> content … until a session/scenario registers them"*. No file under `src/`
> ever seeds them. The **only** production writer is restore-from-save
> (`session-systems.ts:658-694`), and a save can only carry what a session was
> able to seed — which is nothing. It is a **closed loop**: empty at t=0 and
> provably empty forever. `IncidentTriggerSystem` iterating `incidentSectorIds`
> therefore cannot fire an incident in any reachable state. ~4,100 LOC is
> unreachable *by construction*, not by oversight.

### Theme C — gates that assert bookkeeping rather than behaviour

The project's instinct to make invariants mechanical is right and mostly works.
Five gates do not check what their name implies:

- **No benchmark imports production code** (PRF-16). Verified independently: all
  7 files in `benchmarks/` import only from `benchmarks/` or `node:*`. The suite
  *models* production — a region pass as `ceil(cellCount/4)` — and reports
  1.76 ms where the real modules measure ~23.9 ms/tick. None of the three
  Critical performance findings is observable from CI.
- **`session-component-payload-size`** asserts a documentation counterfactual,
  not a payload bound (PRF-22).
- **The ADR status-queue rule has failed 4 of 7 times** (ARC-06), its own
  diagnosed fix is unimplemented, and `STATUS-QUEUE.md` now makes five mutually
  inconsistent statements about how many decisions are pending (ARC-07).
- **ADR 0021's CSP rationale rests on "no DOM sinks"** — true today, verified,
  enforced by nothing (SEC-06).
- **`security_invoker`** appears in four comments and zero assertions (SEC-05),
  while `challenge_leaderboard` is a plain view that reads its base table as
  owner, bypassing RLS.

Test-quality's mutation run is the measured version of this theme: **7 of 16
one-line mutations survived the full suite (44%)**. Five of the ten
highest-risk behaviours would not go red if silently broken — money conservation
at the boundary, the navigation budget (twice, including `MAX_SAFE_INTEGER`),
projection ordering, and refusal-code pairing.

### Theme D — restore rebuilds the object graph; closures keep the old one

DET-01 (Critical) and DET-03 are the same seam, not two bugs. `kernel.ts:206`
*replaces* `_rng` on restore; `new-session.ts:416` closes over the pre-restore
`rng` binding. So after any load the guard roster draws from an orphaned stream
no snapshot observes, while the kernel draws from the new one — and since
prisoner and guard names share `identity.actor-name`, a continuous run and a
save/load run **diverge in persisted state**. `masterSeed` is absent from
`savePayloadV5Schema` besides, so both production restores take the `= 0`
default and a loaded session's seed is lost.

Any future system that captures a runtime collaborator in a closure at
construction time inherits this. That makes it architectural, and worth an
explicit rule rather than three fixes.

## 4. The nine Critical findings

| ID | Finding | Tier |
| --- | --- | --- |
| **PER-01** | Any restore-time throw **deletes every retained save generation**. `state-machine.ts:557-561` catches *all* exceptions as `snapshot-incompatible`; `session-controller.ts:202-209` demotes; `repository.ts:266` deletes. The controller loops generations and the cause is usually deterministic, so one load takes them all. Compounds with **PER-08**: the repo's own V1 fixture migrates and checksums cleanly, then throws at `entity-store.ts:252` — so loading a legitimate old save destroys every save the player has. | CONFIRMED-EXECUTED (3 → 0), chain re-read by lead |
| **PER-02** | One capture failure **permanently wedges autosave, silently**. `autosave.ts:66,69-79`: `performSave` has no try/catch and is called with bare `void`, so the entry stays `'saving'` and `settle()` never runs. Only evidence is an unhandled rejection. | CONFIRMED-EXECUTED |
| **DET-01** | Orphaned RNG stream after restore → continuous and save/load runs diverge in persisted state (Theme D). | CONFIRMED-EXECUTED |
| **PRF-01** | The work budget bounds *counted* work, not wall clock: shipped `workBudgetPerTick: 2_000` measures **21.7–25.6 ms/tick (worst 76.7)** against a ~3 ms allowance, and the "always process one request" rule let one route consume 65,200 expansions / **1,325 ms**. | CONFIRMED-EXECUTED |
| **PRF-02** | Both A\* and region Dijkstra select the frontier minimum by **linear scan** → O(E·\|frontier\|); 15–20 µs per expansion, rising with search size. A heap is the fix. | CONFIRMED-READ + measured |
| **PRF-03** | No delta channel: the renderer polls **full session snapshots every 2 s** and the main thread deep-walks each through `isJsonValue` — **10.4 ms @500 prisoners, 31.0 ms @5,000**, ~7× `structuredClone` — then re-decodes every chunk's RLE and repaints. | CONFIRMED-EXECUTED |
| **UXA-01** | The only room-zoning surface is a world drag, so a **keyboard-only or screen-reader player cannot zone a room** — and every subsequent Admit is then refused forever. They cannot play. | CONFIRMED-READ |
| **UXA-02** | The Phaser canvas has **no role, label, tabindex or text alternative**; no `aria` anywhere in `src/rendering/**`. The world has zero accessibility-tree representation. | CONFIRMED-READ |
| **PRD-01** | ~4,100 LOC of security/contraband/incidents/operations is **unreachable by construction** (Theme B). Already diagnosed in this directory one day earlier. | CONFIRMED-READ, closed loop re-verified by lead |

`DET-05` is graded High by its agent but the lead pass found it worse than
described and it is in the top five above: because `kernel.ts:161` tests the head
of a **sorted** queue with `!==`, a single past-tick command does not get skipped
— it **blocks every command behind it for the rest of the session**, with no
throw, no refusal and no log.

## 5. Findings by discipline

| Discipline | Crit | High | Med | Low | Info | Total | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Security | 0 | 1 | 4 | 9 | 2 | 16 | [01](./audit-2026-08-26/01-security.md) |
| Determinism & simulation correctness | 1 | 5 | 4 | 3 | 2 | 15 | [02](./audit-2026-08-26/02-determinism.md) |
| Persistence & data integrity | 2 | 4 | 7 | 7 | 0 | 20 | [03](./audit-2026-08-26/03-persistence.md) |
| Architecture & ADR compliance | 0 | 2 | 5 | 6 | 2 | 15 | [04](./audit-2026-08-26/04-architecture.md) |
| Performance & scalability | 3 | 7 | 8 | 3 | 1 | 22 | [05](./audit-2026-08-26/05-performance.md) |
| Frontend, UX, a11y, i18n, input | 2 | 7 | 12 | 7 | 0 | 28 | [06](./audit-2026-08-26/06-frontend-ux-a11y.md) |
| Build, CI/CD, deploy, supply chain | 0 | 2 | 7 | 4 | 1 | 14 | [07](./audit-2026-08-26/07-cicd-supplychain.md) |
| Test quality & coverage | 0 | 4 | 5 | 3 | 1 | 13 | [08](./audit-2026-08-26/08-test-quality.md) |
| Gameplay bug hunt | 0 | 2 | 6 | 5 | 0 | 13 | [09](./audit-2026-08-26/09-bug-hunt.md) |
| Product, features, roadmap | 1 | — | — | — | — | 10 | [10](./audit-2026-08-26/10-product-roadmap.md) |
| **Total** | **9** | **34** | **58** | **47** | **9** | **166** | [lead pass](./audit-2026-08-26/00-lead-verification.md) |

The product report ranks by priority rather than severity, so its rows are not
graded here; PRD-01 is counted as Critical and its other nine are excluded from
the High/Medium/Low columns rather than guessed at.

## 6. Gameplay defects worth naming

The bug hunt found no defect inside `economy/**` itself — money is created and
destroyed only through the materials and room layers. Six of its thirteen were
reproduced against the real modules:

- **BUG-01** — `PlaceBuildOrder` accepts an unknown `definitionId` (plain
  `z.string()`), then throws from `update` for *every* order forever; the bad
  order is persisted, so the **save is permanently bricked**.
- **BUG-02** — cancel or route-failure on the **dropoff** leg silently destroys
  withdrawn stock (10 → 6 bricks, nothing returned), because compensation is
  guarded on `job.leg === 'pickup'`. The pickup case has a dedicated regression
  test; the symmetric dropoff case was never written.
- **BUG-03** — undo across a remove-and-replace deletes the **second** bed the
  player paid for: the revert guard cannot tell two objects on one anchor apart.
- **BUG-05** — removing the last bed leaves capacity 0 with occupancy 1, so state
  income keeps paying **300/day for a room with no surface** (money creation), and
  the room becomes permanently un-unzoneable. ADR 0028 blesses over-capacity
  rooms; ADR 0017's "per occupied place" income was never reconciled with it.
- **BUG-06** — cancelling a built door leaves a stale id in
  `SecuritySectorRegistry` (which has **no removal API**), so the next lockdown
  faults the worker.

The report also contains a **19-site entity-deletion cleanup matrix**, including
two registries with no removal API at all — the systematic version of this class.

## 7. What is genuinely strong

Recorded because a 166-finding list misrepresents this repository if read alone,
and because each item below was checked rather than assumed.

- **The SQL tier is the best-defended part of the system.** RLS swept
  schema-wide, revoke-then-grant per column, every `SECURITY DEFINER` function
  pinning `search_path` with `pg_temp` last and re-checking `auth.uid()`,
  advisory locks instead of look-then-insert, an append-only ledger, and ambient
  `TRUNCATE`/`REFERENCES`/`TRIGGER` revoked *and* removed from default privileges.
- **The secret gate works on the class, not the instance** —
  `check-deploy-secrets.sh` sweeps for `VITE_`-prefixed variables and decodes JWT
  role claims in `dist/`. Zero `import.meta.env` in the client bundle.
- **The CSP is measured against the real bundle, asserted against a real workerd
  response in CI, and reverse-included by a foundation test.**
- **Determinism holds where it is hardest.** Verified, not assumed: the
  `xoshiro128**` implementation including the `rotl`/ToUint32 subtleties and
  unbiased `nextInt` rejection sampling; integer-exact needs decay; integer money;
  total A\*/Dijkstra tie-breaks; and route invalidation comparing both door
  verdict and traversal cost — the stale-route hazard the determinism agent went
  hunting for specifically, and did not find.
- **The boundary gates are real.** Zero value-import cycles across 197 files;
  gates built with vacuity guards, three-direction allow-list failure, and a
  type-only-vs-value distinction, validated against real exports. Verdict on
  AGENTS.md's 10 architectural boundaries: **7 upheld, 3 partial, 0 violated.**
  `src/simulation/presentation/` is a correct worker-side projection layer, not
  the violation it looks like from the directory name.
- **The test suite has already been mutation-tested against itself** —
  `tests/helpers/field-sensitivity.ts` encodes the #264 lesson as a general
  anti-tautology device. The weak-assertion sweep came back unusually clean: **0
  `expect(true)`, 0 snapshot tests, 0 empty bodies.** The 400-tick/28-surface
  replay fingerprint and the 40-seed A\*-vs-Dijkstra differential are real
  property testing. The defects are the surviving mutations, not the style.
- **Write atomicity is correct in real Chromium** — one transaction,
  synchronous handler attachment, explicit abort-on-throw, checksum-at-declared-
  version ordering, frozen historical schemas, and a `WeakSet`-backed trusted-
  envelope brand.
- **Rendering has the parts that are hard to retrofit**: `ActorLayer` pools and
  culls with zero per-frame allocation, `TileLayer` caches per chunk and row with
  run-merged fills, and the UI layer has no `innerHTML`, no per-frame DOM and no
  listener leaks.
- **108 contiguous release tags with a race-safe atomic bump**, SHA-pinned
  first-party-only actions, zero script-injection surface, byte-for-byte
  reproducible builds, exact pins with integrity on all 196 packages, and
  `allowBuilds` verified to be exactly the two packages with real postinstalls.
- **The bidirectional reachability-contract test family is an original idea that
  works.** It is why several Critical findings above are things the project had
  already written down precisely. A codebase that can locate its own dead ends is
  worth more than one with fewer of them.
- **One TODO in 56k LOC**, 7 `as any`, 2 `: any`, zero `@ts-ignore`, and a
  consistent refusal to fabricate: no invented clock face, no defaulted facing,
  demo actors behind an opt-in flag.

## 8. What this audit did not establish

Named because the [index](./README.md) requires the weakest claim to be named,
and because the confidently precise claims are the ones that fail.

- **The weakest headline claim is SEC-01.** Every link is CONFIRMED-READ — CI
  runs on fork PRs, all 3 jobs skip, the gate omits `.event` and
  `.head_repository`, the checkout takes `head_sha`, the target serves the public
  domain — except one: whether GitHub reports `workflow_run.conclusion` as
  `skipped` or `success` for an all-jobs-skipped run. That single value decides
  whether this is exploitable today or merely one unguarded CI job away.
  **What would change my mind:** a throwaway repository reproducing the event
  shape. Reported as High-latent rather than Critical for exactly that reason —
  and worth fixing either way, because the mitigation is accidental, undocumented
  and external to this tree. A GitHub Environment protection rule on `staging`
  may also block it; that is repo-settings state, invisible here.
- **Performance figures are indicative, not target-hardware.** Measured in Node
  in this container, not in a browser on a player's machine. The *complexity*
  claims (PRF-02, PRF-06, PRF-08, PRF-09) do not depend on the timings; the
  millisecond numbers do.
- **Trajectory claims are bounded by a shallow clone** — 50 commits from
  v0.0.85. Release cadence and recent-work conclusions hold; anything about
  earlier history was not checked.
- **No line-coverage number exists** for this tree. Coverage statements come from
  16 executed mutations and a static import-reachability map of 296 modules.
- **The Blender pipeline determinism claim is verified on no machine** — the one
  skipped test is correctly environment-gated, but no CI workflow provisions
  Blender (TST-08).
- **Not covered at all:** sound/audio (none exists), any live Supabase project's
  actual settings versus `config.toml`, real-device touch testing, and load
  testing against the hosted Worker.

## 9. The process finding

Stated plainly because two agents reached it independently and the repository's
own text is the strongest evidence.

`docs/adr/STATUS-QUEUE.md` is 87 KB. Its rule has failed **4 of 7 times**. Its
own diagnosed fix is unimplemented. It now makes five mutually inconsistent
statements about how many decisions are pending, two of its §5 code counts are
stale (commands 11 → **13**, `HudIntent` 16 → **18**), and its staleness gate
breaks on the next merge. Its own text reads: the queue rule *"has now failed
more often than it has worked"* and *"the fix is structural and it is now
overdue."* Two of the last 24 feature commits were spent re-anchoring it.

**The ADRs themselves are good and worth keeping.** The bookkeeping tier around
them has become net overhead, and it is now consuming the release budget it was
meant to protect.

One change would be worth more than any single fix above — add to AGENTS.md's
definition of done:

> **A feature is not done until a player in a fresh session can cause it.**

The `tests/foundation` gates ask *"does a route exist?"*, not *"does a player
reach it?"*. Theme B is the whole cost of that distinction: nine unwired
surfaces, ~4,100 unreachable lines, and a simulation that cannot fire an
incident — all of it green, all of it tested, none of it reachable.
